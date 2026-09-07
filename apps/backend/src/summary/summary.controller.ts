import { Controller, Get, Param, ParseIntPipe, Req, UseGuards } from '@nestjs/common';
import { type FastifyRequest } from 'fastify';
import { type SummaryDataResponse, type UserIdentity } from '@cardquorum/shared';
import { HttpAuthGuard, REQUEST_USER_KEY } from '../auth/http-auth.guard';
import { SummaryService } from './summary.service';

@UseGuards(HttpAuthGuard)
@Controller('summary')
export class SummaryController {
  constructor(private readonly summaryService: SummaryService) {}

  @Get('session/:sessionId')
  async getSummaryData(
    @Param('sessionId', ParseIntPipe) sessionId: number,
    @Req() request: FastifyRequest,
  ): Promise<SummaryDataResponse> {
    const user = (request as any)[REQUEST_USER_KEY] as UserIdentity;
    return this.summaryService.getSummaryData(sessionId, user.userId);
  }
}
