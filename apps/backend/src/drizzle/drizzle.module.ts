import { Module, Global, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@cardquorum/api';
import { RoomRepository, MessageRepository } from '@cardquorum/api';

export const DRIZZLE = Symbol('DRIZZLE');

@Global()
@Module({
  providers: [
    {
      provide: DRIZZLE,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const client = postgres(config.get<string>('DATABASE_URL'));
        return drizzle(client, { schema });
      },
    },
    {
      provide: RoomRepository,
      inject: [DRIZZLE],
      useFactory: (db: any) => new RoomRepository(db),
    },
    {
      provide: MessageRepository,
      inject: [DRIZZLE],
      useFactory: (db: any) => new MessageRepository(db),
    },
  ],
  exports: [DRIZZLE, RoomRepository, MessageRepository],
})
export class DrizzleModule implements OnApplicationShutdown {
  async onApplicationShutdown() {
    // postgres.js handles cleanup automatically
  }
}
