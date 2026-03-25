import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { CredentialRepository, RoomRepository, UserRepository } from '@cardquorum/db';
import { UserProfile, UserSearchResult } from '@cardquorum/shared';

@Injectable()
export class UserService {
  constructor(
    private readonly users: UserRepository,
    private readonly credentials: CredentialRepository,
    private readonly rooms: RoomRepository,
  ) {}

  async getProfile(userId: number): Promise<UserProfile | null> {
    const user = await this.users.findById(userId);
    if (!user) return null;

    return {
      userId: user.id,
      username: user.username,
      displayName: user.displayName,
      email: user.email,
      createdAt: user.createdAt.toISOString(),
    };
  }

  async updateDisplayName(userId: number, rawDisplayName: string): Promise<UserProfile> {
    const displayName = rawDisplayName.trim();
    if (displayName.length === 0) {
      throw new BadRequestException('Display name cannot be blank');
    }
    if (displayName.length > 50) {
      throw new BadRequestException('Display name must be 50 characters or fewer');
    }

    const updated = await this.users.updateDisplayName(userId, displayName);
    if (!updated) {
      throw new NotFoundException('User not found');
    }

    return {
      userId: updated.id,
      username: updated.username,
      displayName: updated.displayName,
      email: updated.email,
      createdAt: updated.createdAt.toISOString(),
    };
  }

  async searchUsers(query: string, excludeUserId: number): Promise<UserSearchResult[]> {
    const rows = await this.users.searchByUsername(query, excludeUserId, 20);
    return rows.map((r) => ({
      userId: r.id,
      username: r.username,
      displayName: r.displayName,
    }));
  }

  async deleteAccount(
    userId: number,
    authMethod: string,
    sessionCreatedAt: Date,
    password?: string,
  ): Promise<{ ownedRoomIds: number[] }> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (authMethod === 'basic') {
      if (!password) {
        throw new BadRequestException('Password is required for basic auth deletion');
      }
      const hash = await this.credentials.findCredentialByUserId(userId, 'basic');
      if (!hash) {
        throw new UnauthorizedException('Invalid credentials');
      }
      const valid = await bcrypt.compare(password, hash);
      if (!valid) {
        throw new UnauthorizedException('Invalid credentials');
      }
    } else {
      const FIVE_MINUTES = 5 * 60 * 1000;
      if (Date.now() - sessionCreatedAt.getTime() > FIVE_MINUTES) {
        throw new ForbiddenException('Re-authentication required');
      }
    }

    const ownedRoomIds = await this.rooms.findIdsByOwner(userId);

    await this.users.softDelete(userId, `deleted_${userId}`, ownedRoomIds);

    return { ownedRoomIds };
  }
}
