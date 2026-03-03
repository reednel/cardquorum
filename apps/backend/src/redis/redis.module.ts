import { Module, Global, OnApplicationShutdown, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { RedisPubSubService } from './redis-pubsub.service';

export const REDIS = Symbol('REDIS');

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        return new Redis(config.getOrThrow<string>('REDIS_URL'));
      },
    },
    RedisPubSubService,
  ],
  exports: [REDIS, RedisPubSubService],
})
export class RedisModule implements OnApplicationShutdown {
  @Inject(REDIS) private readonly redis: Redis;

  async onApplicationShutdown() {
    await this.redis.quit();
  }
}
