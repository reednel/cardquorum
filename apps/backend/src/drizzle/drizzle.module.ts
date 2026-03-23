import { Global, Module, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@cardquorum/db';
import {
  CredentialRepository,
  FriendshipRepository,
  GameSessionRepository,
  MessageRepository,
  RoomRepository,
  SessionRepository,
  UserRepository,
} from '@cardquorum/db';

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
    {
      provide: UserRepository,
      inject: [DRIZZLE],
      useFactory: (db: any) => new UserRepository(db),
    },
    {
      provide: CredentialRepository,
      inject: [DRIZZLE],
      useFactory: (db: any) => new CredentialRepository(db),
    },
    {
      provide: GameSessionRepository,
      inject: [DRIZZLE],
      useFactory: (db: any) => new GameSessionRepository(db),
    },
    {
      provide: SessionRepository,
      inject: [DRIZZLE],
      useFactory: (db: any) => new SessionRepository(db),
    },
    {
      provide: FriendshipRepository,
      inject: [DRIZZLE],
      useFactory: (db: any) => new FriendshipRepository(db),
    },
  ],
  exports: [
    DRIZZLE,
    RoomRepository,
    MessageRepository,
    UserRepository,
    CredentialRepository,
    GameSessionRepository,
    SessionRepository,
    FriendshipRepository,
  ],
})
export class DrizzleModule implements OnApplicationShutdown {
  async onApplicationShutdown() {
    // postgres.js handles cleanup automatically
  }
}
