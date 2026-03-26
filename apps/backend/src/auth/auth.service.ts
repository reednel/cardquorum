import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import * as jose from 'jose';
import { CredentialRepository, UserRepository } from '@cardquorum/db';
import { AuthMethod, AuthStrategy, RegisterRequest, SessionIdentity } from '@cardquorum/shared';
import { SessionService } from './session.service';

export interface AuthResult {
  sessionId: string;
  user: SessionIdentity;
}

export interface AuthConfig {
  strategies: AuthStrategy[];
  oidcIssuer?: string;
  oidcClientId?: string;
  oidcClientSecret?: string;
  oidcRedirectUri?: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly strategies: ReadonlySet<AuthStrategy>;
  private readonly oidcIssuer?: string;
  private readonly oidcClientId?: string;
  private readonly oidcClientSecret?: string;
  private readonly oidcRedirectUri?: string;
  private authorizationEndpoint?: string;
  private tokenEndpoint?: string;
  private jwks?: ReturnType<typeof jose.createRemoteJWKSet>;

  constructor(
    private readonly userRepo: UserRepository,
    private readonly credentialRepo: CredentialRepository,
    private readonly sessionService: SessionService,
    config: AuthConfig,
  ) {
    this.strategies = new Set(config.strategies);
    if (this.strategies.has('oidc')) {
      if (
        !config.oidcIssuer ||
        !config.oidcClientId ||
        !config.oidcClientSecret ||
        !config.oidcRedirectUri
      ) {
        throw new Error(
          'OIDC strategy enabled but missing required config (issuer, clientId, clientSecret, redirectUri)',
        );
      }
      this.oidcIssuer = config.oidcIssuer;
      this.oidcClientId = config.oidcClientId;
      this.oidcClientSecret = config.oidcClientSecret;
      this.oidcRedirectUri = config.oidcRedirectUri;
    }
  }

  /** Fetches the OIDC discovery document and caches endpoint URLs + JWKS.
   *  Must be called after construction when OIDC is enabled. */
  async initOidc(): Promise<void> {
    if (!this.strategies.has('oidc')) return;

    const discoveryUrl = `${this.oidcIssuer}/.well-known/openid-configuration`;
    const response = await fetch(discoveryUrl);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch OIDC discovery document from ${discoveryUrl}: ${response.status}`,
      );
    }

    const discovery = await response.json();
    this.authorizationEndpoint = discovery.authorization_endpoint;
    this.tokenEndpoint = discovery.token_endpoint;
    this.jwks = jose.createRemoteJWKSet(new URL(discovery.jwks_uri));
    this.logger.log(`OIDC discovery complete: authorize=${this.authorizationEndpoint}`);
  }

  get enabledStrategies(): AuthStrategy[] {
    return [...this.strategies];
  }

  isStrategyEnabled(strategy: AuthStrategy): boolean {
    return this.strategies.has(strategy);
  }

  async register(dto: RegisterRequest): Promise<AuthResult> {
    this.requireStrategy('basic');

    if (dto.username.toLowerCase().startsWith('deleted_')) {
      throw new BadRequestException('Username prefix "deleted_" is reserved');
    }

    if (dto.username.toLowerCase().startsWith('user_')) {
      throw new BadRequestException('Username prefix "user_" is reserved');
    }

    const existing = await this.userRepo.findByUsername(dto.username);
    if (existing) {
      throw new ConflictException('Username already taken');
    }

    const user = await this.userRepo.create({
      username: dto.username,
      displayName: dto.displayName,
    });

    const passwordHash = await bcrypt.hash(dto.password, 10);
    await this.credentialRepo.upsertCredential(user.id, 'basic', passwordHash);

    const sessionId = await this.sessionService.createSession(user.id, 'basic');
    return {
      sessionId,
      user: {
        userId: user.id,
        username: user.username,
        displayName: user.displayName,
        authMethod: 'basic' as const,
      },
    };
  }

  async oidcRegister(userId: number, username: string, displayName: string): Promise<void> {
    this.requireStrategy('oidc');

    if (username.toLowerCase().startsWith('deleted_')) {
      throw new BadRequestException('Username prefix "deleted_" is reserved');
    }
    if (username.toLowerCase().startsWith('user_')) {
      throw new BadRequestException('Username prefix "user_" is reserved');
    }

    const existing = await this.userRepo.findByUsername(username);
    if (existing) {
      throw new ConflictException('Username already taken');
    }

    await this.userRepo.updateUsername(userId, username);
    await this.userRepo.updateDisplayName(userId, displayName);
  }

  async login(dto: { username: string; password: string }): Promise<AuthResult> {
    this.requireStrategy('basic');

    const user = await this.userRepo.findByUsername(dto.username);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const hash = await this.credentialRepo.findCredentialByUserId(user.id, 'basic');
    if (!hash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(dto.password, hash);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const sessionId = await this.sessionService.createSession(user.id, 'basic');
    return {
      sessionId,
      user: {
        userId: user.id,
        username: user.username,
        displayName: user.displayName,
        authMethod: 'basic' as const,
      },
    };
  }

  async oidcCallback(code: string): Promise<AuthResult> {
    this.requireStrategy('oidc');

    const tokenResponse = await this.exchangeOidcCode(code);
    const identity = await this.verifyIdToken(tokenResponse.id_token);

    const user = await this.credentialRepo.findOrCreateUserByOidc(
      identity.sub,
      identity.displayName,
    );

    const sessionId = await this.sessionService.createSession(user.id, 'oidc');
    return {
      sessionId,
      user: {
        userId: user.id,
        username: user.username,
        displayName: user.displayName,
        authMethod: 'oidc' as const,
      },
    };
  }

  getOidcAuthorizationUrl(state: string, prompt?: string): string {
    this.requireStrategy('oidc');
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.oidcClientId!,
      redirect_uri: this.oidcRedirectUri!,
      scope: 'openid profile email',
      state,
    });
    if (prompt) {
      params.set('prompt', prompt);
    }
    return `${this.authorizationEndpoint}?${params}`;
  }

  async linkBasicCredential(userId: number, password: string): Promise<void> {
    this.requireStrategy('basic');
    const existing = await this.credentialRepo.findCredentialByUserId(userId, 'basic');
    if (existing) {
      throw new ConflictException('Basic credential already exists');
    }
    const hash = await bcrypt.hash(password, 10);
    await this.credentialRepo.insertCredential(userId, 'basic', hash);
  }

  async linkOidcCredential(userId: number, code: string): Promise<void> {
    this.requireStrategy('oidc');
    const tokenResponse = await this.exchangeOidcCode(code);
    const identity = await this.verifyIdToken(tokenResponse.id_token);
    const existingUser = await this.credentialRepo.findUserByCredential('oidc', identity.sub);
    if (existingUser && existingUser.id !== userId) {
      throw new ConflictException('This OIDC identity is already linked to another account');
    }
    await this.credentialRepo.upsertCredential(userId, 'oidc', identity.sub);
  }

  async unlinkCredential(userId: number, method: AuthMethod): Promise<void> {
    const methods = await this.credentialRepo.findMethodsByUserId(userId);
    const remainingEnabled = methods.filter(
      (m) => m !== method && this.strategies.has(m as AuthStrategy),
    );
    if (remainingEnabled.length === 0) {
      throw new ConflictException('Cannot remove last credential for an enabled auth strategy');
    }
    await this.credentialRepo.deleteByUserIdAndMethod(userId, method);
  }

  async unlinkOidcCredential(userId: number, code: string): Promise<void> {
    this.requireStrategy('oidc');
    const tokenResponse = await this.exchangeOidcCode(code);
    const identity = await this.verifyIdToken(tokenResponse.id_token);
    const storedSub = await this.credentialRepo.findCredentialByUserId(userId, 'oidc');
    if (storedSub !== identity.sub) {
      throw new UnauthorizedException('OIDC identity does not match stored credential');
    }
    await this.unlinkCredential(userId, 'oidc');
  }

  async getCredentialMethods(userId: number): Promise<AuthMethod[]> {
    const methods = await this.credentialRepo.findMethodsByUserId(userId);
    return methods as AuthMethod[];
  }

  async verifyBasicCredential(userId: number, password: string): Promise<void> {
    const hash = await this.credentialRepo.findCredentialByUserId(userId, 'basic');
    if (!hash || !(await bcrypt.compare(password, hash))) {
      throw new UnauthorizedException('Invalid password');
    }
  }

  private requireStrategy(strategy: AuthStrategy): void {
    if (!this.strategies.has(strategy)) {
      throw new NotFoundException(`Auth strategy '${strategy}' is not enabled`);
    }
  }

  private async exchangeOidcCode(code: string): Promise<{ id_token: string }> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.oidcRedirectUri!,
      client_id: this.oidcClientId!,
      client_secret: this.oidcClientSecret!,
    });

    const response = await fetch(this.tokenEndpoint!, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!response.ok) {
      this.logger.warn(`OIDC token exchange failed: ${response.status}`);
      throw new UnauthorizedException('OIDC authentication failed');
    }

    return response.json();
  }

  private async verifyIdToken(idToken: string): Promise<{ sub: string; displayName: string }> {
    const { payload } = await jose.jwtVerify(idToken, this.jwks!, {
      issuer: this.oidcIssuer,
      audience: this.oidcClientId,
    });

    if (!payload.sub) {
      throw new UnauthorizedException('OIDC token missing sub claim');
    }

    const displayName =
      (payload['preferred_username'] as string) ?? (payload['name'] as string) ?? payload.sub;

    return { sub: payload.sub, displayName };
  }
}
