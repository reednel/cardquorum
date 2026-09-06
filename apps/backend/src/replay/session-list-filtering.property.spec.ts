import * as fc from 'fast-check';
import {
  type GameEventRepository,
  type GameParticipantRepository,
  type GameSessionRepository,
  type UserRepository,
} from '@cardquorum/db';
import { ReplayService, type SessionListOptions } from './replay.service';

describe('Session list filtering', () => {
  const TERMINAL_STATUSES = ['finished', 'abandoned', 'cancelled', 'aborted'] as const;
  const NON_TERMINAL_STATUSES = ['waiting', 'active'] as const;
  const ALL_STATUSES = [...TERMINAL_STATUSES, ...NON_TERMINAL_STATUSES] as const;
  const GAME_TYPES = ['sheepshead', 'euchre', 'hearts', 'spades'] as const;

  type SessionStatus = (typeof ALL_STATUSES)[number];
  type GameType = (typeof GAME_TYPES)[number];

  interface MockSession {
    id: number;
    roomId: number | null;
    gameType: GameType;
    status: SessionStatus;
    config: unknown;
    store: unknown;
    startedAt: Date | null;
    finishedAt: Date | null;
    createdAt: Date;
    roomName: string | null;
  }

  interface RawSession {
    id: number;
    roomId: number | null;
    gameType: GameType;
    status: SessionStatus;
    config: unknown;
    store: null;
    startedAtMs: number | null;
    finishedAtMs: number | null;
    createdAtMs: number;
    roomName: string | null;
  }

  const sessionArb: fc.Arbitrary<RawSession> = fc.record({
    id: fc.integer({ min: 1, max: 100000 }),
    roomId: fc.option(fc.integer({ min: 1, max: 1000 }), { nil: null }),
    gameType: fc.constantFrom(...GAME_TYPES),
    status: fc.constantFrom(...ALL_STATUSES),
    config: fc.constant({}),
    store: fc.constant(null),
    startedAtMs: fc.option(fc.integer({ min: 1577836800000, max: 1767225600000 }), { nil: null }),
    finishedAtMs: fc.option(fc.integer({ min: 1577836800000, max: 1767225600000 }), { nil: null }),
    createdAtMs: fc.integer({ min: 1577836800000, max: 1767225600000 }),
    roomName: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: null }),
  }) as fc.Arbitrary<RawSession>;

  function toMockSession(raw: RawSession): MockSession {
    return {
      id: raw.id,
      roomId: raw.roomId,
      gameType: raw.gameType,
      status: raw.status,
      config: raw.config,
      store: raw.store,
      startedAt: raw.startedAtMs != null ? new Date(raw.startedAtMs) : null,
      finishedAt: raw.finishedAtMs != null ? new Date(raw.finishedAtMs) : null,
      createdAt: new Date(raw.createdAtMs),
      roomName: raw.roomName,
    };
  }

  /**
   * Builds a ReplayService with a mock repository that simulates filtering behavior.
   * The mock applies the same filtering logic the real repository does:
   * - filters by statuses array
   * - filters by gameType if provided
   * - sorts by startedAt in the given direction
   */
  function buildServiceWithSessions(allSessions: MockSession[]) {
    const mockSessionRepo = {
      findByUserIdPaginated: jest.fn(async (_userId: number, options: SessionListOptions) => {
        let filtered = allSessions.filter((s) => options.statuses.includes(s.status));

        if (options.gameType) {
          filtered = filtered.filter((s) => s.gameType === options.gameType);
        }

        // Sort by startedAt
        filtered.sort((a, b) => {
          const aTime = a.startedAt?.getTime() ?? 0;
          const bTime = b.startedAt?.getTime() ?? 0;
          if (options.sortDirection === 'desc') {
            return bTime - aTime || b.id - a.id;
          }
          return aTime - bTime || a.id - b.id;
        });

        const limit = options.limit;
        const sessions = filtered.slice(0, limit);

        return { sessions, nextCursor: filtered.length > limit ? 'next' : null };
      }),
    } as unknown as GameSessionRepository;

    const mockEventRepo = {} as unknown as GameEventRepository;
    const mockParticipantRepo = {} as unknown as GameParticipantRepository;
    const mockUserRepo = {} as unknown as UserRepository;

    const service = new ReplayService(
      mockSessionRepo,
      mockEventRepo,
      mockParticipantRepo,
      mockUserRepo,
    );

    return { service, mockSessionRepo };
  }

  it('default filters return only sessions with status "finished"', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(sessionArb, { minLength: 1, maxLength: 30 }),
        fc.integer({ min: 1, max: 10000 }),
        async (rawSessions, userId) => {
          const sessions = rawSessions.map(toMockSession);
          const { service } = buildServiceWithSessions(sessions);

          const options: SessionListOptions = {
            statuses: ['finished'],
            limit: 50,
            sortDirection: 'desc',
          };

          const result = await service.getGameHistory(userId, options);

          // All returned sessions must have status "finished"
          for (const s of result.sessions) {
            expect(s.status).toBe('finished');
          }

          // Count of returned sessions matches the number of finished sessions (up to limit)
          const expectedCount = Math.min(
            sessions.filter((s) => s.status === 'finished').length,
            50,
          );
          expect(result.sessions.length).toBe(expectedCount);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('include incomplete returns terminal statuses but never "waiting" or "active"', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(sessionArb, { minLength: 1, maxLength: 30 }),
        fc.integer({ min: 1, max: 10000 }),
        async (rawSessions, userId) => {
          const sessions = rawSessions.map(toMockSession);
          const { service } = buildServiceWithSessions(sessions);

          const options: SessionListOptions = {
            statuses: [...TERMINAL_STATUSES],
            limit: 50,
            sortDirection: 'desc',
          };

          const result = await service.getGameHistory(userId, options);

          // All returned sessions must have a terminal status
          for (const s of result.sessions) {
            expect(TERMINAL_STATUSES).toContain(s.status);
            expect(s.status).not.toBe('waiting');
            expect(s.status).not.toBe('active');
          }

          // Count matches expected terminal sessions
          const expectedCount = Math.min(
            sessions.filter((s) => (TERMINAL_STATUSES as readonly string[]).includes(s.status))
              .length,
            50,
          );
          expect(result.sessions.length).toBe(expectedCount);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('game type filter returns only sessions matching that game type', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(sessionArb, { minLength: 1, maxLength: 30 }),
        fc.constantFrom(...GAME_TYPES),
        fc.integer({ min: 1, max: 10000 }),
        async (rawSessions, filterGameType, userId) => {
          const sessions = rawSessions.map(toMockSession);
          const { service } = buildServiceWithSessions(sessions);

          const options: SessionListOptions = {
            statuses: ['finished'],
            gameType: filterGameType,
            limit: 50,
            sortDirection: 'desc',
          };

          const result = await service.getGameHistory(userId, options);

          // All returned sessions must match the filtered game type
          for (const s of result.sessions) {
            expect(s.gameType).toBe(filterGameType);
          }

          // All returned sessions must also satisfy the status filter
          for (const s of result.sessions) {
            expect(s.status).toBe('finished');
          }

          // Count matches expected
          const expectedCount = Math.min(
            sessions.filter((s) => s.status === 'finished' && s.gameType === filterGameType).length,
            50,
          );
          expect(result.sessions.length).toBe(expectedCount);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('default sort order returns sessions sorted by startedAt descending', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(sessionArb, { minLength: 2, maxLength: 30 }),
        fc.integer({ min: 1, max: 10000 }),
        async (rawSessions, userId) => {
          const sessions = rawSessions.map(toMockSession);
          const { service } = buildServiceWithSessions(sessions);

          const options: SessionListOptions = {
            statuses: [...TERMINAL_STATUSES],
            limit: 50,
            sortDirection: 'desc',
          };

          const result = await service.getGameHistory(userId, options);

          // Verify descending order by startedAt
          for (let i = 1; i < result.sessions.length; i++) {
            const prevTime = result.sessions[i - 1].startedAt
              ? new Date(result.sessions[i - 1].startedAt!).getTime()
              : 0;
            const currTime = result.sessions[i].startedAt
              ? new Date(result.sessions[i].startedAt!).getTime()
              : 0;
            expect(prevTime).toBeGreaterThanOrEqual(currTime);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('combined game type and include incomplete filters work together', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(sessionArb, { minLength: 1, maxLength: 30 }),
        fc.constantFrom(...GAME_TYPES),
        fc.integer({ min: 1, max: 10000 }),
        async (rawSessions, filterGameType, userId) => {
          const sessions = rawSessions.map(toMockSession);
          const { service } = buildServiceWithSessions(sessions);

          const options: SessionListOptions = {
            statuses: [...TERMINAL_STATUSES],
            gameType: filterGameType,
            limit: 50,
            sortDirection: 'desc',
          };

          const result = await service.getGameHistory(userId, options);

          for (const s of result.sessions) {
            // Must match game type
            expect(s.gameType).toBe(filterGameType);
            // Must be a terminal status
            expect(TERMINAL_STATUSES).toContain(s.status);
            // Must never be waiting or active
            expect(s.status).not.toBe('waiting');
            expect(s.status).not.toBe('active');
          }

          // Count matches expected
          const expectedCount = Math.min(
            sessions.filter(
              (s) =>
                (TERMINAL_STATUSES as readonly string[]).includes(s.status) &&
                s.gameType === filterGameType,
            ).length,
            50,
          );
          expect(result.sessions.length).toBe(expectedCount);
        },
      ),
      { numRuns: 100 },
    );
  });
});
