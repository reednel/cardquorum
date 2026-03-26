import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { SessionIdentity } from '@cardquorum/shared';
import { SessionService } from './session.service';

export const REQUEST_USER_KEY = 'user';
export const REQUEST_SESSION_KEY = 'sessionMeta';

@Injectable()
export class HttpAuthGuard implements CanActivate {
  private readonly logger = new Logger(HttpAuthGuard.name);

  constructor(private readonly sessionService: SessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const cookies = (request as any).cookies as Record<string, string> | undefined;
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

    (request as any)[REQUEST_USER_KEY] = identity;
    (request as any)[REQUEST_SESSION_KEY] = { createdAt: session.createdAt };
    return true;
  }
}
