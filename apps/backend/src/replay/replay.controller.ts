import { Controller, Get, Param, ParseIntPipe, Query, Req, UseGuards } from '@nestjs/common';
import { type FastifyRequest } from 'fastify';
import {
  type ReplayDataResponse,
  type ReplaySessionListResponse,
  type UserIdentity,
} from '@cardquorum/shared';
import { HttpAuthGuard, REQUEST_USER_KEY } from '../auth/http-auth.guard';
import { type GetSessionsQueryDto } from './replay.dto';
import { type ReplayService, type SessionListOptions } from './replay.service';

const TERMINAL_STATUSES = ['finished', 'abandoned', 'cancelled', 'aborted'];

@UseGuards(HttpAuthGuard)
@Controller('replay')
export class ReplayController {
  constructor(private readonly replayService: ReplayService) {}

  @Get('session/:sessionId')
  async getReplayData(
    @Param('sessionId', ParseIntPipe) sessionId: number,
    @Req() request: FastifyRequest,
  ): Promise<ReplayDataResponse> {
    const user = (request as any)[REQUEST_USER_KEY] as UserIdentity;
    return this.replayService.getReplayData(sessionId, user.userId);
  }

  @Get('sessions')
  async getSessions(
    @Req() request: FastifyRequest,
    @Query() query: GetSessionsQueryDto,
  ): Promise<ReplaySessionListResponse> {
    const user = (request as any)[REQUEST_USER_KEY] as UserIdentity;

    const statuses = query.includeIncomplete === 'true' ? TERMINAL_STATUSES : ['finished'];

    const options: SessionListOptions = {
      statuses,
      gameType: query.gameType,
      cursor: query.cursor,
      limit: query.limit ?? 20,
      sortDirection: 'desc',
    };

    return this.replayService.getGameHistory(user.userId, options);
  }
}
