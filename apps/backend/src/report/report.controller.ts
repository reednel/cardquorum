import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { type FastifyRequest } from 'fastify';
import { type SessionIdentity } from '@cardquorum/shared';
import { HttpAuthGuard, REQUEST_USER_KEY } from '../auth/http-auth.guard';
import { type ReportService } from './report.service';

@UseGuards(HttpAuthGuard)
@Controller('reports')
export class ReportController {
  constructor(private readonly reportService: ReportService) {}

  @Get(':gameType')
  async getReport(
    @Param('gameType') gameType: string,
    @Req() request: FastifyRequest,
    @Query('variants') variants?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<unknown> {
    const user = (request as any)[REQUEST_USER_KEY] as SessionIdentity;

    return this.reportService.getReport(gameType, user.userId, {
      variants: variants && variants !== 'all' ? variants.split(',') : undefined,
      startDate,
      endDate,
    });
  }
}
