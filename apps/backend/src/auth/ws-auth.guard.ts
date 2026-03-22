import { IncomingMessage } from 'http';
import { Injectable, Logger } from '@nestjs/common';
import { UserIdentity } from '@cardquorum/shared';
import { parseCookieSessionId } from './cookie';
import { SessionService } from './session.service';

@Injectable()
export class WsAuthGuard {
  private readonly logger = new Logger(WsAuthGuard.name);

  constructor(private readonly sessionService: SessionService) {}

  async authenticate(request: IncomingMessage): Promise<UserIdentity | null> {
    try {
      const sessionId = parseCookieSessionId(request.headers.cookie);
      if (!sessionId) {
        this.logger.debug('WS connection rejected: no session cookie');
        return null;
      }
      return this.sessionService.validateSession(sessionId);
    } catch (err) {
      this.logger.debug(`WS auth failed: ${err}`);
      return null;
    }
  }
}
