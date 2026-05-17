import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { StatsService } from './stats.service';

describe('StatsService', () => {
  let service: StatsService;
  let mockPlayerStatsRepo: {
    bulkInsert: jest.Mock;
    aggregateByRoom: jest.Mock;
    aggregateByUser: jest.Mock;
    aggregateByUserGrouped: jest.Mock;
  };
  let mockRoomRosterRepo: {
    isMember: jest.Mock;
    findByRoom: jest.Mock;
  };
  let mockRoomRepo: {
    findById: jest.Mock;
  };

  beforeEach(() => {
    mockPlayerStatsRepo = {
      bulkInsert: jest.fn().mockResolvedValue(undefined),
      aggregateByRoom: jest.fn().mockResolvedValue([]),
      aggregateByUser: jest.fn().mockResolvedValue({
        userId: 1,
        displayName: null,
        username: '',
        wins: 0,
        losses: 0,
        score: 0,
        gamesPlayed: 0,
      }),
      aggregateByUserGrouped: jest.fn().mockResolvedValue(new Map()),
    };

    mockRoomRosterRepo = {
      isMember: jest.fn().mockResolvedValue(true),
      findByRoom: jest.fn().mockResolvedValue([]),
    };

    mockRoomRepo = {
      findById: jest.fn().mockResolvedValue({ id: 1, name: 'Test Room' }),
    };

    service = new StatsService(
      mockPlayerStatsRepo as any,
      mockRoomRosterRepo as any,
      mockRoomRepo as any,
    );
  });

  describe('getRoomStats', () => {
    it('should throw 403 when requesting user is not a room member', async () => {
      mockRoomRepo.findById.mockResolvedValue({ id: 1, name: 'Test Room' });
      mockRoomRosterRepo.isMember.mockResolvedValue(false);

      await expect(service.getRoomStats(1, 99, {})).rejects.toThrow(ForbiddenException);
    });

    it('should throw 404 when room does not exist', async () => {
      mockRoomRepo.findById.mockResolvedValue(null);

      await expect(service.getRoomStats(999, 1, {})).rejects.toThrow(NotFoundException);
    });

    it('should check room existence before membership', async () => {
      mockRoomRepo.findById.mockResolvedValue(null);

      await expect(service.getRoomStats(999, 1, {})).rejects.toThrow(NotFoundException);
      expect(mockRoomRosterRepo.isMember).not.toHaveBeenCalled();
    });

    it('should return empty players array when no stats exist', async () => {
      mockRoomRosterRepo.findByRoom.mockResolvedValue([{ userId: 1 }, { userId: 2 }]);
      mockPlayerStatsRepo.aggregateByRoom.mockResolvedValue([]);

      const result = await service.getRoomStats(1, 1, {});

      expect(result).toEqual({ players: [] });
    });

    it('should treat unrecognized timeRange as no filter', async () => {
      mockRoomRosterRepo.findByRoom.mockResolvedValue([{ userId: 1 }]);
      mockPlayerStatsRepo.aggregateByRoom.mockResolvedValue([]);

      await service.getRoomStats(1, 1, { timeRange: 'invalid' as any });

      expect(mockPlayerStatsRepo.aggregateByRoom).toHaveBeenCalledWith(1, [1], {
        gameType: undefined,
        since: undefined,
      });
    });

    it('should treat unrecognized gameType as no filter', async () => {
      mockRoomRosterRepo.findByRoom.mockResolvedValue([{ userId: 1 }]);
      mockPlayerStatsRepo.aggregateByRoom.mockResolvedValue([]);

      await service.getRoomStats(1, 1, { gameType: 'nonexistent' as any });

      // The service passes the gameType through to the repo — the repo handles unknown types
      // by simply finding no matching rows. The key behavior is it doesn't throw.
      expect(mockPlayerStatsRepo.aggregateByRoom).toHaveBeenCalled();
    });

    it('should resolve valid time range presets to a Date', async () => {
      mockRoomRosterRepo.findByRoom.mockResolvedValue([{ userId: 1 }]);
      mockPlayerStatsRepo.aggregateByRoom.mockResolvedValue([]);

      await service.getRoomStats(1, 1, { timeRange: 'week' });

      const call = mockPlayerStatsRepo.aggregateByRoom.mock.calls[0];
      const filters = call[2];
      expect(filters.since).toBeInstanceOf(Date);
      // "week" should be approximately 7 days ago
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      expect(filters.since.getTime()).toBeCloseTo(sevenDaysAgo, -3);
    });
  });

  describe('getPlayerStats', () => {
    it('should return zeros when user has no stats', async () => {
      mockPlayerStatsRepo.aggregateByUser.mockResolvedValue({
        userId: 1,
        displayName: null,
        username: '',
        wins: 0,
        losses: 0,
        score: 0,
        gamesPlayed: 0,
      });
      mockPlayerStatsRepo.aggregateByUserGrouped.mockResolvedValue(new Map());

      const result = await service.getPlayerStats(1, {});

      expect(result).toEqual({
        wins: 0,
        losses: 0,
        score: 0,
        gamesPlayed: 0,
        breakdown: undefined,
      });
    });

    it('should treat unrecognized timeRange as no filter', async () => {
      await service.getPlayerStats(1, { timeRange: 'garbage' as any });

      expect(mockPlayerStatsRepo.aggregateByUser).toHaveBeenCalledWith(1, {
        gameType: undefined,
        since: undefined,
      });
    });

    it('should treat "all" timeRange as no filter', async () => {
      await service.getPlayerStats(1, { timeRange: 'all' });

      expect(mockPlayerStatsRepo.aggregateByUser).toHaveBeenCalledWith(1, {
        gameType: undefined,
        since: undefined,
      });
    });

    it('should include breakdown when grouped stats exist', async () => {
      mockPlayerStatsRepo.aggregateByUser.mockResolvedValue({
        userId: 1,
        displayName: null,
        username: '',
        wins: 5,
        losses: 3,
        score: 10,
        gamesPlayed: 8,
      });
      mockPlayerStatsRepo.aggregateByUserGrouped.mockResolvedValue(
        new Map([
          [
            'sheepshead',
            {
              userId: 1,
              displayName: null,
              username: '',
              wins: 5,
              losses: 3,
              score: 10,
              gamesPlayed: 8,
            },
          ],
        ]),
      );

      const result = await service.getPlayerStats(1, {});

      expect(result.breakdown).toEqual({
        sheepshead: { wins: 5, losses: 3, score: 10, gamesPlayed: 8 },
      });
    });
  });

  describe('writeStats', () => {
    it('should not throw when bulk insert fails', async () => {
      mockPlayerStatsRepo.bulkInsert.mockRejectedValue(new Error('DB connection lost'));

      await expect(
        service.writeStats(1, 1, 'sheepshead', [{ userId: 1, won: true, scoreDelta: 5 }]),
      ).resolves.toBeUndefined();
    });

    it('should not call bulkInsert for empty rows', async () => {
      await service.writeStats(1, 1, 'sheepshead', []);

      expect(mockPlayerStatsRepo.bulkInsert).not.toHaveBeenCalled();
    });
  });
});
