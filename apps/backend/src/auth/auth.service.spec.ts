import { ConflictException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { type CredentialRepository, type UserRepository } from '@cardquorum/db';
import { AuthService } from './auth.service';
import { type SessionService } from './session.service';

jest.mock('jose', () => ({
  createRemoteJWKSet: jest.fn().mockReturnValue(jest.fn()),
  jwtVerify: jest.fn(),
}));

describe('AuthService', () => {
  let service: AuthService;
  let userRepo: jest.Mocked<Pick<UserRepository, 'findByUsername' | 'create' | 'updateUsername'>>;
  let credentialRepo: jest.Mocked<
    Pick<
      CredentialRepository,
      | 'findCredentialByUserId'
      | 'upsertCredential'
      | 'findOrCreateUserByOidc'
      | 'insertCredential'
      | 'findMethodsByUserId'
      | 'deleteByUserIdAndMethod'
      | 'findUserByCredential'
    >
  >;
  let sessionService: jest.Mocked<
    Pick<SessionService, 'createSession' | 'deleteAllUserSessions' | 'deleteSessionByOidcSid'>
  >;
  let passwordHash: string;

  beforeAll(async () => {
    passwordHash = await bcrypt.hash('password', 10);
  });

  beforeEach(() => {
    userRepo = {
      findByUsername: jest.fn(),
      create: jest.fn(),
      updateUsername: jest.fn(),
    };
    credentialRepo = {
      findCredentialByUserId: jest.fn(),
      upsertCredential: jest.fn(),
      findOrCreateUserByOidc: jest.fn(),
      insertCredential: jest.fn(),
      findMethodsByUserId: jest.fn(),
      deleteByUserIdAndMethod: jest.fn(),
      findUserByCredential: jest.fn(),
    };
    sessionService = {
      createSession: jest.fn().mockResolvedValue('session-id'),
      deleteAllUserSessions: jest.fn().mockResolvedValue(undefined),
      deleteSessionByOidcSid: jest.fn().mockResolvedValue(undefined),
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
        preferredHue: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      });
      credentialRepo.findCredentialByUserId.mockResolvedValue(passwordHash);

      const result = await service.login({ username: 'alice', password: 'password' });
      expect(result.user).toEqual({
        userId: 1,
        username: 'alice',
        displayName: 'Alice',
        authMethod: 'basic',
      });
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

      await expect(oidcOnly.register({ username: 'a', password: 'b' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should reject usernames starting with deleted_', async () => {
      await expect(
        service.register({ username: 'deleted_hacker', password: 'pw123456' }),
      ).rejects.toThrow('Username must be');
    });

    it('should reject invalid usernames', async () => {
      await expect(service.register({ username: 'ab', password: 'pw123456' })).rejects.toThrow(
        'Username must be',
      );
    });

    it('should reject taken usernames', async () => {
      userRepo.findByUsername.mockResolvedValue({
        id: 1,
        username: 'alice',
        displayName: null,
        email: null,
        preferredHue: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      });
      await expect(service.register({ username: 'alice', password: 'pw123456' })).rejects.toThrow(
        'Username already taken',
      );
    });

    it('register should create user with null displayName', async () => {
      userRepo.findByUsername.mockResolvedValue(null as any);
      userRepo.create.mockResolvedValue({
        id: 2,
        username: 'bob',
        displayName: null,
        email: null,
        preferredHue: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      });
      credentialRepo.upsertCredential.mockResolvedValue({} as any);

      const result = await service.register({ username: 'bob', password: 'password' });
      expect(result.user).toEqual({
        userId: 2,
        username: 'bob',
        displayName: null,
        authMethod: 'basic',
      });
    });
  });

  describe('oidcRegister', () => {
    let oidcService: AuthService;

    beforeEach(() => {
      oidcService = new AuthService(
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
    });

    it('should update username', async () => {
      userRepo.findByUsername.mockResolvedValue(null as any);
      userRepo.updateUsername.mockResolvedValue(undefined as any);

      await oidcService.oidcRegister(1, 'newname');

      expect(userRepo.updateUsername).toHaveBeenCalledWith(1, 'newname');
    });

    it('should reject invalid username', async () => {
      await expect(oidcService.oidcRegister(1, 'ab')).rejects.toThrow('Username must be');
    });

    it('should reject taken username', async () => {
      userRepo.findByUsername.mockResolvedValue({
        id: 99,
        username: 'taken',
        displayName: null,
        email: null,
        preferredHue: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      });

      await expect(oidcService.oidcRegister(1, 'taken')).rejects.toThrow('Username already taken');
    });

    it('should throw when oidc strategy is disabled', async () => {
      await expect(service.oidcRegister(1, 'newname')).rejects.toThrow(NotFoundException);
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

      await expect(basicOnly.oidcCallback('code', 'nonce', 'verifier')).rejects.toThrow(
        NotFoundException,
      );
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

  describe('credential linking', () => {
    let bothService: AuthService;

    beforeEach(() => {
      bothService = new AuthService(
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
    });

    describe('linkBasicCredential', () => {
      it('should hash password and insert credential', async () => {
        credentialRepo.findCredentialByUserId.mockResolvedValue(null);
        credentialRepo.insertCredential.mockResolvedValue({} as any);
        await bothService.linkBasicCredential(1, 'newpassword');
        expect(credentialRepo.findCredentialByUserId).toHaveBeenCalledWith(1, 'basic');
        expect(credentialRepo.insertCredential).toHaveBeenCalledWith(
          1,
          'basic',
          expect.any(String),
        );
      });

      it('should throw ConflictException if basic credential exists', async () => {
        credentialRepo.findCredentialByUserId.mockResolvedValue('existing-hash');
        await expect(bothService.linkBasicCredential(1, 'newpassword')).rejects.toThrow(
          ConflictException,
        );
        expect(credentialRepo.insertCredential).not.toHaveBeenCalled();
      });
    });

    describe('unlinkCredential', () => {
      it('should delete credential when another enabled method remains', async () => {
        credentialRepo.findMethodsByUserId.mockResolvedValue(['basic', 'oidc']);
        await bothService.unlinkCredential(1, 'basic');
        expect(credentialRepo.deleteByUserIdAndMethod).toHaveBeenCalledWith(1, 'basic');
      });

      it('should throw ConflictException if it is the last enabled credential', async () => {
        credentialRepo.findMethodsByUserId.mockResolvedValue(['basic']);
        await expect(bothService.unlinkCredential(1, 'basic')).rejects.toThrow(ConflictException);
        expect(credentialRepo.deleteByUserIdAndMethod).not.toHaveBeenCalled();
      });
    });

    describe('linkOidcCredential', () => {
      beforeEach(async () => {
        const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              authorization_endpoint: 'https://example.com/authorize',
              token_endpoint: 'https://example.com/token',
              jwks_uri: 'https://example.com/jwks',
            }),
        } as Response);
        await bothService.initOidc();
        fetchSpy.mockRestore();
      });

      it('should upsert OIDC credential when sub is not linked to another user', async () => {
        const jose = require('jose');
        const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ id_token: 'mock-token' }),
        } as Response);
        jose.jwtVerify.mockResolvedValue({
          payload: { sub: 'oidc-sub-123', nonce: 'mynonce', preferred_username: 'alice' },
        });
        credentialRepo.findUserByCredential.mockResolvedValue(null as any);
        credentialRepo.upsertCredential.mockResolvedValue({} as any);
        await bothService.linkOidcCredential(1, 'auth-code', 'mynonce', 'myverifier');
        expect(credentialRepo.findUserByCredential).toHaveBeenCalledWith('oidc', 'oidc-sub-123');
        expect(credentialRepo.upsertCredential).toHaveBeenCalledWith(1, 'oidc', 'oidc-sub-123');
        fetchSpy.mockRestore();
      });

      it('should throw ConflictException if sub is linked to a different user', async () => {
        const jose = require('jose');
        const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ id_token: 'mock-token' }),
        } as Response);
        jose.jwtVerify.mockResolvedValue({
          payload: { sub: 'oidc-sub-123', nonce: 'mynonce', preferred_username: 'alice' },
        });
        credentialRepo.findUserByCredential.mockResolvedValue({
          id: 99,
          username: 'other',
          displayName: 'Other',
          email: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        await expect(
          bothService.linkOidcCredential(1, 'auth-code', 'mynonce', 'myverifier'),
        ).rejects.toThrow(ConflictException);
        expect(credentialRepo.upsertCredential).not.toHaveBeenCalled();
        fetchSpy.mockRestore();
      });

      it('should throw UnauthorizedException when nonce does not match', async () => {
        const jose = require('jose');
        const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ id_token: 'mock-token' }),
        } as Response);
        jose.jwtVerify.mockResolvedValue({
          payload: { sub: 'oidc-sub-123', nonce: 'different-nonce' },
        });
        await expect(
          bothService.linkOidcCredential(1, 'auth-code', 'expected-nonce', 'myverifier'),
        ).rejects.toThrow(UnauthorizedException);
        fetchSpy.mockRestore();
      });
    });

    describe('unlinkOidcCredential', () => {
      beforeEach(async () => {
        const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              authorization_endpoint: 'https://example.com/authorize',
              token_endpoint: 'https://example.com/token',
              jwks_uri: 'https://example.com/jwks',
            }),
        } as Response);
        await bothService.initOidc();
        fetchSpy.mockRestore();
      });

      it('should delete OIDC credential when sub matches', async () => {
        const jose = require('jose');
        const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ id_token: 'mock-token' }),
        } as Response);
        jose.jwtVerify.mockResolvedValue({
          payload: { sub: 'oidc-sub-123', nonce: 'mynonce', preferred_username: 'alice' },
        });
        credentialRepo.findCredentialByUserId.mockResolvedValue('oidc-sub-123');
        credentialRepo.findMethodsByUserId.mockResolvedValue(['basic', 'oidc']);
        credentialRepo.deleteByUserIdAndMethod.mockResolvedValue(undefined);
        await bothService.unlinkOidcCredential(1, 'auth-code', 'mynonce', 'myverifier');
        expect(credentialRepo.deleteByUserIdAndMethod).toHaveBeenCalledWith(1, 'oidc');
        fetchSpy.mockRestore();
      });

      it('should throw UnauthorizedException when sub does not match', async () => {
        const jose = require('jose');
        const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ id_token: 'mock-token' }),
        } as Response);
        jose.jwtVerify.mockResolvedValue({
          payload: { sub: 'wrong-sub', nonce: 'mynonce', preferred_username: 'alice' },
        });
        credentialRepo.findCredentialByUserId.mockResolvedValue('oidc-sub-123');
        await expect(
          bothService.unlinkOidcCredential(1, 'auth-code', 'mynonce', 'myverifier'),
        ).rejects.toThrow(UnauthorizedException);
        fetchSpy.mockRestore();
      });

      it('should throw ConflictException when OIDC is the last enabled credential', async () => {
        const jose = require('jose');
        const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ id_token: 'mock-token' }),
        } as Response);
        jose.jwtVerify.mockResolvedValue({
          payload: { sub: 'oidc-sub-123', nonce: 'mynonce', preferred_username: 'alice' },
        });
        credentialRepo.findCredentialByUserId.mockResolvedValue('oidc-sub-123');
        credentialRepo.findMethodsByUserId.mockResolvedValue(['oidc']);
        await expect(
          bothService.unlinkOidcCredential(1, 'auth-code', 'mynonce', 'myverifier'),
        ).rejects.toThrow(ConflictException);
        expect(credentialRepo.deleteByUserIdAndMethod).not.toHaveBeenCalled();
        fetchSpy.mockRestore();
      });
    });

    describe('getCredentialMethods', () => {
      it('should return methods from repository', async () => {
        credentialRepo.findMethodsByUserId.mockResolvedValue(['basic', 'oidc']);
        const result = await bothService.getCredentialMethods(1);
        expect(result).toEqual(['basic', 'oidc']);
      });
    });

    describe('verifyBasicCredential', () => {
      it('should not throw for valid password', async () => {
        credentialRepo.findCredentialByUserId.mockResolvedValue(passwordHash);
        await expect(bothService.verifyBasicCredential(1, 'password')).resolves.toBeUndefined();
      });

      it('should throw UnauthorizedException for wrong password', async () => {
        credentialRepo.findCredentialByUserId.mockResolvedValue(passwordHash);
        await expect(bothService.verifyBasicCredential(1, 'wrongpassword')).rejects.toThrow(
          UnauthorizedException,
        );
      });

      it('should throw UnauthorizedException when no basic credential exists', async () => {
        credentialRepo.findCredentialByUserId.mockResolvedValue(null);
        await expect(bothService.verifyBasicCredential(1, 'password')).rejects.toThrow(
          UnauthorizedException,
        );
      });
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
      expect(svc.getOidcAuthorizationUrl('state123', 'nonce123', 'challenge123')).toContain(
        'https://example.com/authorize?',
      );

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

  describe('oidcCallback', () => {
    let oidcService: AuthService;

    beforeEach(async () => {
      oidcService = new AuthService(
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
      const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            authorization_endpoint: 'https://example.com/authorize',
            token_endpoint: 'https://example.com/token',
            jwks_uri: 'https://example.com/jwks',
          }),
      } as Response);
      await oidcService.initOidc();
      fetchSpy.mockRestore();
    });

    it('should create a session with sid when the id token contains a sid claim', async () => {
      const jose = require('jose');
      const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id_token: 'mock-token' }),
      } as Response);
      jose.jwtVerify.mockResolvedValue({
        payload: { sub: 'oidc-sub-123', nonce: 'mynonce', sid: 'idp-session-abc' },
      });
      credentialRepo.findOrCreateUserByOidc.mockResolvedValue({
        id: 1,
        username: 'alice',
        displayName: null,
        email: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await oidcService.oidcCallback('auth-code', 'mynonce', 'myverifier');

      expect(sessionService.createSession).toHaveBeenCalledWith(1, 'oidc', 'idp-session-abc');
      fetchSpy.mockRestore();
    });

    it('should create a session without sid when the id token has no sid claim', async () => {
      const jose = require('jose');
      const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id_token: 'mock-token' }),
      } as Response);
      jose.jwtVerify.mockResolvedValue({
        payload: { sub: 'oidc-sub-123', nonce: 'mynonce' },
      });
      credentialRepo.findOrCreateUserByOidc.mockResolvedValue({
        id: 1,
        username: 'alice',
        displayName: null,
        email: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await oidcService.oidcCallback('auth-code', 'mynonce', 'myverifier');

      expect(sessionService.createSession).toHaveBeenCalledWith(1, 'oidc', undefined);
      fetchSpy.mockRestore();
    });
  });

  describe('getOidcAuthorizationUrl', () => {
    let oidcService: AuthService;

    beforeEach(async () => {
      oidcService = new AuthService(
        userRepo as unknown as UserRepository,
        credentialRepo as unknown as CredentialRepository,
        sessionService as unknown as SessionService,
        {
          strategies: ['oidc'],
          oidcIssuer: 'https://example.com',
          oidcClientId: 'clientid',
          oidcClientSecret: 'secret',
          oidcRedirectUri: 'http://localhost/callback',
        },
      );
      const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            authorization_endpoint: 'https://example.com/authorize',
            token_endpoint: 'https://example.com/token',
            jwks_uri: 'https://example.com/jwks',
          }),
      } as Response);
      await oidcService.initOidc();
      fetchSpy.mockRestore();
    });

    it('should include code_challenge and code_challenge_method=S256 in the URL', () => {
      const url = oidcService.getOidcAuthorizationUrl('state', 'nonce', 'mychallenge');
      const params = new URL(url).searchParams;
      expect(params.get('code_challenge')).toBe('mychallenge');
      expect(params.get('code_challenge_method')).toBe('S256');
    });

    it('should include nonce in the URL', () => {
      const url = oidcService.getOidcAuthorizationUrl('state', 'mynonce', 'challenge');
      expect(new URL(url).searchParams.get('nonce')).toBe('mynonce');
    });
  });

  describe('getEndSessionUrl', () => {
    it('should return a URL with post_logout_redirect_uri when end_session_endpoint is in discovery', async () => {
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
      const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            authorization_endpoint: 'https://example.com/authorize',
            token_endpoint: 'https://example.com/token',
            jwks_uri: 'https://example.com/jwks',
            end_session_endpoint: 'https://example.com/end-session',
          }),
      } as Response);
      await svc.initOidc();
      fetchSpy.mockRestore();

      const url = svc.getEndSessionUrl();
      expect(url).not.toBeNull();
      const params = new URL(url!).searchParams;
      expect(params.get('post_logout_redirect_uri')).toBe('http://localhost');
    });

    it('should return null when end_session_endpoint is not in discovery', async () => {
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
      const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            authorization_endpoint: 'https://example.com/authorize',
            token_endpoint: 'https://example.com/token',
            jwks_uri: 'https://example.com/jwks',
            // no end_session_endpoint
          }),
      } as Response);
      await svc.initOidc();
      fetchSpy.mockRestore();

      expect(svc.getEndSessionUrl()).toBeNull();
    });
  });

  describe('backchannelLogout', () => {
    let oidcService: AuthService;
    const BACKCHANNEL_EVENT = 'http://schemas.openid.net/event/backchannel-logout';

    beforeEach(async () => {
      oidcService = new AuthService(
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
      const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            issuer: 'https://example.com',
            authorization_endpoint: 'https://example.com/authorize',
            token_endpoint: 'https://example.com/token',
            jwks_uri: 'https://example.com/jwks',
          }),
      } as Response);
      await oidcService.initOidc();
      fetchSpy.mockRestore();
    });

    it('should delete only the matching session when sid is present in the logout token', async () => {
      const jose = require('jose');
      jose.jwtVerify.mockResolvedValue({
        payload: {
          sub: 'oidc-sub-123',
          sid: 'idp-session-abc',
          events: { [BACKCHANNEL_EVENT]: {} },
        },
      });

      await oidcService.backchannelLogout('logout-token');

      expect(sessionService.deleteSessionByOidcSid).toHaveBeenCalledWith('idp-session-abc');
      expect(sessionService.deleteAllUserSessions).not.toHaveBeenCalled();
    });

    it('should delete all user sessions when only sub is present (no sid)', async () => {
      const jose = require('jose');
      jose.jwtVerify.mockResolvedValue({
        payload: {
          sub: 'oidc-sub-123',
          events: { [BACKCHANNEL_EVENT]: {} },
        },
      });
      credentialRepo.findUserByCredential.mockResolvedValue({
        id: 1,
        username: 'alice',
        displayName: null,
        email: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await oidcService.backchannelLogout('logout-token');

      expect(sessionService.deleteAllUserSessions).toHaveBeenCalledWith(1);
      expect(sessionService.deleteSessionByOidcSid).not.toHaveBeenCalled();
    });

    it('should not throw when sub-only logout token has no matching local user', async () => {
      const jose = require('jose');
      jose.jwtVerify.mockResolvedValue({
        payload: {
          sub: 'unknown-sub',
          events: { [BACKCHANNEL_EVENT]: {} },
        },
      });
      credentialRepo.findUserByCredential.mockResolvedValue(null as any);

      await expect(oidcService.backchannelLogout('logout-token')).resolves.toBeUndefined();
      expect(sessionService.deleteAllUserSessions).not.toHaveBeenCalled();
    });

    it('should throw when the logout token contains a nonce claim', async () => {
      const jose = require('jose');
      jose.jwtVerify.mockResolvedValue({
        payload: {
          sub: 'oidc-sub-123',
          nonce: 'should-not-be-here',
          events: { [BACKCHANNEL_EVENT]: {} },
        },
      });

      await expect(oidcService.backchannelLogout('logout-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw when the events claim is missing', async () => {
      const jose = require('jose');
      jose.jwtVerify.mockResolvedValue({
        payload: { sub: 'oidc-sub-123' },
      });

      await expect(oidcService.backchannelLogout('logout-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw when the events claim does not contain the backchannel-logout event', async () => {
      const jose = require('jose');
      jose.jwtVerify.mockResolvedValue({
        payload: {
          sub: 'oidc-sub-123',
          events: { 'http://schemas.openid.net/event/something-else': {} },
        },
      });

      await expect(oidcService.backchannelLogout('logout-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw when neither sub nor sid is present', async () => {
      const jose = require('jose');
      jose.jwtVerify.mockResolvedValue({
        payload: { events: { [BACKCHANNEL_EVENT]: {} } },
      });

      await expect(oidcService.backchannelLogout('logout-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw when oidc strategy is disabled', async () => {
      const basicOnly = new AuthService(
        userRepo as unknown as UserRepository,
        credentialRepo as unknown as CredentialRepository,
        sessionService as unknown as SessionService,
        { strategies: ['basic'] },
      );

      await expect(basicOnly.backchannelLogout('logout-token')).rejects.toThrow(NotFoundException);
    });
  });
});
