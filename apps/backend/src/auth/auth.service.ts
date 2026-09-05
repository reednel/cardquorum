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
import {
  AuthMethod,
  AuthStrategy,
  isValidUsername,
  RegisterRequest,
  SessionIdentity,
} from '@cardquorum/shared';
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

/** Claims extracted from a verified OIDC ID token. */
interface OidcIdentity {
  sub: string;
  sid?: string;
  preferredUsername?: string;
}

/** Logout token event claim URI per OIDC Back-Channel Logout spec. */
const BACKCHANNEL_LOGOUT_EVENT = 'http://schemas.openid.net/event/backchannel-logout';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly strategies: ReadonlySet<AuthStrategy>;
  private readonly oidcIssuer?: string;
  private readonly oidcClientId?: string;
  private readonly oidcClientSecret?: string;
  private readonly oidcRedirectUri?: string;
  private readonly oidcAppOrigin?: string;
  private authorizationEndpoint?: string;
  private tokenEndpoint?: string;
  private endSessionEndpoint?: string;
  private jwks?: ReturnType<typeof jose.createRemoteJWKSet>;
  private oidcIssuerFromDiscovery?: string;

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
      // Derive the app origin from the redirect URI — used as post_logout_redirect_uri
      this.oidcAppOrigin = new URL(config.oidcRedirectUri).origin;
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
    this.oidcIssuerFromDiscovery = discovery.issuer;
    this.authorizationEndpoint = discovery.authorization_endpoint;
    this.tokenEndpoint = discovery.token_endpoint;
    this.endSessionEndpoint = discovery.end_session_endpoint;
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

    if (!isValidUsername(dto.username)) {
      throw new BadRequestException(
        'Username must be 3-20 characters, start with a letter, and contain only letters, numbers, and underscores',
      );
    }

    const existing = await this.userRepo.findByUsername(dto.username);
    if (existing) {
      throw new ConflictException('Username already taken');
    }

    const user = await this.userRepo.create({ username: dto.username });

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

  async oidcRegister(userId: number, username: string): Promise<void> {
    this.requireStrategy('oidc');

    if (!isValidUsername(username)) {
      throw new BadRequestException(
        'Username must be 3-20 characters, start with a letter, and contain only letters, numbers, and underscores',
      );
    }

    const existing = await this.userRepo.findByUsername(username);
    if (existing) {
      throw new ConflictException('Username already taken');
    }

    await this.userRepo.updateUsername(userId, username);
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

  async oidcCallback(code: string, nonce: string, codeVerifier: string): Promise<AuthResult> {
    this.requireStrategy('oidc');

    const tokenResponse = await this.exchangeOidcCode(code, codeVerifier);
    const identity = await this.verifyIdToken(tokenResponse.id_token, nonce);

    const user = await this.credentialRepo.findOrCreateUserByOidc(
      identity.sub,
      identity.preferredUsername,
    );

    const sessionId = await this.sessionService.createSession(user.id, 'oidc', identity.sid);
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

  getOidcAuthorizationUrl(
    state: string,
    nonce: string,
    codeChallenge: string,
    forceReauth = false,
  ): string {
    this.requireStrategy('oidc');
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.oidcClientId!,
      redirect_uri: this.oidcRedirectUri!,
      scope: 'openid profile',
      state,
      nonce,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });
    if (forceReauth) {
      params.set('max_age', '0');
      params.set('prompt', 'login');
    }
    return `${this.authorizationEndpoint}?${params}`;
  }

  /**
   * Returns the IdP's end_session_endpoint URL for RP-initiated logout, or null if the
   * discovery document did not advertise one.
   */
  getEndSessionUrl(): string | null {
    if (!this.endSessionEndpoint || !this.oidcAppOrigin) return null;
    const params = new URLSearchParams({ post_logout_redirect_uri: this.oidcAppOrigin });
    return `${this.endSessionEndpoint}?${params}`;
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

  async linkOidcCredential(
    userId: number,
    code: string,
    nonce: string,
    codeVerifier: string,
  ): Promise<void> {
    this.requireStrategy('oidc');
    const tokenResponse = await this.exchangeOidcCode(code, codeVerifier);
    const identity = await this.verifyIdToken(tokenResponse.id_token, nonce);
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

  async unlinkOidcCredential(
    userId: number,
    code: string,
    nonce: string,
    codeVerifier: string,
  ): Promise<void> {
    this.requireStrategy('oidc');
    const tokenResponse = await this.exchangeOidcCode(code, codeVerifier);
    const identity = await this.verifyIdToken(tokenResponse.id_token, nonce);
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

  async changePassword(
    userId: number,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    this.requireStrategy('basic');
    const hash = await this.credentialRepo.findCredentialByUserId(userId, 'basic');
    if (!hash || !(await bcrypt.compare(currentPassword, hash))) {
      throw new UnauthorizedException('Invalid password');
    }
    const newHash = await bcrypt.hash(newPassword, 10);
    await this.credentialRepo.upsertCredential(userId, 'basic', newHash);
  }

  async verifyBasicCredential(userId: number, password: string): Promise<void> {
    const hash = await this.credentialRepo.findCredentialByUserId(userId, 'basic');
    if (!hash || !(await bcrypt.compare(password, hash))) {
      throw new UnauthorizedException('Invalid password');
    }
  }

  /**
   * Validates a backchannel logout token from the IdP and invalidates the targeted session(s).
   *
   * If the logout token contains a `sid` claim, only the session with that IdP session ID is
   * revoked — preserving other active sessions for the same user. If there is no `sid`, all
   * sessions for the identified user (`sub`) are revoked.
   */
  async backchannelLogout(logoutToken: string): Promise<void> {
    this.requireStrategy('oidc');

    const { payload } = await jose.jwtVerify(logoutToken, this.jwks!, {
      issuer: this.oidcIssuerFromDiscovery ?? this.oidcIssuer,
      audience: this.oidcClientId,
      maxTokenAge: '2m',
    });

    // Must not contain a nonce claim (spec §2.6)
    if (payload['nonce'] !== undefined) {
      throw new UnauthorizedException('Logout token must not contain a nonce claim');
    }

    // Must contain the backchannel-logout event (spec §2.4)
    const events = payload['events'] as Record<string, unknown> | undefined;
    if (!events || typeof events[BACKCHANNEL_LOGOUT_EVENT] !== 'object') {
      throw new UnauthorizedException('Logout token missing required events claim');
    }

    const sub = payload.sub;
    const sid = payload['sid'] as string | undefined;

    // Must have at least one of sub or sid (spec §2.4)
    if (!sub && !sid) {
      throw new UnauthorizedException('Logout token must contain sub or sid');
    }

    if (sid) {
      // Targeted logout — only the session matching this IdP session ID
      await this.sessionService.deleteSessionByOidcSid(sid);
    } else {
      // Fallback — revoke all local sessions for this user
      const user = await this.credentialRepo.findUserByCredential('oidc', sub!);
      if (user) {
        await this.sessionService.deleteAllUserSessions(user.id);
      }
    }
  }

  private requireStrategy(strategy: AuthStrategy): void {
    if (!this.strategies.has(strategy)) {
      throw new NotFoundException(`Auth strategy '${strategy}' is not enabled`);
    }
  }

  private async exchangeOidcCode(
    code: string,
    codeVerifier: string,
  ): Promise<{ id_token: string }> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.oidcRedirectUri!,
      client_id: this.oidcClientId!,
      client_secret: this.oidcClientSecret!,
      code_verifier: codeVerifier,
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

  private async verifyIdToken(idToken: string, nonce: string): Promise<OidcIdentity> {
    const { payload } = await jose.jwtVerify(idToken, this.jwks!, {
      issuer: this.oidcIssuerFromDiscovery ?? this.oidcIssuer,
      audience: this.oidcClientId,
      maxTokenAge: '5m',
    });

    if (!payload.sub) {
      throw new UnauthorizedException('OIDC token missing sub claim');
    }

    if (payload['nonce'] !== nonce) {
      throw new UnauthorizedException('OIDC token nonce mismatch');
    }

    const raw = payload['preferred_username'] as string | undefined;
    const preferredUsername = raw && isValidUsername(raw) ? raw : undefined;
    const sid = payload['sid'] as string | undefined;

    return { sub: payload.sub, sid, preferredUsername };
  }
}
