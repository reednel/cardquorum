import { Injectable, Inject, Logger } from '@nestjs/common';
import { IncomingMessage } from 'http';
import { URL } from 'url';
import { UserIdentity } from '@cardquorum/shared';
import { AUTH_STRATEGY_TOKEN, AuthStrategyService } from './auth-strategy.interface';

@Injectable()
export class WsAuthGuard {
  private readonly logger = new Logger(WsAuthGuard.name);

  constructor(
    @Inject(AUTH_STRATEGY_TOKEN)
    private readonly strategy: AuthStrategyService,
  ) {}

  async authenticate(request: IncomingMessage): Promise<UserIdentity | null> {
    try {
      const url = new URL(request.url ?? '', 'http://localhost');
      const token = url.searchParams.get('token');
      if (!token) {
        this.logger.debug('WS connection rejected: no token');
        return null;
      }
      return this.strategy.validateToken(token);
    } catch (err) {
      this.logger.debug(`WS auth failed: ${err}`);
      return null;
    }
  }
}
