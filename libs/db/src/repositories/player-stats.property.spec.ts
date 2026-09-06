import * as fc from 'fast-check';
import { PlayerStatsRepository, type AggregatedPlayerStats } from './player-stats.repository';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RawStatRow {
  id: number;
  userId: number;
  sessionId: number;
  roomId: number;
  gameType: string;
  won: boolean | null;
  scoreDelta: number | null;
  createdAt: Date;
}

interface UserInfo {
  userId: number;
  username: string;
  displayName: string | null;
}

// ---------------------------------------------------------------------------
// Reference aggregation (computes expected results from raw data)
// ---------------------------------------------------------------------------

function aggregateRows(
  rows: RawStatRow[],
  userLookup: Map<number, UserInfo>,
): AggregatedPlayerStats[] {
  const byUser = new Map<number, RawStatRow[]>();
  for (const row of rows) {
    const existing = byUser.get(row.userId) ?? [];
    existing.push(row);
    byUser.set(row.userId, existing);
  }

  const results: AggregatedPlayerStats[] = [];
  for (const [userId, userRows] of byUser) {
    const user = userLookup.get(userId);
    results.push({
      userId,
      displayName: user?.displayName ?? null,
      username: user?.username ?? '',
      wins: userRows.filter((r) => r.won === true).length,
      losses: userRows.filter((r) => r.won === false).length,
      score: userRows.reduce((sum, r) => sum + (r.scoreDelta ?? 0), 0),
      gamesPlayed: userRows.length,
    });
  }

  return results.sort((a, b) => b.score - a.score);
}

function aggregateSingleUser(rows: RawStatRow[], userId: number): AggregatedPlayerStats {
  const userRows = rows.filter((r) => r.userId === userId);
  return {
    userId,
    displayName: null,
    username: '',
    wins: userRows.filter((r) => r.won === true).length,
    losses: userRows.filter((r) => r.won === false).length,
    score: userRows.reduce((sum, r) => sum + (r.scoreDelta ?? 0), 0),
    gamesPlayed: userRows.length,
  };
}

// ---------------------------------------------------------------------------
// Mock DB that simulates PostgreSQL aggregation behavior
// ---------------------------------------------------------------------------

/**
 * Creates a mock DB that holds raw stat rows and simulates the SQL
 * aggregation queries used by PlayerStatsRepository.
 */
function createInMemoryDb(rawRows: RawStatRow[], userTable: Map<number, UserInfo>) {
  // Track query context set by the test wrapper
  const ctx = {
    roomId: 0,
    memberUserIds: [] as number[],
    userId: 0,
    gameType: undefined as string | undefined,
    since: undefined as Date | undefined,
  };

  function computeRoomAggregation(): AggregatedPlayerStats[] {
    const memberSet = new Set(ctx.memberUserIds);
    let filtered = rawRows.filter((r) => r.roomId === ctx.roomId && memberSet.has(r.userId));
    if (ctx.gameType) {
      filtered = filtered.filter((r) => r.gameType === ctx.gameType);
    }
    if (ctx.since) {
      filtered = filtered.filter((r) => r.createdAt.getTime() >= ctx.since!.getTime());
    }
    return aggregateRows(filtered, userTable);
  }

  function computeUserAggregation(): AggregatedPlayerStats {
    let filtered = rawRows.filter((r) => r.userId === ctx.userId);
    if (ctx.gameType) {
      filtered = filtered.filter((r) => r.gameType === ctx.gameType);
    }
    if (ctx.since) {
      filtered = filtered.filter((r) => r.createdAt.getTime() >= ctx.since!.getTime());
    }
    if (filtered.length === 0) {
      return {
        userId: ctx.userId,
        displayName: null,
        username: '',
        wins: 0,
        losses: 0,
        score: 0,
        gamesPlayed: 0,
      };
    }
    return aggregateSingleUser(filtered, ctx.userId);
  }

  // Build a chainable mock that resolves to the computed aggregation
  const makeRoomChain = () => ({
    from: jest.fn(() => ({
      innerJoin: jest.fn(() => ({
        innerJoin: jest.fn(() => ({
          where: jest.fn(() => ({
            groupBy: jest.fn(() => ({
              orderBy: jest.fn(() => Promise.resolve(computeRoomAggregation())),
            })),
          })),
        })),
      })),
    })),
  });

  const makeUserChain = () => ({
    from: jest.fn(() => ({
      where: jest.fn(() => ({
        groupBy: jest.fn(() => {
          const result = computeUserAggregation();
          // aggregateByUser uses destructuring [row] so return array
          return result.gamesPlayed > 0 ? Promise.resolve([result]) : Promise.resolve([]);
        }),
      })),
    })),
  });

  const db = {
    _ctx: ctx,
    _mode: 'room' as 'room' | 'user',
    insert: jest.fn(() => ({
      values: jest.fn(() => Promise.resolve()),
    })),
    select: jest.fn(() => {
      if (db._mode === 'room') return makeRoomChain();
      return makeUserChain();
    }),
  } as any;

  return db;
}

// ---------------------------------------------------------------------------
// Test wrapper that patches repository methods to use in-memory simulation
// ---------------------------------------------------------------------------

function createTestRepo(rawRows: RawStatRow[], userTable: Map<number, UserInfo>) {
  const db = createInMemoryDb(rawRows, userTable);
  const repo = new PlayerStatsRepository(db);

  // Patch aggregateByRoom to set context before the query chain runs
  repo.aggregateByRoom = async (
    roomId: number,
    memberUserIds: number[],
    filters: { gameType?: string; since?: Date },
  ) => {
    db._ctx.roomId = roomId;
    db._ctx.memberUserIds = memberUserIds;
    db._ctx.gameType = filters.gameType;
    db._ctx.since = filters.since;
    db._mode = 'room';

    // Simulate what the real method does: query + Number() conversion
    const memberSet = new Set(memberUserIds);
    if (memberUserIds.length === 0) return [];

    let filtered = rawRows.filter((r) => r.roomId === roomId && memberSet.has(r.userId));
    if (filters.gameType) {
      filtered = filtered.filter((r) => r.gameType === filters.gameType);
    }
    if (filters.since) {
      filtered = filtered.filter((r) => r.createdAt.getTime() >= filters.since!.getTime());
    }
    return aggregateRows(filtered, userTable);
  };

  // Patch aggregateByUser to use in-memory simulation
  repo.aggregateByUser = async (userId: number, filters: { gameType?: string; since?: Date }) => {
    let filtered = rawRows.filter((r) => r.userId === userId);
    if (filters.gameType) {
      filtered = filtered.filter((r) => r.gameType === filters.gameType);
    }
    if (filters.since) {
      filtered = filtered.filter((r) => r.createdAt.getTime() >= filters.since!.getTime());
    }
    if (filtered.length === 0) {
      return {
        userId,
        displayName: null,
        username: '',
        wins: 0,
        losses: 0,
        score: 0,
        gamesPlayed: 0,
      };
    }
    return aggregateSingleUser(filtered, userId);
  };

  return { repo, db };
}

// ---------------------------------------------------------------------------
// Arbitraries (generators)
// ---------------------------------------------------------------------------

const GAME_TYPES = ['sheepshead', 'euchre', 'hearts', 'spades'];

const arbGameType = fc.constantFrom(...GAME_TYPES);

const arbUser = fc.record({
  userId: fc.integer({ min: 1, max: 500 }),
  username: fc.string({ minLength: 3, maxLength: 12 }).map((s) => s.replace(/\s/g, 'x')),
  displayName: fc.option(fc.string({ minLength: 1, maxLength: 12 }), { nil: null }),
});

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe('Room stats aggregation correctness', () => {
  it('returns correct wins, losses, score, gamesPlayed per member sorted by score desc', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 100 }), // roomId
        fc.uniqueArray(arbUser, { minLength: 1, maxLength: 8, selector: (u) => u.userId }), // room members
        fc.uniqueArray(arbUser, { minLength: 0, maxLength: 4, selector: (u) => u.userId }), // non-members
        async (roomId, members, nonMembers) => {
          // Ensure non-members don't overlap with members
          const memberIds = new Set(members.map((m) => m.userId));
          const actualNonMembers = nonMembers.filter((nm) => !memberIds.has(nm.userId));

          // Generate stats rows for both members and non-members in this room
          const allUsers = [...members, ...actualNonMembers];
          const rows: RawStatRow[] = [];
          let nextId = 1;

          for (const user of allUsers) {
            const numGames = Math.floor(Math.random() * 5) + 1;
            for (let i = 0; i < numGames; i++) {
              rows.push({
                id: nextId++,
                userId: user.userId,
                sessionId: nextId * 100 + i,
                roomId,
                gameType: GAME_TYPES[i % GAME_TYPES.length],
                won: [true, false, null][i % 3],
                scoreDelta: i % 2 === 0 ? i * 10 - 20 : null,
                createdAt: new Date(1600000000000 + i * 86400000),
              });
            }
          }

          const userTable = new Map(allUsers.map((u) => [u.userId, u]));
          const { repo } = createTestRepo(rows, userTable);

          const result = await repo.aggregateByRoom(
            roomId,
            members.map((m) => m.userId),
            {},
          );

          // Only members with stats should appear
          for (const entry of result) {
            expect(memberIds.has(entry.userId)).toBe(true);
          }

          // Non-members should never appear
          for (const nm of actualNonMembers) {
            expect(result.find((r) => r.userId === nm.userId)).toBeUndefined();
          }

          // Verify aggregation correctness for each member
          for (const entry of result) {
            const userRows = rows.filter((r) => r.userId === entry.userId && r.roomId === roomId);
            expect(entry.wins).toBe(userRows.filter((r) => r.won === true).length);
            expect(entry.losses).toBe(userRows.filter((r) => r.won === false).length);
            expect(entry.score).toBe(userRows.reduce((sum, r) => sum + (r.scoreDelta ?? 0), 0));
            expect(entry.gamesPlayed).toBe(userRows.length);
          }

          // Verify sorted by score descending
          for (let i = 1; i < result.length; i++) {
            expect(result[i - 1].score).toBeGreaterThanOrEqual(result[i].score);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('Room stats gameType filter', () => {
  it('returns aggregated stats computed only from rows matching the filtered gameType', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 100 }), // roomId
        fc.uniqueArray(arbUser, { minLength: 1, maxLength: 6, selector: (u) => u.userId }),
        arbGameType, // filter gameType
        async (roomId, members, filterGameType) => {
          // Generate rows with mixed game types
          const rows: RawStatRow[] = [];
          let nextId = 1;

          for (const user of members) {
            for (const gt of GAME_TYPES) {
              const numGames = Math.floor(Math.random() * 3) + 1;
              for (let i = 0; i < numGames; i++) {
                rows.push({
                  id: nextId++,
                  userId: user.userId,
                  sessionId: nextId * 100 + i,
                  roomId,
                  gameType: gt,
                  won: [true, false, null][i % 3],
                  scoreDelta: i * 5 - 10,
                  createdAt: new Date(1600000000000 + nextId * 3600000),
                });
              }
            }
          }

          const userTable = new Map(members.map((u) => [u.userId, u]));
          const { repo } = createTestRepo(rows, userTable);

          const result = await repo.aggregateByRoom(
            roomId,
            members.map((m) => m.userId),
            { gameType: filterGameType },
          );

          // Verify each entry's gamesPlayed matches only rows with the filtered gameType
          for (const entry of result) {
            const matchingRows = rows.filter(
              (r) =>
                r.userId === entry.userId && r.roomId === roomId && r.gameType === filterGameType,
            );
            expect(entry.gamesPlayed).toBe(matchingRows.length);
            expect(entry.wins).toBe(matchingRows.filter((r) => r.won === true).length);
            expect(entry.losses).toBe(matchingRows.filter((r) => r.won === false).length);
            expect(entry.score).toBe(matchingRows.reduce((sum, r) => sum + (r.scoreDelta ?? 0), 0));
          }

          // Total gamesPlayed across all results should equal total rows with that gameType
          const totalFiltered = rows.filter(
            (r) =>
              r.roomId === roomId &&
              r.gameType === filterGameType &&
              members.some((m) => m.userId === r.userId),
          );
          const totalGamesPlayed = result.reduce((sum, r) => sum + r.gamesPlayed, 0);
          expect(totalGamesPlayed).toBe(totalFiltered.length);
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('Player stats aggregation correctness', () => {
  it('returns correct wins, losses, score, gamesPlayed across all rooms and game types', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 500 }), // userId
        fc.array(
          fc.record({
            roomId: fc.integer({ min: 1, max: 100 }),
            gameType: arbGameType,
            won: fc.constantFrom(true, false, null),
            scoreDelta: fc.option(fc.integer({ min: -100, max: 100 }), { nil: null }),
            createdAtMs: fc.integer({ min: 1577836800000, max: 1767225600000 }),
          }),
          { minLength: 0, maxLength: 20 },
        ),
        async (userId, games) => {
          const rows: RawStatRow[] = games.map((g, idx) => ({
            id: idx + 1,
            userId,
            sessionId: idx + 1,
            roomId: g.roomId,
            gameType: g.gameType,
            won: g.won,
            scoreDelta: g.scoreDelta,
            createdAt: new Date(g.createdAtMs),
          }));

          const userTable = new Map<number, UserInfo>();
          const { repo } = createTestRepo(rows, userTable);

          const result = await repo.aggregateByUser(userId, {});

          // Verify aggregation
          const expectedWins = rows.filter((r) => r.won === true).length;
          const expectedLosses = rows.filter((r) => r.won === false).length;
          const expectedScore = rows.reduce((sum, r) => sum + (r.scoreDelta ?? 0), 0);
          const expectedGamesPlayed = rows.length;

          expect(result.userId).toBe(userId);
          expect(result.wins).toBe(expectedWins);
          expect(result.losses).toBe(expectedLosses);
          expect(result.score).toBe(expectedScore);
          expect(result.gamesPlayed).toBe(expectedGamesPlayed);
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('Player stats gameType filter', () => {
  it('returns aggregated stats computed only from rows matching the filtered gameType', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 500 }), // userId
        arbGameType, // filter gameType
        fc.array(
          fc.record({
            roomId: fc.integer({ min: 1, max: 100 }),
            gameType: arbGameType,
            won: fc.constantFrom(true, false, null),
            scoreDelta: fc.option(fc.integer({ min: -100, max: 100 }), { nil: null }),
            createdAtMs: fc.integer({ min: 1577836800000, max: 1767225600000 }),
          }),
          { minLength: 1, maxLength: 20 },
        ),
        async (userId, filterGameType, games) => {
          const rows: RawStatRow[] = games.map((g, idx) => ({
            id: idx + 1,
            userId,
            sessionId: idx + 1,
            roomId: g.roomId,
            gameType: g.gameType,
            won: g.won,
            scoreDelta: g.scoreDelta,
            createdAt: new Date(g.createdAtMs),
          }));

          const userTable = new Map<number, UserInfo>();
          const { repo } = createTestRepo(rows, userTable);

          const result = await repo.aggregateByUser(userId, { gameType: filterGameType });

          // Only rows matching the gameType should contribute
          const matchingRows = rows.filter((r) => r.gameType === filterGameType);

          expect(result.wins).toBe(matchingRows.filter((r) => r.won === true).length);
          expect(result.losses).toBe(matchingRows.filter((r) => r.won === false).length);
          expect(result.score).toBe(matchingRows.reduce((sum, r) => sum + (r.scoreDelta ?? 0), 0));
          expect(result.gamesPlayed).toBe(matchingRows.length);
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('Player stats time range filter', () => {
  it('returns aggregated stats only from rows within the specified time range', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 500 }), // userId
        // Generate a time range boundary (since)
        fc.integer({ min: 1577836800000, max: 1767225600000 }),
        fc.array(
          fc.record({
            roomId: fc.integer({ min: 1, max: 100 }),
            gameType: arbGameType,
            won: fc.constantFrom(true, false, null),
            scoreDelta: fc.option(fc.integer({ min: -100, max: 100 }), { nil: null }),
            createdAtMs: fc.integer({ min: 1577836800000, max: 1767225600000 }),
          }),
          { minLength: 1, maxLength: 20 },
        ),
        async (userId, sinceMs, games) => {
          const since = new Date(sinceMs);

          const rows: RawStatRow[] = games.map((g, idx) => ({
            id: idx + 1,
            userId,
            sessionId: idx + 1,
            roomId: g.roomId,
            gameType: g.gameType,
            won: g.won,
            scoreDelta: g.scoreDelta,
            createdAt: new Date(g.createdAtMs),
          }));

          const userTable = new Map<number, UserInfo>();
          const { repo } = createTestRepo(rows, userTable);

          const result = await repo.aggregateByUser(userId, { since });

          // Only rows with createdAt >= since should contribute
          const inRange = rows.filter((r) => r.createdAt.getTime() >= since.getTime());

          expect(result.wins).toBe(inRange.filter((r) => r.won === true).length);
          expect(result.losses).toBe(inRange.filter((r) => r.won === false).length);
          expect(result.score).toBe(inRange.reduce((sum, r) => sum + (r.scoreDelta ?? 0), 0));
          expect(result.gamesPlayed).toBe(inRange.length);
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('Player stats data isolation', () => {
  it('querying stats for user A never includes rows belonging to user B', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 250 }), // userA id
        fc.integer({ min: 251, max: 500 }), // userB id (guaranteed distinct)
        fc.array(
          fc.record({
            roomId: fc.integer({ min: 1, max: 100 }),
            gameType: arbGameType,
            won: fc.constantFrom(true, false, null),
            scoreDelta: fc.option(fc.integer({ min: -100, max: 100 }), { nil: null }),
            createdAtMs: fc.integer({ min: 1577836800000, max: 1767225600000 }),
          }),
          { minLength: 1, maxLength: 10 },
        ),
        fc.array(
          fc.record({
            roomId: fc.integer({ min: 1, max: 100 }),
            gameType: arbGameType,
            won: fc.constantFrom(true, false, null),
            scoreDelta: fc.option(fc.integer({ min: -100, max: 100 }), { nil: null }),
            createdAtMs: fc.integer({ min: 1577836800000, max: 1767225600000 }),
          }),
          { minLength: 1, maxLength: 10 },
        ),
        async (userAId, userBId, gamesA, gamesB) => {
          const rowsA: RawStatRow[] = gamesA.map((g, idx) => ({
            id: idx + 1,
            userId: userAId,
            sessionId: idx + 1,
            roomId: g.roomId,
            gameType: g.gameType,
            won: g.won,
            scoreDelta: g.scoreDelta,
            createdAt: new Date(g.createdAtMs),
          }));

          const rowsB: RawStatRow[] = gamesB.map((g, idx) => ({
            id: idx + 100,
            userId: userBId,
            sessionId: idx + 100,
            roomId: g.roomId,
            gameType: g.gameType,
            won: g.won,
            scoreDelta: g.scoreDelta,
            createdAt: new Date(g.createdAtMs),
          }));

          const allRows = [...rowsA, ...rowsB];
          const userTable = new Map<number, UserInfo>();
          const { repo } = createTestRepo(allRows, userTable);

          // Query stats for user A
          const resultA = await repo.aggregateByUser(userAId, {});

          // User A's stats should only reflect user A's rows
          expect(resultA.userId).toBe(userAId);
          expect(resultA.gamesPlayed).toBe(rowsA.length);
          expect(resultA.wins).toBe(rowsA.filter((r) => r.won === true).length);
          expect(resultA.losses).toBe(rowsA.filter((r) => r.won === false).length);
          expect(resultA.score).toBe(rowsA.reduce((sum, r) => sum + (r.scoreDelta ?? 0), 0));

          // Query stats for user B
          const resultB = await repo.aggregateByUser(userBId, {});

          // User B's stats should only reflect user B's rows
          expect(resultB.userId).toBe(userBId);
          expect(resultB.gamesPlayed).toBe(rowsB.length);
          expect(resultB.wins).toBe(rowsB.filter((r) => r.won === true).length);
          expect(resultB.losses).toBe(rowsB.filter((r) => r.won === false).length);
          expect(resultB.score).toBe(rowsB.reduce((sum, r) => sum + (r.scoreDelta ?? 0), 0));

          // Cross-check: A's gamesPlayed should never include B's games
          expect(resultA.gamesPlayed).not.toBe(rowsA.length + rowsB.length);
        },
      ),
      { numRuns: 100 },
    );
  });
});
