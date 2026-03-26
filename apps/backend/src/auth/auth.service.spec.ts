import { ConflictException, NotFoundException, UnauthorizedException } from '@nestjs/common';
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
  let sessionService: jest.Mocked<Pick<SessionService, 'createSession'>>;
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
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      });
      await expect(service.register({ username: 'alice', password: 'pw123456' })).rejects.toThrow(
        'Username already taken',
      );
    });

    it('register should create user with null displayName', async () => {
      userRepo.findByUsername.mockResolvedValue(null);
      userRepo.create.mockResolvedValue({
        id: 2,
        username: 'bob',
        displayName: null,
        email: null,
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
      userRepo.findByUsername.mockResolvedValue(null);
      userRepo.updateUsername.mockResolvedValue(undefined);

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
      it('should upsert OIDC credential when sub is not linked to another user', async () => {
        const jose = require('jose');
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
        fetchSpy.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ id_token: 'mock-token' }),
        } as Response);
        jose.jwtVerify.mockResolvedValue({
          payload: { sub: 'oidc-sub-123', preferred_username: 'alice' },
        });
        credentialRepo.findUserByCredential.mockResolvedValue(null);
        credentialRepo.upsertCredential.mockResolvedValue({} as any);
        await bothService.linkOidcCredential(1, 'auth-code');
        expect(credentialRepo.findUserByCredential).toHaveBeenCalledWith('oidc', 'oidc-sub-123');
        expect(credentialRepo.upsertCredential).toHaveBeenCalledWith(1, 'oidc', 'oidc-sub-123');
        fetchSpy.mockRestore();
      });

      it('should throw ConflictException if sub is linked to a different user', async () => {
        const jose = require('jose');
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
        fetchSpy.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ id_token: 'mock-token' }),
        } as Response);
        jose.jwtVerify.mockResolvedValue({
          payload: { sub: 'oidc-sub-123', preferred_username: 'alice' },
        });
        credentialRepo.findUserByCredential.mockResolvedValue({
          id: 99,
          username: 'other',
          displayName: 'Other',
          email: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        await expect(bothService.linkOidcCredential(1, 'auth-code')).rejects.toThrow(
          ConflictException,
        );
        expect(credentialRepo.upsertCredential).not.toHaveBeenCalled();
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
          payload: { sub: 'oidc-sub-123', preferred_username: 'alice' },
        });
        credentialRepo.findCredentialByUserId.mockResolvedValue('oidc-sub-123');
        credentialRepo.findMethodsByUserId.mockResolvedValue(['basic', 'oidc']);
        credentialRepo.deleteByUserIdAndMethod.mockResolvedValue(undefined);
        await bothService.unlinkOidcCredential(1, 'auth-code');
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
          payload: { sub: 'wrong-sub', preferred_username: 'alice' },
        });
        credentialRepo.findCredentialByUserId.mockResolvedValue('oidc-sub-123');
        await expect(bothService.unlinkOidcCredential(1, 'auth-code')).rejects.toThrow(
          UnauthorizedException,
        );
        fetchSpy.mockRestore();
      });

      it('should throw ConflictException when OIDC is the last enabled credential', async () => {
        const jose = require('jose');
        const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ id_token: 'mock-token' }),
        } as Response);
        jose.jwtVerify.mockResolvedValue({
          payload: { sub: 'oidc-sub-123', preferred_username: 'alice' },
        });
        credentialRepo.findCredentialByUserId.mockResolvedValue('oidc-sub-123');
        credentialRepo.findMethodsByUserId.mockResolvedValue(['oidc']);
        await expect(bothService.unlinkOidcCredential(1, 'auth-code')).rejects.toThrow(
          ConflictException,
        );
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
