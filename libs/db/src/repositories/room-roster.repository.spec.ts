import * as fc from 'fast-check';
import { RoomRosterRepository, RosterMember, RosterSection } from './room-roster.repository';

// ---------------------------------------------------------------------------
// In-memory DB simulation
// ---------------------------------------------------------------------------

interface RosterRow {
  id: number;
  roomId: number;
  userId: number;
  section: string;
  position: number;
  createdAt: Date;
}

/**
 * Creates a mock DB that simulates the actual Drizzle operations used by
 * RoomRosterRepository. The in-memory store tracks rows so we can test
 * the round-trip property: replaceRoster → findByRoom should return
 * equivalent data.
 */
function createInMemoryDb() {
  let rows: RosterRow[] = [];
  let nextId = 1;

  // Fake user lookup table — maps userId → { username, displayName }
  const userTable = new Map<number, { username: string; displayName: string | null }>();

  function registerUsers(
    users: { userId: number; username: string; displayName: string | null }[],
  ) {
    for (const u of users) {
      userTable.set(u.userId, { username: u.username, displayName: u.displayName });
    }
  }

  // Build a chainable mock that captures the query intent and resolves
  const db = {
    _rows: () => rows,
    _registerUsers: registerUsers,

    // --- transaction support for replaceRoster ---
    transaction: jest.fn(async (fn: (tx: any) => Promise<void>) => {
      let deletedRoomId: number | null = null;

      const tx = {
        delete: jest.fn(() => ({
          where: jest.fn((_predicate: any) => {
            // The replaceRoster method calls delete with eq(roomRosters.roomId, roomId).
            // We can't evaluate the Drizzle predicate, so we defer the actual
            // deletion until we know the roomId from the insert values, or
            // we set it from the transaction context.
            // We use a trick: set deletedRoomId from _txRoomId (set externally).
            deletedRoomId = db._txRoomId;
            if (deletedRoomId != null) {
              rows = rows.filter((r) => r.roomId !== deletedRoomId);
            }
          }),
        })),
        insert: jest.fn(() => ({
          values: jest.fn((vals: any[]) => {
            for (const v of vals) {
              rows.push({
                id: nextId++,
                roomId: v.roomId,
                userId: v.userId,
                section: v.section,
                position: v.position,
                createdAt: new Date(),
              });
            }
          }),
        })),
      };
      await fn(tx);
    }),

    // --- select().from().innerJoin().where().orderBy() for findByRoom ---
    select: jest.fn(() => ({
      from: jest.fn(() => ({
        innerJoin: jest.fn(() => ({
          where: jest.fn((_pred: any) => ({
            orderBy: jest.fn((..._args: any[]) => {
              const roomId = db._lastQueryRoomId;
              const matching = rows
                .filter((r) => r.roomId === roomId)
                .sort((a, b) => {
                  // Order by section asc ('players' < 'spectators'), then position asc
                  if (a.section < b.section) return -1;
                  if (a.section > b.section) return 1;
                  return a.position - b.position;
                })
                .map((r) => {
                  const user = userTable.get(r.userId) ?? {
                    username: `user${r.userId}`,
                    displayName: null,
                  };
                  return {
                    userId: r.userId,
                    username: user.username,
                    displayName: user.displayName,
                    section: r.section,
                    position: r.position,
                  };
                });
              return Promise.resolve(matching);
            }),
          })),
        })),
      })),
    })),

    _lastQueryRoomId: 0 as number,
    _txRoomId: null as number | null,
  } as any;

  return db;
}

/**
 * Wraps the repository so we can intercept calls and set the roomId context
 * for our in-memory DB simulation.
 */
function createTestRepo() {
  const db = createInMemoryDb();
  const repo = new RoomRosterRepository(db);

  // Patch findByRoom to set the roomId context before the query chain runs
  const originalFindByRoom = repo.findByRoom.bind(repo);
  repo.findByRoom = async (roomId: number) => {
    db._lastQueryRoomId = roomId;
    return originalFindByRoom(roomId);
  };

  // Patch replaceRoster to set the roomId context for the transaction delete
  const originalReplaceRoster = repo.replaceRoster.bind(repo);
  repo.replaceRoster = async (roomId: number, players: number[], spectators: number[]) => {
    db._txRoomId = roomId;
    await originalReplaceRoster(roomId, players, spectators);
    db._txRoomId = null;
  };

  return { repo, db };
}

// ---------------------------------------------------------------------------
// Arbitraries (generators)
// ---------------------------------------------------------------------------

interface UserInfo {
  userId: number;
  username: string;
  displayName: string | null;
}

/**
 * Generates a roster input: two non-overlapping arrays of unique user IDs
 * with associated user info (for the mock user table).
 */
const arbRosterInput = (): fc.Arbitrary<{
  roomId: number;
  players: UserInfo[];
  spectators: UserInfo[];
}> =>
  fc
    .record({
      roomId: fc.integer({ min: 1, max: 1000 }),
      allUsers: fc.uniqueArray(
        fc.record({
          userId: fc.integer({ min: 1, max: 100_000 }),
          username: fc.string({ minLength: 1, maxLength: 12 }),
          displayName: fc.option(fc.string({ minLength: 1, maxLength: 12 }), {
            nil: null,
          }),
        }),
        { minLength: 0, maxLength: 15, selector: (u) => u.userId },
      ),
    })
    .chain(({ roomId, allUsers }) =>
      fc.integer({ min: 0, max: allUsers.length }).map((splitAt) => ({
        roomId,
        players: allUsers.slice(0, splitAt),
        spectators: allUsers.slice(splitAt),
      })),
    );

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

/**
 * For any valid roster state (players list, spectators list), persisting it
 * to the database and then loading it back should produce an equivalent
 * roster state with the same members, sections, positions.
 */
describe('Roster persistence round-trip', () => {
  it('should return the same members, sections, and positions after replaceRoster + findByRoom', async () => {
    await fc.assert(
      fc.asyncProperty(arbRosterInput(), async ({ roomId, players, spectators }) => {
        const { repo, db } = createTestRepo();

        // Register users in the mock user table so findByRoom can resolve names
        db._registerUsers([...players, ...spectators]);

        // Persist
        await repo.replaceRoster(
          roomId,
          players.map((p) => p.userId),
          spectators.map((s) => s.userId),
        );

        // Load back
        const loaded = await repo.findByRoom(roomId);

        // Split loaded results into players and spectators
        const loadedPlayers = loaded.filter((m: RosterMember) => m.section === 'players');
        const loadedSpectators = loaded.filter((m: RosterMember) => m.section === 'spectators');

        // Same number of players
        expect(loadedPlayers.length).toBe(players.length);

        // Same number of spectators
        expect(loadedSpectators.length).toBe(spectators.length);

        // Player IDs match in order
        expect(loadedPlayers.map((m: RosterMember) => m.userId)).toEqual(
          players.map((p) => p.userId),
        );

        // Spectator IDs match in order
        expect(loadedSpectators.map((m: RosterMember) => m.userId)).toEqual(
          spectators.map((s) => s.userId),
        );

        // Positions are contiguous starting from 0 within each section
        loadedPlayers.forEach((m: RosterMember, i: number) => {
          expect(m.position).toBe(i);
          expect(m.section).toBe('players');
        });

        loadedSpectators.forEach((m: RosterMember, i: number) => {
          expect(m.position).toBe(i);
          expect(m.section).toBe('spectators');
        });

        // Usernames and display names round-trip correctly
        for (const p of players) {
          const loaded = loadedPlayers.find((m: RosterMember) => m.userId === p.userId);
          expect(loaded).toBeDefined();
          expect(loaded!.username).toBe(p.username);
          expect(loaded!.displayName).toBe(p.displayName);
        }

        for (const s of spectators) {
          const loaded = loadedSpectators.find((m: RosterMember) => m.userId === s.userId);
          expect(loaded).toBeDefined();
          expect(loaded!.username).toBe(s.username);
          expect(loaded!.displayName).toBe(s.displayName);
        }

        // Total member count preserved
        expect(loaded.length).toBe(players.length + spectators.length);
      }),
      { numRuns: 100 },
    );
  });

  it('should handle empty roster (no players, no spectators)', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 1000 }), async (roomId) => {
        const { repo } = createTestRepo();

        await repo.replaceRoster(roomId, [], []);
        const loaded = await repo.findByRoom(roomId);

        expect(loaded).toEqual([]);
      }),
      { numRuns: 20 },
    );
  });

  it('should overwrite previous roster on second replaceRoster call', async () => {
    await fc.assert(
      fc.asyncProperty(arbRosterInput(), arbRosterInput(), async (first, second) => {
        // Use the same roomId for both
        const roomId = first.roomId;
        const { repo, db } = createTestRepo();

        // Register all users
        db._registerUsers([
          ...first.players,
          ...first.spectators,
          ...second.players,
          ...second.spectators,
        ]);

        // First persist
        await repo.replaceRoster(
          roomId,
          first.players.map((p) => p.userId),
          first.spectators.map((s) => s.userId),
        );

        // Second persist (should overwrite)
        await repo.replaceRoster(
          roomId,
          second.players.map((p) => p.userId),
          second.spectators.map((s) => s.userId),
        );

        // Load back — should match second roster
        const loaded = await repo.findByRoom(roomId);
        const loadedPlayers = loaded.filter((m: RosterMember) => m.section === 'players');
        const loadedSpectators = loaded.filter((m: RosterMember) => m.section === 'spectators');

        expect(loadedPlayers.map((m: RosterMember) => m.userId)).toEqual(
          second.players.map((p) => p.userId),
        );
        expect(loadedSpectators.map((m: RosterMember) => m.userId)).toEqual(
          second.spectators.map((s) => s.userId),
        );
      }),
      { numRuns: 100 },
    );
  });
});
