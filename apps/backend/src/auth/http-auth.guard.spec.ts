import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { UserIdentity } from '@cardquorum/shared';
import { HttpAuthGuard, REQUEST_USER_KEY } from './http-auth.guard';
import { SessionService } from './session.service';

describe('HttpAuthGuard', () => {
  let guard: HttpAuthGuard;
  let sessionService: jest.Mocked<Pick<SessionService, 'validateSession'>>;

  const alice: UserIdentity = { userId: 1, displayName: 'Alice' };

  const createContext = (sessionId?: string): ExecutionContext => {
    const request: Record<string, any> = {
      headers: {},
      cookies: sessionId ? { cq_session: sessionId } : {},
    };
    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;
  };

  beforeEach(() => {
    sessionService = { validateSession: jest.fn() };
    guard = new HttpAuthGuard(sessionService as unknown as SessionService);
  });

  it('should allow request with valid session and attach user', async () => {
    sessionService.validateSession.mockResolvedValue(alice);

    const ctx = createContext('valid-session-id');
    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
    expect(sessionService.validateSession).toHaveBeenCalledWith('valid-session-id');

    const request = ctx.switchToHttp().getRequest();
    expect((request as any)[REQUEST_USER_KEY]).toEqual(alice);
  });

  it('should reject request with no session cookie', async () => {
    const ctx = createContext();
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('should reject request when session validation returns null', async () => {
    sessionService.validateSession.mockResolvedValue(null);
    const ctx = createContext('expired-session');
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });
});
