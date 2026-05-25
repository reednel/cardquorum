import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { GameReportRepository, ReportFilters } from '@cardquorum/shared';
import { SheepsheadReportRepository } from '@cardquorum/sheepshead/reporting';

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

@Injectable()
export class ReportService {
  private readonly repositories = new Map<string, GameReportRepository>();

  constructor(sheepsheadReportRepo: SheepsheadReportRepository) {
    this.repositories.set('sheepshead', sheepsheadReportRepo);
  }

  async getReport(gameType: string, userId: number, filters: ReportFilters): Promise<unknown> {
    const repo = this.repositories.get(gameType);
    if (!repo) {
      throw new NotFoundException(`Game type '${gameType}' not supported`);
    }

    this.validateDates(filters);

    return repo.computeReport('default', userId, filters);
  }

  private validateDates(filters: ReportFilters): void {
    if (filters.startDate) {
      if (!ISO_DATE_REGEX.test(filters.startDate) || !this.isValidDate(filters.startDate)) {
        throw new BadRequestException("Invalid date format for 'startDate'. Expected YYYY-MM-DD.");
      }
    }

    if (filters.endDate) {
      if (!ISO_DATE_REGEX.test(filters.endDate) || !this.isValidDate(filters.endDate)) {
        throw new BadRequestException("Invalid date format for 'endDate'. Expected YYYY-MM-DD.");
      }
    }

    if (filters.startDate && filters.endDate && filters.startDate > filters.endDate) {
      throw new BadRequestException('startDate must not be after endDate');
    }
  }

  private isValidDate(dateStr: string): boolean {
    const date = new Date(dateStr + 'T00:00:00Z');
    if (isNaN(date.getTime())) return false;
    // Verify the parsed date matches the input (catches invalid days like 2024-02-30)
    const [year, month, day] = dateStr.split('-').map(Number);
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() + 1 === month &&
      date.getUTCDate() === day
    );
  }
}
