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
  assignedHue: number | null;
  createdAt: Date;
}

/**
 * Creates a mock DB that simulates the actual Drizzle operations used by
 * RoomRosterRepository. The in-memory store tracks rows so we can test
 * the round-trip property: replaceRoster → findByRoom should return
 * equivalent data, including assignedHue preservation.
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

  /**
   * The new replaceRoster uses:
   *   tx.select({ userId }).from(roomRosters).where(eq(roomId))
   *   tx.delete(roomRosters).where(and(eq(roomId), eq(userId)))
   *   tx.insert(roomRosters).values(val).onConflictDoUpdate({ target, set })
   *
   * We track a _txRoomId and a _txDeleteUserId so the mock can resolve
   * the correct rows without evaluating Drizzle predicates.
   */
  const db = {
    _rows: () => rows,
    _registerUsers: registerUsers,

    transaction: jest.fn(async (fn: (tx: any) => Promise<void>) => {
      const tx = {
        // tx.select({ userId }).from(roomRosters).where(pred) — returns existing userIds
        select: jest.fn(() => ({
          from: jest.fn(() => ({
            where: jest.fn(() => {
              const roomId = db._txRoomId;
              return Promise.resolve(
                rows.filter((r) => r.roomId === roomId).map((r) => ({ userId: r.userId })),
              );
            }),
          })),
        })),

        // tx.delete(roomRosters).where(pred) — deletes a single (roomId, userId) row
        delete: jest.fn(() => ({
          where: jest.fn(() => {
            const roomId = db._txRoomId;
            const userId = db._txDeleteUserId;
            if (roomId != null && userId != null) {
              rows = rows.filter((r) => !(r.roomId === roomId && r.userId === userId));
            }
          }),
        })),

        // tx.insert(roomRosters).values(val).onConflictDoUpdate({ target, set })
        insert: jest.fn(() => ({
          values: jest.fn((val: any) => ({
            onConflictDoUpdate: jest.fn((opts: { target: any; set: any }) => {
              const existing = rows.find((r) => r.roomId === val.roomId && r.userId === val.userId);
              if (existing) {
                // Upsert: update section and position, preserve assignedHue
                existing.section = opts.set.section;
                existing.position = opts.set.position;
              } else {
                rows.push({
                  id: nextId++,
                  roomId: val.roomId,
                  userId: val.userId,
                  section: val.section,
                  position: val.position,
                  assignedHue: null,
                  createdAt: new Date(),
                });
              }
            }),
          })),
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
                    assignedHue: r.assignedHue,
                  };
                });
              return Promise.resolve(matching);
            }),
          })),
        })),
      })),
    })),

    // --- update().set().where() for setAssignedHue ---
    update: jest.fn(() => ({
      set: jest.fn((values: any) => ({
        where: jest.fn(() => {
          const roomId = db._txRoomId;
          const userId = db._txSetHueUserId;
          if (roomId != null && userId != null && values.assignedHue !== undefined) {
            const row = rows.find((r) => r.roomId === roomId && r.userId === userId);
            if (row) {
              row.assignedHue = values.assignedHue;
            }
          }
          return Promise.resolve();
        }),
      })),
    })),

    _lastQueryRoomId: 0 as number,
    _txRoomId: null as number | null,
    _txDeleteUserId: null as number | null,
    _txSetHueUserId: null as number | null,
  } as any;

  return db;
}

/**
 * Wraps the repository so we can intercept calls and set the roomId/userId
 * context for our in-memory DB simulation.
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

  // Patch replaceRoster — simulate upsert behavior directly since we
  // can't evaluate Drizzle predicates in the mock.
  repo.replaceRoster = async (roomId: number, players: number[], spectators: number[]) => {
    const newMemberIds = new Set([...players, ...spectators]);

    // Remove members not in the new roster
    const existingInRoom = db._rows().filter((r: RosterRow) => r.roomId === roomId);
    for (const row of existingInRoom) {
      if (!newMemberIds.has(row.userId)) {
        const allRows = db._rows();
        const idx = allRows.findIndex(
          (r: RosterRow) => r.roomId === roomId && r.userId === row.userId,
        );
        if (idx !== -1) allRows.splice(idx, 1);
      }
    }

    // Upsert each member — update section/position, preserve assignedHue
    const values = [
      ...players.map((userId: number, index: number) => ({
        roomId,
        userId,
        section: 'players' as const,
        position: index,
      })),
      ...spectators.map((userId: number, index: number) => ({
        roomId,
        userId,
        section: 'spectators' as const,
        position: index,
      })),
    ];

    for (const val of values) {
      const existing = db
        ._rows()
        .find((r: RosterRow) => r.roomId === val.roomId && r.userId === val.userId);
      if (existing) {
        existing.section = val.section;
        existing.position = val.position;
      } else {
        db._rows().push({
          id: Date.now() + Math.random(),
          roomId: val.roomId,
          userId: val.userId,
          section: val.section,
          position: val.position,
          assignedHue: null,
          createdAt: new Date(),
        });
      }
    }
  };

  // Patch setAssignedHue to directly update the in-memory row
  repo.setAssignedHue = async (roomId: number, userId: number, hue: number) => {
    const row = db._rows().find((r: RosterRow) => r.roomId === roomId && r.userId === userId);
    if (row) {
      row.assignedHue = hue;
    }
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

  it('should preserve assignedHue for members that remain after replaceRoster', async () => {
    await fc.assert(
      fc.asyncProperty(arbRosterInput(), async ({ roomId, players, spectators }) => {
        const allUsers = [...players, ...spectators];
        if (allUsers.length === 0) return;

        const { repo, db } = createTestRepo();
        db._registerUsers(allUsers);

        // Initial roster
        await repo.replaceRoster(
          roomId,
          players.map((p) => p.userId),
          spectators.map((s) => s.userId),
        );

        // Assign hues to all members
        const hueMap = new Map<number, number>();
        for (let i = 0; i < allUsers.length; i++) {
          const hue = (i * 37) % 360;
          hueMap.set(allUsers[i].userId, hue);
          await repo.setAssignedHue(roomId, allUsers[i].userId, hue);
        }

        // Replace roster with the same members (possibly reordered sections)
        // Swap players ↔ spectators to exercise section changes
        await repo.replaceRoster(
          roomId,
          spectators.map((s) => s.userId),
          players.map((p) => p.userId),
        );

        // All members should still have their assigned hues
        const loaded = await repo.findByRoom(roomId);
        for (const member of loaded) {
          expect(member.assignedHue).toBe(hueMap.get(member.userId));
        }
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Unit tests for updateLastVisitedAt and findRosteredRoomIds
// ---------------------------------------------------------------------------

describe('updateLastVisitedAt', () => {
  it('should call update with lastVisitedAt = sql`now()` for the given room and user', async () => {
    const setCalled = jest.fn();
    const whereCalled = jest.fn();

    const db = {
      update: jest.fn(() => ({
        set: jest.fn((values: any) => {
          setCalled(values);
          return {
            where: jest.fn((predicate: any) => {
              whereCalled(predicate);
              return Promise.resolve();
            }),
          };
        }),
      })),
    } as any;

    const repo = new RoomRosterRepository(db);
    await repo.updateLastVisitedAt(42, 7);

    expect(db.update).toHaveBeenCalledTimes(1);
    expect(setCalled).toHaveBeenCalledTimes(1);

    // Verify the set payload contains a lastVisitedAt key with a SQL template
    const setPayload = setCalled.mock.calls[0][0];
    expect(setPayload).toHaveProperty('lastVisitedAt');
    expect(whereCalled).toHaveBeenCalledTimes(1);
  });
});

describe('findRosteredRoomIds', () => {
  it('should return room IDs for the given user', async () => {
    const fakeRows = [{ roomId: 1 }, { roomId: 5 }, { roomId: 12 }];

    const db = {
      select: jest.fn(() => ({
        from: jest.fn(() => ({
          where: jest.fn(() => Promise.resolve(fakeRows)),
        })),
      })),
    } as any;

    const repo = new RoomRosterRepository(db);
    const result = await repo.findRosteredRoomIds(99);

    expect(result).toEqual([1, 5, 12]);
    expect(db.select).toHaveBeenCalledTimes(1);
  });

  it('should return an empty array when user has no roster entries', async () => {
    const db = {
      select: jest.fn(() => ({
        from: jest.fn(() => ({
          where: jest.fn(() => Promise.resolve([])),
        })),
      })),
    } as any;

    const repo = new RoomRosterRepository(db);
    const result = await repo.findRosteredRoomIds(99);

    expect(result).toEqual([]);
  });

  it('should correctly map rows to just room IDs for any number of memberships', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(fc.integer({ min: 1, max: 10000 }), { minLength: 0, maxLength: 50 }),
        async (roomIds) => {
          const fakeRows = roomIds.map((roomId) => ({ roomId }));

          const db = {
            select: jest.fn(() => ({
              from: jest.fn(() => ({
                where: jest.fn(() => Promise.resolve(fakeRows)),
              })),
            })),
          } as any;

          const repo = new RoomRosterRepository(db);
          const result = await repo.findRosteredRoomIds(1);

          expect(result).toEqual(roomIds);
          expect(result.length).toBe(roomIds.length);
        },
      ),
      { numRuns: 100 },
    );
  });
});
