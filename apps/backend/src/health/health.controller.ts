import { Controller, Get, Inject } from '@nestjs/common';
import { HealthCheck, HealthCheckService, type HealthIndicatorResult } from '@nestjs/terminus';
import { sql } from 'drizzle-orm';
import { type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DRIZZLE } from '../drizzle/drizzle.module';

@Controller('healthz')
export class HealthController {
  @Inject(HealthCheckService) declare private readonly health: HealthCheckService;
  @Inject(DRIZZLE) declare private readonly db: PostgresJsDatabase;

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
