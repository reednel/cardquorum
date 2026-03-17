import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { UserIdentity } from '@cardquorum/shared';
import { AuthStrategyService } from './auth-strategy.interface';
import { HttpAuthGuard, REQUEST_USER_KEY } from './http-auth.guard';

describe('HttpAuthGuard', () => {
  let guard: HttpAuthGuard;
  let strategy: jest.Mocked<AuthStrategyService>;

  const alice: UserIdentity = { userId: 1, displayName: 'Alice' };

  const createContext = (authHeader?: string): ExecutionContext => {
    const request: Record<string, any> = { headers: {} };
    if (authHeader !== undefined) {
      request['headers']['authorization'] = authHeader;
    }
    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;
  };

  beforeEach(() => {
    strategy = { validateToken: jest.fn() };
    guard = new HttpAuthGuard(strategy);
  });

  it('should allow request with valid token and attach user', async () => {
    strategy.validateToken.mockResolvedValue(alice);

    const ctx = createContext('Bearer valid-token');
    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
    expect(strategy.validateToken).toHaveBeenCalledWith('valid-token');

    const request = ctx.switchToHttp().getRequest();
    expect((request as any)[REQUEST_USER_KEY]).toEqual(alice);
  });

  it('should reject request with no authorization header', async () => {
    const ctx = createContext();
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('should reject request with non-Bearer header', async () => {
    const ctx = createContext('Basic dXNlcjpwYXNz');
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('should reject request when token validation returns null', async () => {
    strategy.validateToken.mockResolvedValue(null);
    const ctx = createContext('Bearer bad-token');
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('should reject request when token validation throws', async () => {
    strategy.validateToken.mockRejectedValue(new Error('expired'));
    const ctx = createContext('Bearer expired-token');
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });
});
