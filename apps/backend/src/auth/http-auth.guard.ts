import {
  Injectable,
  Logger,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { type FastifyRequest } from 'fastify';
import { type SessionIdentity } from '@cardquorum/shared';
import { SessionService } from './session.service';

export const REQUEST_USER_KEY = 'user';
export const REQUEST_SESSION_KEY = 'sessionMeta';

@Injectable()
export class HttpAuthGuard implements CanActivate {
  private readonly logger = new Logger(HttpAuthGuard.name);

  constructor(private readonly sessionService: SessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const cookies = request.cookies;
    const sessionId = cookies?.['cq_session'];

    if (!sessionId) {
      throw new UnauthorizedException('Missing session cookie');
    }

    const session = await this.sessionService.validateSession(sessionId);

    if (!session) {
      this.logger.debug('Session validation failed: expired or not found');
      throw new UnauthorizedException('Invalid or expired session');
    }

    const identity: SessionIdentity = {
      userId: session.userId,
      username: session.username,
      displayName: session.displayName,
      authMethod: session.authMethod as 'basic' | 'oidc',
    };

    request[REQUEST_USER_KEY] = identity;
    request[REQUEST_SESSION_KEY] = { createdAt: session.createdAt };
    return true;
  }
}
