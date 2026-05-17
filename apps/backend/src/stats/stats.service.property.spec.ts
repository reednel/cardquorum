import * as fc from 'fast-check';
import { PlayerStatsRepository, RoomRepository, RoomRosterRepository } from '@cardquorum/db';
import { PlayerStatRow } from '@cardquorum/shared';
import { StatsService } from './stats.service';

// ---------------------------------------------------------------------------
// Mock setup
// ---------------------------------------------------------------------------

function createMockPlayerStatsRepo(): jest.Mocked<
  Pick<
    PlayerStatsRepository,
    'bulkInsert' | 'aggregateByRoom' | 'aggregateByUser' | 'aggregateByUserGrouped'
  >
> {
  return {
    bulkInsert: jest.fn().mockResolvedValue(undefined),
    aggregateByRoom: jest.fn().mockResolvedValue([]),
    aggregateByUser: jest.fn().mockResolvedValue({
      userId: 0,
      displayName: null,
      username: '',
      wins: 0,
      losses: 0,
      score: 0,
      gamesPlayed: 0,
    }),
    aggregateByUserGrouped: jest.fn().mockResolvedValue(new Map()),
  };
}

function createMockRoomRosterRepo(): jest.Mocked<
  Pick<RoomRosterRepository, 'isMember' | 'findByRoom'>
> {
  return {
    isMember: jest.fn().mockResolvedValue(true),
    findByRoom: jest.fn().mockResolvedValue([]),
  };
}

function createMockRoomRepo(): jest.Mocked<Pick<RoomRepository, 'findById'>> {
  return {
    findById: jest.fn().mockResolvedValue({ id: 1 }),
  };
}

function createService() {
  const playerStatsRepo = createMockPlayerStatsRepo();
  const roomRosterRepo = createMockRoomRosterRepo();
  const roomRepo = createMockRoomRepo();

  const service = new StatsService(
    playerStatsRepo as unknown as PlayerStatsRepository,
    roomRosterRepo as unknown as RoomRosterRepository,
    roomRepo as unknown as RoomRepository,
  );

  return { service, playerStatsRepo, roomRosterRepo, roomRepo };
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const GAME_TYPES = ['sheepshead', 'euchre', 'hearts', 'spades'];

const arbPlayerStatRow: fc.Arbitrary<PlayerStatRow> = fc.record({
  userId: fc.integer({ min: 1, max: 1000 }),
  won: fc.constantFrom(true, false, null),
  scoreDelta: fc.oneof(fc.integer({ min: -200, max: 200 }), fc.constant(null)),
});

const arbGameType = fc.constantFrom(...GAME_TYPES);

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe('Stats row creation maps buildStats output correctly', () => {
  it('produces exactly one DB row per PlayerStatRow with correct field mapping', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 10000 }), // sessionId
        fc.integer({ min: 1, max: 1000 }), // roomId
        arbGameType, // gameType
        fc.array(arbPlayerStatRow, { minLength: 1, maxLength: 10 }), // rows from buildStats
        async (sessionId, roomId, gameType, rows) => {
          const { service, playerStatsRepo } = createService();

          await service.writeStats(sessionId, roomId, gameType, rows);

          // bulkInsert should be called exactly once
          expect(playerStatsRepo.bulkInsert).toHaveBeenCalledTimes(1);

          const insertedRows = playerStatsRepo.bulkInsert.mock.calls[0][0];

          // Exactly one DB row per PlayerStatRow
          expect(insertedRows).toHaveLength(rows.length);

          // Each row maps fields correctly
          for (let i = 0; i < rows.length; i++) {
            const dbRow = insertedRows[i];
            const statRow = rows[i];

            // Session-level fields come from the session record
            expect(dbRow.sessionId).toBe(sessionId);
            expect(dbRow.roomId).toBe(roomId);
            expect(dbRow.gameType).toBe(gameType);

            // Player-level fields come from the PlayerStatRow
            expect(dbRow.userId).toBe(statRow.userId);
            expect(dbRow.won).toBe(statRow.won);
            expect(dbRow.scoreDelta).toBe(statRow.scoreDelta);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('No stats rows for non-finished sessions', () => {
  it('produces zero DB insertions when called with an empty PlayerStatRow array', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 10000 }), // sessionId
        fc.integer({ min: 1, max: 1000 }), // roomId
        arbGameType, // gameType
        async (sessionId, roomId, gameType) => {
          const { service, playerStatsRepo } = createService();

          // Non-finished sessions (cancelled, aborted, abandoned) should never
          // have buildStats called, resulting in no rows passed to writeStats.
          // writeStats with empty array should produce zero DB operations.
          await service.writeStats(sessionId, roomId, gameType, []);

          expect(playerStatsRepo.bulkInsert).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 100 },
    );
  });
});
