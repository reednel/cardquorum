import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StrategiesResponse } from '@cardquorum/shared';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { REQUEST_USER_KEY } from './http-auth.guard';
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
      getCredentialMethods: jest.fn(),
      linkBasicCredential: jest.fn(),
      unlinkCredential: jest.fn(),
      linkOidcCredential: jest.fn(),
      unlinkOidcCredential: jest.fn(),
      verifyBasicCredential: jest.fn(),
    };
    sessionService = { deleteSession: jest.fn(), validateSession: jest.fn() };
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

  describe('GET /auth/credentials', () => {
    it('should return methods for authenticated user', async () => {
      (authService['getCredentialMethods'] as jest.Mock).mockResolvedValue(['basic', 'oidc']);
      const request = {
        [REQUEST_USER_KEY]: { userId: 1, displayName: 'Alice', authMethod: 'basic' },
      };

      const result = await controller.getCredentials(request as any);

      expect(result).toEqual({ methods: ['basic', 'oidc'] });
    });
  });

  describe('POST /auth/credentials/basic', () => {
    it('should link basic credential and return 204', async () => {
      (authService['linkBasicCredential'] as jest.Mock).mockResolvedValue(undefined);
      const request = {
        [REQUEST_USER_KEY]: { userId: 1, displayName: 'Alice', authMethod: 'oidc' },
      };
      const reply = { status: jest.fn().mockReturnThis(), send: jest.fn() };

      await controller.linkBasicCredential({ password: 'newpass' }, request as any, reply as any);

      expect(authService['linkBasicCredential']).toHaveBeenCalledWith(1, 'newpass');
      expect(reply.status).toHaveBeenCalledWith(204);
    });
  });

  describe('DELETE /auth/credentials/basic', () => {
    it('should verify password and unlink basic credential', async () => {
      (authService['verifyBasicCredential'] as jest.Mock).mockResolvedValue(undefined);
      (authService['unlinkCredential'] as jest.Mock).mockResolvedValue(undefined);
      const request = {
        [REQUEST_USER_KEY]: { userId: 1, displayName: 'Alice', authMethod: 'basic' },
      };
      const reply = { status: jest.fn().mockReturnThis(), send: jest.fn() };

      await controller.unlinkBasicCredential(
        { password: 'password' },
        request as any,
        reply as any,
      );

      expect(authService['verifyBasicCredential']).toHaveBeenCalledWith(1, 'password');
      expect(authService['unlinkCredential']).toHaveBeenCalledWith(1, 'basic');
      expect(reply.status).toHaveBeenCalledWith(204);
    });

    it('should throw UnauthorizedException for wrong password', async () => {
      (authService['verifyBasicCredential'] as jest.Mock).mockRejectedValue(
        new UnauthorizedException('Invalid password'),
      );
      const request = {
        [REQUEST_USER_KEY]: { userId: 1, displayName: 'Alice', authMethod: 'basic' },
      };
      const reply = { status: jest.fn().mockReturnThis(), send: jest.fn() };

      await expect(
        controller.unlinkBasicCredential({ password: 'wrongpass' }, request as any, reply as any),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('GET /auth/oidc/login', () => {
    it('should set state cookie and redirect', () => {
      const reply = {
        header: jest.fn().mockReturnThis(),
        status: jest.fn().mockReturnThis(),
        redirect: jest.fn(),
      };

      controller.oidcLogin(undefined, reply as any);

      expect(reply.header).toHaveBeenCalledWith(
        'Set-Cookie',
        expect.stringContaining('cq_oidc_state='),
      );
      expect(reply.status).toHaveBeenCalledWith(302);
      expect(reply.redirect).toHaveBeenCalledWith(
        expect.stringContaining('https://provider/authorize'),
      );
      expect(authService['getOidcAuthorizationUrl']).toHaveBeenCalledWith(
        expect.any(String),
        undefined,
      );
    });
  });

  describe('GET /auth/oidc/callback', () => {
    const makeRequest = (cookieState?: string) => ({
      cookies: cookieState ? { cq_oidc_state: cookieState } : {},
    });

    const makeReply = () => ({
      header: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
      redirect: jest.fn(),
    });

    it('should redirect to / on success with session cookie', async () => {
      const reply = makeReply();
      const request = makeRequest('valid-state');

      await controller.oidcCallback(
        'auth-code',
        'valid-state',
        undefined as any,
        undefined as any,
        request as any,
        reply as any,
      );

      expect(authService['oidcCallback']).toHaveBeenCalledWith('auth-code');
      expect(reply.header).toHaveBeenCalledWith('Set-Cookie', [
        expect.stringContaining('cq_session=new-session'),
        expect.stringContaining('cq_oidc_state=; '),
      ]);
      expect(reply.status).toHaveBeenCalledWith(302);
      expect(reply.redirect).toHaveBeenCalledWith('/');
    });

    it('should redirect to /login?error=oidc_failed when IdP returns error', async () => {
      const reply = makeReply();
      const request = makeRequest('valid-state');

      await controller.oidcCallback(
        undefined as any,
        'valid-state',
        'access_denied',
        'User denied',
        request as any,
        reply as any,
      );

      expect(authService['oidcCallback']).not.toHaveBeenCalled();
      expect(reply.status).toHaveBeenCalledWith(302);
      expect(reply.redirect).toHaveBeenCalledWith('/login?error=oidc_failed');
    });

    it('should redirect to /login?error=invalid_state on state mismatch', async () => {
      const reply = makeReply();
      const request = makeRequest('wrong-state');

      await controller.oidcCallback(
        'auth-code',
        'expected-state',
        undefined as any,
        undefined as any,
        request as any,
        reply as any,
      );

      expect(authService['oidcCallback']).not.toHaveBeenCalled();
      expect(reply.status).toHaveBeenCalledWith(302);
      expect(reply.redirect).toHaveBeenCalledWith('/login?error=invalid_state');
    });

    it('should redirect to /login?error=invalid_state when no state cookie', async () => {
      const reply = makeReply();
      const request = makeRequest();

      await controller.oidcCallback(
        'auth-code',
        'some-state',
        undefined as any,
        undefined as any,
        request as any,
        reply as any,
      );

      expect(reply.status).toHaveBeenCalledWith(302);
      expect(reply.redirect).toHaveBeenCalledWith('/login?error=invalid_state');
    });

    it('should redirect to /login?error=oidc_failed on service error', async () => {
      (authService['oidcCallback'] as jest.Mock).mockRejectedValue(
        new Error('token exchange failed'),
      );
      const reply = makeReply();
      const request = makeRequest('valid-state');

      await controller.oidcCallback(
        'bad-code',
        'valid-state',
        undefined as any,
        undefined as any,
        request as any,
        reply as any,
      );

      expect(reply.status).toHaveBeenCalledWith(302);
      expect(reply.redirect).toHaveBeenCalledWith('/login?error=oidc_failed');
    });

    describe('oidc callback with link action', () => {
      it('should link OIDC credential and redirect to /account?linked=oidc', async () => {
        (authService['linkOidcCredential'] as jest.Mock).mockResolvedValue(undefined);
        const stateValue = 'nonce123:link';
        const request = makeRequest(stateValue);
        (request as any).cookies['cq_session'] = 'valid-session';
        const reply = makeReply();

        sessionService['validateSession'] = jest.fn().mockResolvedValue({
          userId: 1,
          displayName: 'Alice',
          authMethod: 'basic',
          createdAt: new Date(),
        });

        await controller.oidcCallback(
          'auth-code',
          stateValue,
          undefined as any,
          undefined as any,
          request as any,
          reply as any,
        );

        expect(authService['linkOidcCredential']).toHaveBeenCalledWith(1, 'auth-code');
        expect(reply.redirect).toHaveBeenCalledWith('/account?linked=oidc');
      });

      it('should redirect to /account?error=oidc_conflict on link ConflictException', async () => {
        (authService['linkOidcCredential'] as jest.Mock).mockRejectedValue(
          new ConflictException('already linked'),
        );
        const stateValue = 'nonce123:link';
        const request = makeRequest(stateValue);
        (request as any).cookies['cq_session'] = 'valid-session';
        const reply = makeReply();
        sessionService['validateSession'] = jest.fn().mockResolvedValue({
          userId: 1,
          displayName: 'Alice',
          authMethod: 'basic',
          createdAt: new Date(),
        });

        await controller.oidcCallback(
          'auth-code',
          stateValue,
          undefined as any,
          undefined as any,
          request as any,
          reply as any,
        );

        expect(reply.redirect).toHaveBeenCalledWith('/account?error=oidc_conflict');
      });

      it('should redirect to /account?error=oidc_failed on link generic error', async () => {
        (authService['linkOidcCredential'] as jest.Mock).mockRejectedValue(
          new Error('token exchange failed'),
        );
        const stateValue = 'nonce123:link';
        const request = makeRequest(stateValue);
        (request as any).cookies['cq_session'] = 'valid-session';
        const reply = makeReply();
        sessionService['validateSession'] = jest.fn().mockResolvedValue({
          userId: 1,
          displayName: 'Alice',
          authMethod: 'basic',
          createdAt: new Date(),
        });

        await controller.oidcCallback(
          'auth-code',
          stateValue,
          undefined as any,
          undefined as any,
          request as any,
          reply as any,
        );

        expect(reply.redirect).toHaveBeenCalledWith('/account?error=oidc_failed');
      });

      it('should redirect to /account?error=session_expired when no valid session', async () => {
        const stateValue = 'nonce123:link';
        const request = makeRequest(stateValue);
        const reply = makeReply();

        sessionService['validateSession'] = jest.fn().mockResolvedValue(null);

        await controller.oidcCallback(
          'auth-code',
          stateValue,
          undefined as any,
          undefined as any,
          request as any,
          reply as any,
        );

        expect(reply.redirect).toHaveBeenCalledWith('/account?error=session_expired');
      });
    });

    describe('oidc callback with unlink action', () => {
      it('should unlink OIDC credential and redirect to /account?unlinked=oidc', async () => {
        (authService['unlinkOidcCredential'] as jest.Mock).mockResolvedValue(undefined);
        const stateValue = 'nonce123:unlink';
        const request = makeRequest(stateValue);
        (request as any).cookies['cq_session'] = 'valid-session';
        const reply = makeReply();

        sessionService['validateSession'] = jest.fn().mockResolvedValue({
          userId: 1,
          displayName: 'Alice',
          authMethod: 'basic',
          createdAt: new Date(),
        });

        await controller.oidcCallback(
          'auth-code',
          stateValue,
          undefined as any,
          undefined as any,
          request as any,
          reply as any,
        );

        expect(authService['unlinkOidcCredential']).toHaveBeenCalledWith(1, 'auth-code');
        expect(reply.redirect).toHaveBeenCalledWith('/account?unlinked=oidc');
      });

      it('should redirect to /account?error=last_credential on unlink ConflictException', async () => {
        (authService['unlinkOidcCredential'] as jest.Mock).mockRejectedValue(
          new ConflictException('last credential'),
        );
        const stateValue = 'nonce123:unlink';
        const request = makeRequest(stateValue);
        (request as any).cookies['cq_session'] = 'valid-session';
        const reply = makeReply();
        sessionService['validateSession'] = jest.fn().mockResolvedValue({
          userId: 1,
          displayName: 'Alice',
          authMethod: 'basic',
          createdAt: new Date(),
        });

        await controller.oidcCallback(
          'auth-code',
          stateValue,
          undefined as any,
          undefined as any,
          request as any,
          reply as any,
        );

        expect(reply.redirect).toHaveBeenCalledWith('/account?error=last_credential');
      });
    });

    describe('oidc callback with delete-account action', () => {
      it('should redirect to /account?action=delete-account', async () => {
        const stateValue = 'nonce123:delete-account';
        const request = makeRequest(stateValue);
        const reply = makeReply();

        await controller.oidcCallback(
          'auth-code',
          stateValue,
          undefined as any,
          undefined as any,
          request as any,
          reply as any,
        );

        expect(authService['oidcCallback']).toHaveBeenCalledWith('auth-code');
        expect(reply.redirect).toHaveBeenCalledWith('/account?action=delete-account');
      });
    });
  });
});
