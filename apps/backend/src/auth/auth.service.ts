import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import * as jose from 'jose';
import { CredentialRepository, UserRepository } from '@cardquorum/db';
import { AuthStrategy, RegisterRequest, UserIdentity } from '@cardquorum/shared';
import { SessionService } from './session.service';

export interface AuthResult {
  sessionId: string;
  user: UserIdentity;
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

    const sessionId = await this.sessionService.createSession(user.id);
    return { sessionId, user: { userId: user.id, displayName: user.displayName } };
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

    const sessionId = await this.sessionService.createSession(user.id);
    return { sessionId, user: { userId: user.id, displayName: user.displayName } };
  }

  async oidcCallback(code: string): Promise<AuthResult> {
    this.requireStrategy('oidc');

    const tokenResponse = await this.exchangeOidcCode(code);
    const identity = await this.verifyIdToken(tokenResponse.id_token);

    const user = await this.credentialRepo.findOrCreateUserByOidc(
      identity.sub,
      identity.displayName,
    );

    const sessionId = await this.sessionService.createSession(user.id);
    return { sessionId, user: { userId: user.id, displayName: user.displayName } };
  }

  getOidcAuthorizationUrl(state: string): string {
    this.requireStrategy('oidc');
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.oidcClientId!,
      redirect_uri: this.oidcRedirectUri!,
      scope: 'openid profile email',
      state,
    });
    return `${this.authorizationEndpoint}?${params}`;
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
