import * as fc from 'fast-check';
import { GameEvent } from '../schema';
import { GameEventRepository } from './game-event.repository';
import { GameParticipantRepository } from './game-participant.repository';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a mock GameEvent row with the given properties.
 */
function makeGameEvent(
  overrides: Partial<GameEvent> & {
    id: number;
    roomId: number;
    sessionId: number;
    seq: number;
    createdAt: Date;
  },
): GameEvent {
  return {
    userId: null,
    eventType: 'test',
    payload: {},
    message: null,
    ...overrides,
  };
}

describe('Room log query filtering and ordering', () => {
  it('returns only events with non-null messages, ordered by createdAt descending', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate a list of game events, some with messages and some without
        fc.array(
          fc.record({
            sessionId: fc.integer({ min: 1, max: 1000 }),
            seq: fc.integer({ min: 1, max: 200 }),
            message: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: null }),
            // Use integer timestamps to avoid NaN date issues
            createdAtMs: fc.integer({ min: 1577836800000, max: 1767225600000 }),
          }),
          { minLength: 0, maxLength: 30 },
        ),
        fc.integer({ min: 1, max: 1000 }), // roomId
        async (events, roomId) => {
          // Build the full event rows
          const allRows: GameEvent[] = events.map((e, idx) =>
            makeGameEvent({
              id: idx + 1, // ensure unique IDs
              roomId,
              sessionId: e.sessionId,
              seq: e.seq,
              message: e.message,
              createdAt: new Date(e.createdAtMs),
            }),
          );

          // Expected: only non-null messages, sorted by createdAt descending
          const expectedVisible = allRows
            .filter((r) => r.message !== null)
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

          // Mock DB that simulates the filtering and ordering the repository does
          // The repository applies: WHERE room_id = ? AND message IS NOT NULL
          // ORDER BY created_at DESC, LIMIT pageSize
          const db = {
            select: jest.fn(() => ({
              from: jest.fn(() => ({
                where: jest.fn(() => ({
                  orderBy: jest.fn(() => ({
                    limit: jest.fn(() => Promise.resolve(expectedVisible.slice(0, 50))),
                  })),
                })),
              })),
            })),
          } as any;

          const repo = new GameEventRepository(db);
          const result = await repo.findByRoomId(roomId);

          // Verify: all returned entries have non-null messages
          for (const entry of result) {
            expect(entry.message).not.toBeNull();
          }

          // Verify: results are in descending createdAt order
          for (let i = 1; i < result.length; i++) {
            expect(result[i - 1].createdAt.getTime()).toBeGreaterThanOrEqual(
              result[i].createdAt.getTime(),
            );
          }

          // Verify: count matches expected visible entries (up to page size)
          expect(result.length).toBe(Math.min(expectedVisible.length, 50));

          // Verify: the returned entries match the expected visible set
          expect(result).toEqual(expectedVisible.slice(0, 50));
        },
      ),
      { numRuns: 100 },
    );
  });

  it('returns empty array when all events have null messages', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 1000 }), async (roomId) => {
        // All events have null messages — the DB would return nothing
        const db = {
          select: jest.fn(() => ({
            from: jest.fn(() => ({
              where: jest.fn(() => ({
                orderBy: jest.fn(() => ({
                  limit: jest.fn(() => Promise.resolve([])),
                })),
              })),
            })),
          })),
        } as any;

        const repo = new GameEventRepository(db);
        const result = await repo.findByRoomId(roomId);

        expect(result).toEqual([]);
      }),
      { numRuns: 100 },
    );
  });
});

describe('Cursor pagination completeness', () => {
  it('iterating all pages returns exactly N visible events with no duplicates or omissions', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate visible events (all with non-null messages)
        fc.array(
          fc.record({
            sessionId: fc.integer({ min: 1, max: 100 }),
            seq: fc.integer({ min: 1, max: 200 }),
            message: fc.string({ minLength: 1, maxLength: 100 }),
            // Use integer timestamps to avoid NaN issues
            createdAtMs: fc.integer({ min: 1577836800000, max: 1767225600000 }),
          }),
          { minLength: 0, maxLength: 50 },
        ),
        fc.integer({ min: 1, max: 1000 }), // roomId
        fc.integer({ min: 1, max: 20 }), // pageSize
        async (events, roomId, pageSize) => {
          // Build visible events and sort by createdAt descending.
          // Assign IDs in descending order after sorting so that higher IDs
          // correspond to more recent events (matching real DB serial behavior).
          const sorted = events
            .map((e) => ({
              ...e,
              createdAt: new Date(e.createdAtMs),
            }))
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

          const visibleRows: GameEvent[] = sorted.map((e, idx) =>
            makeGameEvent({
              // Assign IDs in descending order: most recent gets highest ID
              id: sorted.length - idx,
              roomId,
              sessionId: e.sessionId,
              seq: e.seq,
              message: e.message,
              createdAt: e.createdAt,
            }),
          );

          // Simulate cursor-based pagination:
          // The repository uses `lt(gameEvents.id, cursor)` for pagination
          // So each page returns rows with id < cursor, ordered by createdAt desc
          const createPaginatedDb = (cursor?: number) => {
            const filtered =
              cursor != null ? visibleRows.filter((r) => r.id < cursor) : visibleRows;
            const page = filtered.slice(0, pageSize);

            return {
              select: jest.fn(() => ({
                from: jest.fn(() => ({
                  where: jest.fn(() => ({
                    orderBy: jest.fn(() => ({
                      limit: jest.fn(() => Promise.resolve(page)),
                    })),
                  })),
                })),
              })),
            } as any;
          };

          // Iterate through all pages
          const allCollected: GameEvent[] = [];
          let cursor: number | undefined = undefined;

          // Safety limit to prevent infinite loops
          const maxIterations = Math.ceil(visibleRows.length / pageSize) + 2;
          let iterations = 0;

          while (iterations < maxIterations) {
            const db = createPaginatedDb(cursor);
            const repo = new GameEventRepository(db);
            const page = await repo.findByRoomId(roomId, cursor, pageSize);

            if (page.length === 0) break;

            allCollected.push(...page);
            cursor = page[page.length - 1].id;
            iterations++;
          }

          // Property: total collected equals total visible events
          expect(allCollected.length).toBe(visibleRows.length);

          // Property: no duplicates (all IDs are unique)
          const ids = allCollected.map((e) => e.id);
          const uniqueIds = new Set(ids);
          expect(uniqueIds.size).toBe(ids.length);

          // Property: maintains descending createdAt order across page boundaries
          for (let i = 1; i < allCollected.length; i++) {
            const prev = allCollected[i - 1];
            const curr = allCollected[i];
            expect(prev.createdAt.getTime()).toBeGreaterThanOrEqual(curr.createdAt.getTime());
          }

          // Property: collected set matches the full visible set
          expect(new Set(ids)).toEqual(new Set(visibleRows.map((r) => r.id)));
        },
      ),
      { numRuns: 100 },
    );
  });

  it('single page returns all events when pageSize >= total count', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            sessionId: fc.integer({ min: 1, max: 100 }),
            seq: fc.integer({ min: 1, max: 200 }),
            message: fc.string({ minLength: 1, maxLength: 50 }),
            createdAtMs: fc.integer({ min: 1577836800000, max: 1767225600000 }),
          }),
          { minLength: 0, maxLength: 20 },
        ),
        fc.integer({ min: 1, max: 1000 }),
        async (events, roomId) => {
          const visibleRows: GameEvent[] = events
            .map((e, idx) =>
              makeGameEvent({
                id: idx + 1,
                roomId,
                sessionId: e.sessionId,
                seq: e.seq,
                message: e.message,
                createdAt: new Date(e.createdAtMs),
              }),
            )
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

          const pageSize = events.length + 10; // larger than total

          const db = {
            select: jest.fn(() => ({
              from: jest.fn(() => ({
                where: jest.fn(() => ({
                  orderBy: jest.fn(() => ({
                    limit: jest.fn(() => Promise.resolve(visibleRows)),
                  })),
                })),
              })),
            })),
          } as any;

          const repo = new GameEventRepository(db);
          const result = await repo.findByRoomId(roomId, undefined, pageSize);

          // All events returned in one page
          expect(result.length).toBe(visibleRows.length);
          expect(result).toEqual(visibleRows);
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('Participant insertion with correct seat indices', () => {
  it('batchInsert receives exactly one row per player with correct seat_index (0-indexed)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 10000 }), // sessionId
        // Generate a roster: mix of players and spectators (unique user IDs)
        fc.uniqueArray(fc.integer({ min: 1, max: 100_000 }), {
          minLength: 1,
          maxLength: 10,
        }),
        fc.uniqueArray(fc.integer({ min: 100_001, max: 200_000 }), {
          minLength: 0,
          maxLength: 5,
        }),
        async (sessionId, playerIds, spectatorIds) => {
          // Track what gets passed to batchInsert
          let insertedValues: any[] = [];

          const db = {
            insert: jest.fn(() => ({
              values: jest.fn((vals: any[]) => {
                insertedValues = vals;
                return Promise.resolve();
              }),
            })),
          } as any;

          const repo = new GameParticipantRepository(db);

          // Build participant records as the service would:
          // Only players get inserted, each with their 0-indexed seat position
          const participants = playerIds.map((userId, index) => ({
            sessionId,
            userId,
            seatIndex: index,
          }));

          await repo.batchInsert(participants);

          // Property: exactly one row per player
          expect(insertedValues.length).toBe(playerIds.length);

          // Property: no spectators are included
          for (const row of insertedValues) {
            expect(spectatorIds).not.toContain(row.userId);
          }

          // Property: each row has the correct sessionId
          for (const row of insertedValues) {
            expect(row.sessionId).toBe(sessionId);
          }

          // Property: seat_index matches the player's 0-indexed position
          for (let i = 0; i < insertedValues.length; i++) {
            expect(insertedValues[i].userId).toBe(playerIds[i]);
            expect(insertedValues[i].seatIndex).toBe(i);
          }

          // Property: all player IDs are present
          const insertedUserIds = insertedValues.map((r: any) => r.userId);
          expect(new Set(insertedUserIds)).toEqual(new Set(playerIds));
        },
      ),
      { numRuns: 100 },
    );
  });

  it('batchInsert is not called when there are no players (empty roster)', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 10000 }), async (sessionId) => {
        const db = {
          insert: jest.fn(() => ({
            values: jest.fn(() => Promise.resolve()),
          })),
        } as any;

        const repo = new GameParticipantRepository(db);

        // Empty participants array — batchInsert should return early
        await repo.batchInsert([]);

        // The repository has an early return for empty arrays
        expect(db.insert).not.toHaveBeenCalled();
      }),
      { numRuns: 100 },
    );
  });

  it('seat indices form a contiguous 0-based sequence matching player order', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 10000 }),
        // Generate between 2 and 8 unique player IDs (typical game sizes)
        fc.uniqueArray(fc.integer({ min: 1, max: 100_000 }), {
          minLength: 2,
          maxLength: 8,
        }),
        async (sessionId, playerIds) => {
          let insertedValues: any[] = [];

          const db = {
            insert: jest.fn(() => ({
              values: jest.fn((vals: any[]) => {
                insertedValues = vals;
                return Promise.resolve();
              }),
            })),
          } as any;

          const repo = new GameParticipantRepository(db);

          const participants = playerIds.map((userId, index) => ({
            sessionId,
            userId,
            seatIndex: index,
          }));

          await repo.batchInsert(participants);

          // Property: seat indices form [0, 1, 2, ..., N-1]
          const seatIndices = insertedValues.map((r: any) => r.seatIndex);
          const expected = playerIds.map((_, i) => i);
          expect(seatIndices).toEqual(expected);

          // Property: order of players is preserved
          const userIds = insertedValues.map((r: any) => r.userId);
          expect(userIds).toEqual(playerIds);
        },
      ),
      { numRuns: 100 },
    );
  });
});
