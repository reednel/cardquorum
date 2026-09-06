import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { type ConfigService } from '@nestjs/config';
import { type StrategiesResponse } from '@cardquorum/shared';
import { AuthController } from './auth.controller';
import { type AuthService } from './auth.service';
import { REQUEST_USER_KEY } from './http-auth.guard';
import { type SessionService } from './session.service';

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
      getEndSessionUrl: jest.fn().mockReturnValue(null),
      oidcCallback: jest.fn().mockResolvedValue({
        sessionId: 'new-session',
        user: { userId: 1, username: 'alice', displayName: 'Alice' },
      }),
      oidcRegister: jest.fn(),
      getCredentialMethods: jest.fn(),
      linkBasicCredential: jest.fn(),
      unlinkCredential: jest.fn(),
      linkOidcCredential: jest.fn(),
      unlinkOidcCredential: jest.fn(),
      verifyBasicCredential: jest.fn(),
      backchannelLogout: jest.fn(),
    };
    sessionService = { deleteSession: jest.fn(), validateSession: jest.fn() };
    const config = {
      get: jest.fn((key: string, fallback?: unknown) => {
        if (key === 'NODE_ENV') return 'development';
        return fallback;
      }),
    };

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

  describe('PATCH /auth/oidc/register', () => {
    it('should call oidcRegister and redirect', async () => {
      (authService['oidcRegister'] as jest.Mock).mockResolvedValue(undefined);
      const request = {
        [REQUEST_USER_KEY]: {
          userId: 1,
          username: 'user_abc123',
          displayName: null,
          authMethod: 'oidc',
        },
      };

      const result = await controller.oidcRegister({ username: 'alice' }, request as any);

      expect(authService['oidcRegister']).toHaveBeenCalledWith(1, 'alice');
      expect(result).toEqual({
        userId: 1,
        username: 'alice',
        displayName: null,
        authMethod: 'oidc',
      });
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
    it('should set state cookie with nonce.codeVerifier.state format and redirect', () => {
      const reply = {
        header: jest.fn().mockReturnThis(),
        status: jest.fn().mockReturnThis(),
        redirect: jest.fn(),
      };

      controller.oidcLogin(undefined, reply as any);

      const cookieHeader = (reply.header as jest.Mock).mock.calls.find(
        (c: string[]) => c[0] === 'Set-Cookie',
      )?.[1] as string;
      // Cookie value must have two dots separating three non-empty segments
      expect(cookieHeader).toMatch(/^cq_oidc_state=[^.]+\.[^.]+\.[^;]+/);
      expect(reply.status).toHaveBeenCalledWith(302);
      expect(reply.redirect).toHaveBeenCalledWith(
        expect.stringContaining('https://provider/authorize'),
      );
      // state, nonce, codeChallenge, forceReauth=false
      expect(authService['getOidcAuthorizationUrl']).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(String),
        false,
      );
    });

    it('should include code_challenge param in the authorization URL', () => {
      const reply = {
        header: jest.fn().mockReturnThis(),
        status: jest.fn().mockReturnThis(),
        redirect: jest.fn(),
      };
      (authService['getOidcAuthorizationUrl'] as jest.Mock).mockImplementation(
        (state: string, nonce: string, codeChallenge: string) =>
          `https://provider/authorize?state=${state}&nonce=${nonce}&code_challenge=${codeChallenge}&code_challenge_method=S256`,
      );

      controller.oidcLogin(undefined, reply as any);

      const redirectUrl = (reply.redirect as jest.Mock).mock.calls[0][0] as string;
      expect(redirectUrl).toContain('code_challenge=');
      expect(redirectUrl).toContain('code_challenge_method=S256');
    });
  });

  describe('GET /auth/oidc/callback', () => {
    /** Build a valid cookie header value for the OIDC state cookie (nonce.codeVerifier.state format). */
    const makeStateCookie = (nonce: string, codeVerifier: string, state: string) =>
      `${nonce}.${codeVerifier}.${state}`;

    const makeRequest = (cookieValue?: string) => ({
      cookies: cookieValue ? { cq_oidc_state: cookieValue } : {},
    });

    const makeReply = () => ({
      header: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
      redirect: jest.fn(),
    });

    it('should redirect to /login?error=oidc_failed when IdP returns error', async () => {
      const reply = makeReply();
      const request = makeRequest(makeStateCookie('n', 'v', 'valid-state'));

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
      const request = makeRequest(makeStateCookie('n', 'v', 'wrong-state'));

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
      const stateValue = 'valid-state';
      const reply = makeReply();
      const request = makeRequest(makeStateCookie('mynonce', 'myverifier', stateValue));

      await controller.oidcCallback(
        'bad-code',
        stateValue,
        undefined as any,
        undefined as any,
        request as any,
        reply as any,
      );

      expect(reply.status).toHaveBeenCalledWith(302);
      expect(reply.redirect).toHaveBeenCalledWith('/login?error=oidc_failed');
    });

    describe('oidc callback with link action', () => {
      it('should link OIDC credential and redirect to /user?linked=oidc', async () => {
        (authService['linkOidcCredential'] as jest.Mock).mockResolvedValue(undefined);
        const stateValue = 'state123:link';
        const request = makeRequest(makeStateCookie('mynonce', 'myverifier', stateValue));
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

        expect(authService['linkOidcCredential']).toHaveBeenCalledWith(
          1,
          'auth-code',
          'mynonce',
          'myverifier',
        );
        expect(reply.redirect).toHaveBeenCalledWith('/user/account?linked=oidc');
      });

      it('should redirect to /user?error=oidc_conflict on link ConflictException', async () => {
        (authService['linkOidcCredential'] as jest.Mock).mockRejectedValue(
          new ConflictException('already linked'),
        );
        const stateValue = 'state123:link';
        const request = makeRequest(makeStateCookie('mynonce', 'myverifier', stateValue));
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

        expect(reply.redirect).toHaveBeenCalledWith('/user/account?error=oidc_conflict');
      });

      it('should redirect to /user?error=oidc_failed on link generic error', async () => {
        (authService['linkOidcCredential'] as jest.Mock).mockRejectedValue(
          new Error('token exchange failed'),
        );
        const stateValue = 'state123:link';
        const request = makeRequest(makeStateCookie('mynonce', 'myverifier', stateValue));
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

        expect(reply.redirect).toHaveBeenCalledWith('/user/account?error=oidc_failed');
      });

      it('should redirect to /user?error=session_expired when no valid session', async () => {
        const stateValue = 'state123:link';
        const request = makeRequest(makeStateCookie('mynonce', 'myverifier', stateValue));
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

        expect(reply.redirect).toHaveBeenCalledWith('/user/account?error=session_expired');
      });
    });

    describe('oidc callback with unlink action', () => {
      it('should unlink OIDC credential and redirect to /user?unlinked=oidc', async () => {
        (authService['unlinkOidcCredential'] as jest.Mock).mockResolvedValue(undefined);
        const stateValue = 'state123:unlink';
        const request = makeRequest(makeStateCookie('mynonce', 'myverifier', stateValue));
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

        expect(authService['unlinkOidcCredential']).toHaveBeenCalledWith(
          1,
          'auth-code',
          'mynonce',
          'myverifier',
        );
        expect(reply.redirect).toHaveBeenCalledWith('/user/account?unlinked=oidc');
      });

      it('should redirect to /user?error=last_credential on unlink ConflictException', async () => {
        (authService['unlinkOidcCredential'] as jest.Mock).mockRejectedValue(
          new ConflictException('last credential'),
        );
        const stateValue = 'state123:unlink';
        const request = makeRequest(makeStateCookie('mynonce', 'myverifier', stateValue));
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

        expect(reply.redirect).toHaveBeenCalledWith('/user/account?error=last_credential');
      });
    });

    describe('oidc callback login redirect', () => {
      it('should redirect to /register/oidc when username starts with user_', async () => {
        (authService['oidcCallback'] as jest.Mock).mockResolvedValue({
          sessionId: 'new-session',
          user: { userId: 2, username: 'user_a1b2c3d4', displayName: null },
        });
        const stateValue = 'state123';
        const request = makeRequest(makeStateCookie('mynonce', 'myverifier', stateValue));
        const reply = makeReply();

        await controller.oidcCallback(
          'auth-code',
          stateValue,
          undefined as any,
          undefined as any,
          request as any,
          reply as any,
        );

        expect(reply.redirect).toHaveBeenCalledWith('/register/oidc');
      });

      it('should redirect to / when username does not start with user_', async () => {
        (authService['oidcCallback'] as jest.Mock).mockResolvedValue({
          sessionId: 'new-session',
          user: { userId: 1, username: 'alice', displayName: 'Alice' },
        });
        const stateValue = 'state123';
        const request = makeRequest(makeStateCookie('mynonce', 'myverifier', stateValue));
        const reply = makeReply();

        await controller.oidcCallback(
          'auth-code',
          stateValue,
          undefined as any,
          undefined as any,
          request as any,
          reply as any,
        );

        expect(reply.redirect).toHaveBeenCalledWith('/');
      });
    });

    describe('oidc callback with delete-account action', () => {
      it('should redirect to /user?action=delete-account', async () => {
        const stateValue = 'state123:delete-account';
        const request = makeRequest(makeStateCookie('mynonce', 'myverifier', stateValue));
        const reply = makeReply();

        await controller.oidcCallback(
          'auth-code',
          stateValue,
          undefined as any,
          undefined as any,
          request as any,
          reply as any,
        );

        expect(authService['oidcCallback']).toHaveBeenCalledWith(
          'auth-code',
          'mynonce',
          'myverifier',
        );
        expect(reply.redirect).toHaveBeenCalledWith('/user/account?action=delete-account');
      });
    });
  });

  describe('POST /auth/oidc/backchannel-logout', () => {
    it('should return 200 and call backchannelLogout with the token', async () => {
      (authService['backchannelLogout'] as jest.Mock).mockResolvedValue(undefined);
      const request = { body: { logout_token: 'signed-logout-token' } };

      await controller.backchannelLogout(request as any);

      expect(authService['backchannelLogout']).toHaveBeenCalledWith('signed-logout-token');
    });

    it('should throw BadRequestException when logout_token is missing', async () => {
      const request = { body: {} };

      await expect(controller.backchannelLogout(request as any)).rejects.toThrow(
        BadRequestException,
      );
      expect(authService['backchannelLogout']).not.toHaveBeenCalled();
    });

    it('should propagate errors from backchannelLogout', async () => {
      (authService['backchannelLogout'] as jest.Mock).mockRejectedValue(
        new UnauthorizedException('invalid token'),
      );
      const request = { body: { logout_token: 'bad-token' } };

      await expect(controller.backchannelLogout(request as any)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('POST /auth/logout', () => {
    const makeReply = () => ({
      header: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
    });

    it('should return { ok: true } with no endSessionUrl for a basic session', async () => {
      sessionService['validateSession'] = jest.fn().mockResolvedValue({
        userId: 1,
        username: 'alice',
        displayName: null,
        authMethod: 'basic',
        createdAt: new Date(),
      });
      sessionService['deleteSession'] = jest.fn().mockResolvedValue(undefined);
      (authService['getEndSessionUrl'] as jest.Mock).mockReturnValue(null);
      const request = { cookies: { cq_session: 'session-abc' } };
      const reply = makeReply();

      const result = await controller.logout(request as any, reply as any);

      expect(result).toEqual({ ok: true });
      expect(authService['getEndSessionUrl']).not.toHaveBeenCalled();
    });

    it('should return endSessionUrl when the session is an OIDC session and IdP supports end_session', async () => {
      sessionService['validateSession'] = jest.fn().mockResolvedValue({
        userId: 1,
        username: 'alice',
        displayName: null,
        authMethod: 'oidc',
        createdAt: new Date(),
      });
      sessionService['deleteSession'] = jest.fn().mockResolvedValue(undefined);
      (authService['getEndSessionUrl'] as jest.Mock).mockReturnValue(
        'https://idp.example.com/end-session?post_logout_redirect_uri=http%3A%2F%2Flocalhost%3A4200',
      );
      const request = { cookies: { cq_session: 'session-abc' } };
      const reply = makeReply();

      const result = await controller.logout(request as any, reply as any);

      expect(authService['getEndSessionUrl']).toHaveBeenCalledWith();
      expect(result).toEqual({
        ok: true,
        endSessionUrl:
          'https://idp.example.com/end-session?post_logout_redirect_uri=http%3A%2F%2Flocalhost%3A4200',
      });
    });

    it('should return { ok: true } with no endSessionUrl for an OIDC session when IdP has no end_session_endpoint', async () => {
      sessionService['validateSession'] = jest.fn().mockResolvedValue({
        userId: 1,
        username: 'alice',
        displayName: null,
        authMethod: 'oidc',
        createdAt: new Date(),
      });
      sessionService['deleteSession'] = jest.fn().mockResolvedValue(undefined);
      (authService['getEndSessionUrl'] as jest.Mock).mockReturnValue(null);
      const request = { cookies: { cq_session: 'session-abc' } };
      const reply = makeReply();

      const result = await controller.logout(request as any, reply as any);

      expect(result).toEqual({ ok: true });
    });
  });
});
