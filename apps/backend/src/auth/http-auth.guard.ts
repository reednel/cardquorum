import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { SessionService } from './session.service';

export const REQUEST_USER_KEY = 'user';

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

    const identity = await this.sessionService.validateSession(sessionId);

    if (!identity) {
      this.logger.debug('Session validation failed: expired or not found');
      throw new UnauthorizedException('Invalid or expired session');
    }

    (request as any)[REQUEST_USER_KEY] = identity;
    return true;
  }
}
