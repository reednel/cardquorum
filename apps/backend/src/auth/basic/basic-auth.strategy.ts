import { Injectable, Logger } from '@nestjs/common';
import * as jose from 'jose';
import { UserIdentity } from '@cardquorum/shared';
import { AuthStrategyService } from '../auth-strategy.interface';

@Injectable()
export class BasicAuthStrategy implements AuthStrategyService {
  private readonly logger = new Logger(BasicAuthStrategy.name);
  private readonly secret: Uint8Array;

  constructor(jwtSecret: string) {
    this.secret = new TextEncoder().encode(jwtSecret);
  }

  async createToken(identity: UserIdentity): Promise<string> {
    return new jose.SignJWT({ displayName: identity.displayName })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(String(identity.userId))
      .setIssuedAt()
      .setExpirationTime('7d')
      .sign(this.secret);
  }

  async validateToken(token: string): Promise<UserIdentity | null> {
    try {
      const { payload } = await jose.jwtVerify(token, this.secret);
      if (!payload.sub) return null;
      return {
        userId: Number(payload.sub),
        displayName: (payload['displayName'] as string) ?? payload.sub,
      };
    } catch (err) {
      this.logger.debug(`Token validation failed: ${err}`);
      return null;
    }
  }
}
