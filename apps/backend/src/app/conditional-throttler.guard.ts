import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Extends ThrottlerGuard to skip rate limiting when NODE_ENV=test,
 * so e2e tests aren't blocked by per-route throttle limits.
 */
@Injectable()
export class ConditionalThrottlerGuard extends ThrottlerGuard {
  private readonly isTest = process.env['NODE_ENV'] === 'test';

  override async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.isTest) {
      return true;
    }
    return super.canActivate(context);
  }
}
