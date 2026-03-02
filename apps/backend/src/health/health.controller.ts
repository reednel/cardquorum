import { Controller, Get, Inject } from '@nestjs/common';
import { HealthCheck, HealthCheckService, HealthIndicatorResult } from '@nestjs/terminus';
import { sql } from 'drizzle-orm';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import Redis from 'ioredis';
import { DRIZZLE } from '../drizzle/drizzle.module';
import { REDIS } from '../redis/redis.module';

@Controller('healthz')
export class HealthController {
  @Inject(HealthCheckService) private readonly health: HealthCheckService;
  @Inject(DRIZZLE) private readonly db: PostgresJsDatabase;
  @Inject(REDIS) private readonly redis: Redis;

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      async (): Promise<HealthIndicatorResult> => {
        await this.db.execute(sql`SELECT 1`);
        return { database: { status: 'up' } };
      },
      async (): Promise<HealthIndicatorResult> => {
        const pong = await this.redis.ping();
        return { redis: { status: pong === 'PONG' ? 'up' : 'down' } };
      },
    ]);
  }
}
