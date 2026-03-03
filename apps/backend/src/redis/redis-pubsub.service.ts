import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { Observable, Subject } from 'rxjs';
import { filter, map } from 'rxjs/operators';

interface ChannelMessage {
  channel: string;
  message: string;
}

@Injectable()
export class RedisPubSubService implements OnApplicationShutdown {
  private subscriber: Redis;
  private publisher: Redis;
  private messages$ = new Subject<ChannelMessage>();

  constructor(config: ConfigService) {
    const url = config.getOrThrow<string>('REDIS_URL');
    this.subscriber = new Redis(url);
    this.publisher = new Redis(url);

    this.subscriber.on('message', (channel, message) => {
      this.messages$.next({ channel, message });
    });
  }

  async subscribe(channel: string): Promise<void> {
    await this.subscriber.subscribe(channel);
  }

  async publish(channel: string, data: unknown): Promise<void> {
    await this.publisher.publish(channel, JSON.stringify(data));
  }

  onChannel<T>(channel: string): Observable<T> {
    return this.messages$.pipe(
      filter((msg) => msg.channel === channel),
      map((msg) => JSON.parse(msg.message) as T),
    );
  }

  async onApplicationShutdown() {
    this.messages$.complete();
    await this.subscriber.quit();
    await this.publisher.quit();
  }
}
