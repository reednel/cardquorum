import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { UserIdentity } from '@cardquorum/shared';
import { AUTH_STRATEGY_TOKEN, AuthStrategyService } from './auth-strategy.interface';

export const REQUEST_USER_KEY = 'user';

@Injectable()
export class HttpAuthGuard implements CanActivate {
  private readonly logger = new Logger(HttpAuthGuard.name);

  constructor(
    @Inject(AUTH_STRATEGY_TOKEN)
    private readonly strategy: AuthStrategyService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const authHeader = request.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or malformed authorization header');
    }

    const token = authHeader.slice(7);
    let identity: UserIdentity | null;

    try {
      identity = await this.strategy.validateToken(token);
    } catch (err) {
      this.logger.debug(`Token validation failed: ${err}`);
      throw new UnauthorizedException('Invalid token');
    }

    if (!identity) {
      throw new UnauthorizedException('Invalid token');
    }

    (request as any)[REQUEST_USER_KEY] = identity;
    return true;
  }
}
