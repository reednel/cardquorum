import { Controller, Get, Param, ParseIntPipe, Query, Req, UseGuards } from '@nestjs/common';
import { type FastifyRequest } from 'fastify';
import {
  type PlayerStatsResponse,
  type RoomStatsResponse,
  type StatsQueryParams,
  type UserIdentity,
} from '@cardquorum/shared';
import { HttpAuthGuard, REQUEST_USER_KEY } from '../auth/http-auth.guard';
import { StatsService } from './stats.service';

@UseGuards(HttpAuthGuard)
@Controller('stats')
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  @Get('room/:roomId')
  async getRoomStats(
    @Param('roomId', ParseIntPipe) roomId: number,
    @Req() request: FastifyRequest,
    @Query('gameType') gameType?: string,
    @Query('timeRange') timeRange?: string,
  ): Promise<RoomStatsResponse> {
    const user = request[REQUEST_USER_KEY] as UserIdentity;

    const filters: StatsQueryParams = {
      gameType: gameType as StatsQueryParams['gameType'],
      timeRange: timeRange as StatsQueryParams['timeRange'],
    };

    return this.statsService.getRoomStats(roomId, user.userId, filters);
  }

  @Get('player')
  async getPlayerStats(
    @Req() request: FastifyRequest,
    @Query('gameType') gameType?: string,
    @Query('timeRange') timeRange?: string,
  ): Promise<PlayerStatsResponse> {
    const user = request[REQUEST_USER_KEY] as UserIdentity;

    const filters: StatsQueryParams = {
      gameType: gameType as StatsQueryParams['gameType'],
      timeRange: timeRange as StatsQueryParams['timeRange'],
    };

    return this.statsService.getPlayerStats(user.userId, filters);
  }
}
