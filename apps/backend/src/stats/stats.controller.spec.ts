import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserIdentity } from '@cardquorum/shared';
import { REQUEST_USER_KEY } from '../auth/http-auth.guard';
import { StatsController } from './stats.controller';
import { StatsService } from './stats.service';

describe('StatsController', () => {
  let controller: StatsController;
  let statsService: jest.Mocked<Pick<StatsService, 'getRoomStats' | 'getPlayerStats'>>;

  const alice: UserIdentity = { userId: 1, username: 'alice', displayName: 'Alice' };

  const makeRequest = (user: UserIdentity) => ({ [REQUEST_USER_KEY]: user }) as any;

  beforeEach(() => {
    statsService = {
      getRoomStats: jest.fn().mockResolvedValue({ players: [] }),
      getPlayerStats: jest.fn().mockResolvedValue({
        wins: 0,
        losses: 0,
        score: 0,
        gamesPlayed: 0,
      }),
    };

    controller = new StatsController(statsService as unknown as StatsService);
  });

  describe('getRoomStats', () => {
    it('should propagate 403 from service when user is not a member', async () => {
      statsService.getRoomStats.mockRejectedValue(
        new ForbiddenException('You are not a member of this room'),
      );

      await expect(controller.getRoomStats(1, makeRequest(alice))).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should propagate 404 from service when room does not exist', async () => {
      statsService.getRoomStats.mockRejectedValue(new NotFoundException('Room 999 not found'));

      await expect(controller.getRoomStats(999, makeRequest(alice))).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should pass query params as filters to the service', async () => {
      await controller.getRoomStats(1, makeRequest(alice), 'sheepshead', 'week');

      expect(statsService.getRoomStats).toHaveBeenCalledWith(1, alice.userId, {
        gameType: 'sheepshead',
        timeRange: 'week',
      });
    });

    it('should pass undefined filters when no query params provided', async () => {
      await controller.getRoomStats(1, makeRequest(alice));

      expect(statsService.getRoomStats).toHaveBeenCalledWith(1, alice.userId, {
        gameType: undefined,
        timeRange: undefined,
      });
    });

    it('should pass invalid filter values through to service without rejecting', async () => {
      await controller.getRoomStats(1, makeRequest(alice), 'bogusGame', 'bogusRange');

      expect(statsService.getRoomStats).toHaveBeenCalledWith(1, alice.userId, {
        gameType: 'bogusGame',
        timeRange: 'bogusRange',
      });
    });
  });

  describe('getPlayerStats', () => {
    it('should delegate to service with authenticated user ID', async () => {
      await controller.getPlayerStats(makeRequest(alice));

      expect(statsService.getPlayerStats).toHaveBeenCalledWith(alice.userId, {
        gameType: undefined,
        timeRange: undefined,
      });
    });

    it('should pass filter params to service', async () => {
      await controller.getPlayerStats(makeRequest(alice), 'sheepshead', 'month');

      expect(statsService.getPlayerStats).toHaveBeenCalledWith(alice.userId, {
        gameType: 'sheepshead',
        timeRange: 'month',
      });
    });

    it('should return zero stats when user has no game history', async () => {
      statsService.getPlayerStats.mockResolvedValue({
        wins: 0,
        losses: 0,
        score: 0,
        gamesPlayed: 0,
      });

      const result = await controller.getPlayerStats(makeRequest(alice));

      expect(result).toEqual({
        wins: 0,
        losses: 0,
        score: 0,
        gamesPlayed: 0,
      });
    });
  });
});
