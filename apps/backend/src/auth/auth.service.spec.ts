import { NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { CredentialRepository, UserRepository } from '@cardquorum/db';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';

jest.mock('jose', () => ({
  createRemoteJWKSet: jest.fn().mockReturnValue(jest.fn()),
  jwtVerify: jest.fn(),
}));

describe('AuthService', () => {
  let service: AuthService;
  let userRepo: jest.Mocked<Pick<UserRepository, 'findByUsername' | 'create'>>;
  let credentialRepo: jest.Mocked<
    Pick<
      CredentialRepository,
      'findCredentialByUserId' | 'upsertCredential' | 'findOrCreateUserByOidc'
    >
  >;
  let sessionService: jest.Mocked<Pick<SessionService, 'createSession'>>;
  let passwordHash: string;

  beforeAll(async () => {
    passwordHash = await bcrypt.hash('password', 10);
  });

  beforeEach(() => {
    userRepo = {
      findByUsername: jest.fn(),
      create: jest.fn(),
    };
    credentialRepo = {
      findCredentialByUserId: jest.fn(),
      upsertCredential: jest.fn(),
      findOrCreateUserByOidc: jest.fn(),
    };
    sessionService = {
      createSession: jest.fn().mockResolvedValue('session-id'),
    };
  });

  describe('with basic strategy enabled', () => {
    beforeEach(() => {
      service = new AuthService(
        userRepo as unknown as UserRepository,
        credentialRepo as unknown as CredentialRepository,
        sessionService as unknown as SessionService,
        { strategies: ['basic'] },
      );
    });

    it('login should return session and user', async () => {
      userRepo.findByUsername.mockResolvedValue({
        id: 1,
        username: 'alice',
        displayName: 'Alice',
        email: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      });
      credentialRepo.findCredentialByUserId.mockResolvedValue(passwordHash);

      const result = await service.login({ username: 'alice', password: 'password' });
      expect(result.user).toEqual({ userId: 1, displayName: 'Alice', authMethod: 'basic' });
      expect(result.sessionId).toBe('session-id');
    });

    it('login should throw when basic strategy is disabled', async () => {
      const oidcOnly = new AuthService(
        userRepo as unknown as UserRepository,
        credentialRepo as unknown as CredentialRepository,
        sessionService as unknown as SessionService,
        {
          strategies: ['oidc'],
          oidcIssuer: 'https://example.com',
          oidcClientId: 'id',
          oidcClientSecret: 'secret',
          oidcRedirectUri: 'http://localhost/callback',
        },
      );

      await expect(oidcOnly.login({ username: 'a', password: 'b' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('register should throw when basic strategy is disabled', async () => {
      const oidcOnly = new AuthService(
        userRepo as unknown as UserRepository,
        credentialRepo as unknown as CredentialRepository,
        sessionService as unknown as SessionService,
        {
          strategies: ['oidc'],
          oidcIssuer: 'https://example.com',
          oidcClientId: 'id',
          oidcClientSecret: 'secret',
          oidcRedirectUri: 'http://localhost/callback',
        },
      );

      await expect(
        oidcOnly.register({ username: 'a', displayName: 'A', password: 'b' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should reject usernames starting with deleted_', async () => {
      await expect(
        service.register({ username: 'deleted_hacker', displayName: 'Hacker', password: 'pw123' }),
      ).rejects.toThrow('reserved');
    });
  });

  describe('oidcCallback when oidc is disabled', () => {
    it('should throw NotFoundException', async () => {
      const basicOnly = new AuthService(
        userRepo as unknown as UserRepository,
        credentialRepo as unknown as CredentialRepository,
        sessionService as unknown as SessionService,
        { strategies: ['basic'] },
      );

      await expect(basicOnly.oidcCallback('code')).rejects.toThrow(NotFoundException);
    });
  });

  describe('isStrategyEnabled', () => {
    it('should return true for enabled strategies', () => {
      const both = new AuthService(
        userRepo as unknown as UserRepository,
        credentialRepo as unknown as CredentialRepository,
        sessionService as unknown as SessionService,
        {
          strategies: ['basic', 'oidc'],
          oidcIssuer: 'https://example.com',
          oidcClientId: 'id',
          oidcClientSecret: 'secret',
          oidcRedirectUri: 'http://localhost/callback',
        },
      );
      expect(both.isStrategyEnabled('basic')).toBe(true);
      expect(both.isStrategyEnabled('oidc')).toBe(true);
    });

    it('should return false for disabled strategies', () => {
      const basicOnly = new AuthService(
        userRepo as unknown as UserRepository,
        credentialRepo as unknown as CredentialRepository,
        sessionService as unknown as SessionService,
        { strategies: ['basic'] },
      );
      expect(basicOnly.isStrategyEnabled('oidc')).toBe(false);
    });
  });

  describe('enabledStrategies', () => {
    it('should return the list of enabled strategies', () => {
      const both = new AuthService(
        userRepo as unknown as UserRepository,
        credentialRepo as unknown as CredentialRepository,
        sessionService as unknown as SessionService,
        {
          strategies: ['basic', 'oidc'],
          oidcIssuer: 'https://example.com',
          oidcClientId: 'id',
          oidcClientSecret: 'secret',
          oidcRedirectUri: 'http://localhost/callback',
        },
      );
      expect(both.enabledStrategies).toEqual(['basic', 'oidc']);
    });
  });

  describe('constructor validation', () => {
    it('should throw if oidc strategy enabled without required config', () => {
      expect(
        () =>
          new AuthService(
            userRepo as unknown as UserRepository,
            credentialRepo as unknown as CredentialRepository,
            sessionService as unknown as SessionService,
            { strategies: ['oidc'] },
          ),
      ).toThrow('OIDC strategy enabled but missing required config');
    });
  });

  describe('initOidc', () => {
    it('should fetch discovery document and set endpoints', async () => {
      const discovery = {
        authorization_endpoint: 'https://example.com/authorize',
        token_endpoint: 'https://example.com/token',
        jwks_uri: 'https://example.com/jwks',
      };
      const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(discovery),
      } as Response);

      const svc = new AuthService(
        userRepo as unknown as UserRepository,
        credentialRepo as unknown as CredentialRepository,
        sessionService as unknown as SessionService,
        {
          strategies: ['oidc'],
          oidcIssuer: 'https://example.com',
          oidcClientId: 'id',
          oidcClientSecret: 'secret',
          oidcRedirectUri: 'http://localhost/callback',
        },
      );

      await svc.initOidc();

      expect(fetchSpy).toHaveBeenCalledWith('https://example.com/.well-known/openid-configuration');
      expect(svc.getOidcAuthorizationUrl('state123')).toContain('https://example.com/authorize?');

      fetchSpy.mockRestore();
    });

    it('should throw if discovery fetch fails', async () => {
      const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 404,
      } as Response);

      const svc = new AuthService(
        userRepo as unknown as UserRepository,
        credentialRepo as unknown as CredentialRepository,
        sessionService as unknown as SessionService,
        {
          strategies: ['oidc'],
          oidcIssuer: 'https://example.com',
          oidcClientId: 'id',
          oidcClientSecret: 'secret',
          oidcRedirectUri: 'http://localhost/callback',
        },
      );

      await expect(svc.initOidc()).rejects.toThrow('Failed to fetch OIDC discovery document');

      fetchSpy.mockRestore();
    });

    it('should be a no-op when oidc is not enabled', async () => {
      const fetchSpy = jest.spyOn(globalThis, 'fetch');

      const svc = new AuthService(
        userRepo as unknown as UserRepository,
        credentialRepo as unknown as CredentialRepository,
        sessionService as unknown as SessionService,
        { strategies: ['basic'] },
      );

      await svc.initOidc();

      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    });
  });
});
