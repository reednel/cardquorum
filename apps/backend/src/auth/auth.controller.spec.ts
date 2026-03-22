import { ConfigService } from '@nestjs/config';
import { StrategiesResponse } from '@cardquorum/shared';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';

jest.mock('jose', () => ({
  createRemoteJWKSet: jest.fn().mockReturnValue(jest.fn()),
  jwtVerify: jest.fn(),
}));

describe('AuthController', () => {
  let controller: AuthController;
  let authService: Record<string, jest.Mock | unknown>;
  let sessionService: Record<string, jest.Mock>;

  beforeEach(() => {
    authService = {
      enabledStrategies: ['basic', 'oidc'],
      isStrategyEnabled: jest.fn(() => true),
      getOidcAuthorizationUrl: jest.fn().mockReturnValue('https://provider/authorize?state=abc'),
      oidcCallback: jest.fn().mockResolvedValue({
        sessionId: 'new-session',
        user: { userId: 1, displayName: 'Alice' },
      }),
    };
    sessionService = { deleteSession: jest.fn() };
    const config = { get: jest.fn().mockReturnValue('development') };

    controller = new AuthController(
      authService as unknown as AuthService,
      sessionService as unknown as SessionService,
      config as unknown as ConfigService,
    );
  });

  describe('GET /auth/strategies', () => {
    it('should return enabled strategies', () => {
      const result: StrategiesResponse = controller.strategies();
      expect(result).toEqual({ strategies: ['basic', 'oidc'] });
    });
  });

  describe('GET /auth/oidc/login', () => {
    it('should set state cookie and redirect', () => {
      const reply = {
        header: jest.fn().mockReturnThis(),
        status: jest.fn().mockReturnThis(),
        redirect: jest.fn(),
      };

      controller.oidcLogin(reply as any);

      expect(reply.header).toHaveBeenCalledWith(
        'Set-Cookie',
        expect.stringContaining('cq_oidc_state='),
      );
      expect(reply.status).toHaveBeenCalledWith(302);
      expect(reply.redirect).toHaveBeenCalledWith(
        expect.stringContaining('https://provider/authorize'),
      );
      expect(authService['getOidcAuthorizationUrl']).toHaveBeenCalledWith(expect.any(String));
    });
  });

  describe('GET /auth/oidc/callback', () => {
    const makeRequest = (cookieState?: string) => ({
      cookies: cookieState ? { cq_oidc_state: cookieState } : {},
    });

    it('should redirect to / on success with session cookie', async () => {
      const reply = {
        header: jest.fn().mockReturnThis(),
        status: jest.fn().mockReturnThis(),
        redirect: jest.fn(),
      };
      const request = makeRequest('valid-state');

      await controller.oidcCallback('auth-code', 'valid-state', request as any, reply as any);

      expect(authService['oidcCallback']).toHaveBeenCalledWith('auth-code');
      expect(reply.header).toHaveBeenCalledWith(
        'Set-Cookie',
        expect.stringContaining('cq_session='),
      );
      expect(reply.status).toHaveBeenCalledWith(302);
      expect(reply.redirect).toHaveBeenCalledWith('/');
    });

    it('should redirect to /login?error=invalid_state on state mismatch', async () => {
      const reply = {
        header: jest.fn().mockReturnThis(),
        status: jest.fn().mockReturnThis(),
        redirect: jest.fn(),
      };
      const request = makeRequest('wrong-state');

      await controller.oidcCallback('auth-code', 'expected-state', request as any, reply as any);

      expect(authService['oidcCallback']).not.toHaveBeenCalled();
      expect(reply.status).toHaveBeenCalledWith(302);
      expect(reply.redirect).toHaveBeenCalledWith('/login?error=invalid_state');
    });

    it('should redirect to /login?error=invalid_state when no state cookie', async () => {
      const reply = {
        header: jest.fn().mockReturnThis(),
        status: jest.fn().mockReturnThis(),
        redirect: jest.fn(),
      };
      const request = makeRequest();

      await controller.oidcCallback('auth-code', 'some-state', request as any, reply as any);

      expect(reply.status).toHaveBeenCalledWith(302);
      expect(reply.redirect).toHaveBeenCalledWith('/login?error=invalid_state');
    });

    it('should redirect to /login?error=oidc_failed on service error', async () => {
      (authService['oidcCallback'] as jest.Mock).mockRejectedValue(
        new Error('token exchange failed'),
      );
      const reply = {
        header: jest.fn().mockReturnThis(),
        status: jest.fn().mockReturnThis(),
        redirect: jest.fn(),
      };
      const request = makeRequest('valid-state');

      await controller.oidcCallback('bad-code', 'valid-state', request as any, reply as any);

      expect(reply.status).toHaveBeenCalledWith(302);
      expect(reply.redirect).toHaveBeenCalledWith('/login?error=oidc_failed');
    });
  });
});
