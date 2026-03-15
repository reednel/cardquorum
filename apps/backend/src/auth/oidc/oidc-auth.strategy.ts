import { Injectable, Logger } from '@nestjs/common';
import * as jose from 'jose';
import { CredentialRepository } from '@cardquorum/db';
import { UserIdentity } from '@cardquorum/shared';
import { AuthStrategyService } from '../auth-strategy.interface';

@Injectable()
export class OidcAuthStrategy implements AuthStrategyService {
  private readonly logger = new Logger(OidcAuthStrategy.name);
  private readonly jwks: ReturnType<typeof jose.createRemoteJWKSet>;
  private readonly issuer: string;
  private readonly clientId: string;

  constructor(
    issuer: string,
    clientId: string,
    private readonly credentialRepo: CredentialRepository,
  ) {
    this.issuer = issuer;
    this.clientId = clientId;
    this.jwks = jose.createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
  }

  async validateToken(token: string): Promise<UserIdentity | null> {
    try {
      const { payload } = await jose.jwtVerify(token, this.jwks, {
        issuer: this.issuer,
        audience: this.clientId,
      });

      if (!payload.sub) return null;

      const displayName =
        (payload['preferred_username'] as string) ?? (payload['name'] as string) ?? payload.sub;

      const user = await this.credentialRepo.findOrCreateUserByOidc(payload.sub, displayName);

      return { userId: user.id, displayName: user.displayName };
    } catch (err) {
      this.logger.debug(`OIDC token validation failed: ${err}`);
      return null;
    }
  }
}
