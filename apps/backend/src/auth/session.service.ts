import { randomBytes } from 'crypto';
import { Injectable } from '@nestjs/common';
import { SessionRepository } from '@cardquorum/db';

@Injectable()
export class SessionService {
  constructor(private readonly sessionRepo: SessionRepository) {}

  async createSession(userId: number, authMethod: 'basic' | 'oidc' = 'basic'): Promise<string> {
    const id = randomBytes(32).toString('base64url');
    await this.sessionRepo.create(id, userId, authMethod);
    return id;
  }

  async validateSession(
    sessionId: string,
  ): Promise<{ userId: number; displayName: string; authMethod: string; createdAt: Date } | null> {
    return this.sessionRepo.findValidSession(sessionId);
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.sessionRepo.deleteById(sessionId);
  }

  async deleteAllUserSessions(userId: number): Promise<void> {
    await this.sessionRepo.deleteAllByUserId(userId);
  }
}
