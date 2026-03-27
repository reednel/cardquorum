import { Controller, Get, Inject } from '@nestjs/common';
import { HealthCheck, HealthCheckService, HealthIndicatorResult } from '@nestjs/terminus';
import { sql } from 'drizzle-orm';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DRIZZLE } from '../drizzle/drizzle.module';

@Controller('healthz')
export class HealthController {
  @Inject(HealthCheckService) private readonly health: HealthCheckService;
  @Inject(DRIZZLE) private readonly db: PostgresJsDatabase;

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      async (): Promise<HealthIndicatorResult> => {
        await this.db.execute(sql`SELECT 1`);
        return { database: { status: 'up' } };
      },
    ]);
  }
}
