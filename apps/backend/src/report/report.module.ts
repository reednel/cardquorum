import { Module } from '@nestjs/common';
import { SheepsheadReportRepository } from '@cardquorum/sheepshead/reporting';
import { AuthModule } from '../auth/auth.module';
import { DRIZZLE } from '../drizzle/drizzle.module';
import { ReportController } from './report.controller';
import { ReportService } from './report.service';

@Module({
  imports: [AuthModule],
  controllers: [ReportController],
  providers: [
    {
      provide: SheepsheadReportRepository,
      useFactory: (db: any) => new SheepsheadReportRepository(db),
      inject: [DRIZZLE],
    },
    ReportService,
  ],
})
export class ReportModule {}
