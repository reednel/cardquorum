import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { CredentialRepository, RoomRepository, UserRepository } from '@cardquorum/db';
import {
  DISPLAY_NAME_MAX,
  isValidUsername,
  UserProfile,
  UserSearchResult,
} from '@cardquorum/shared';

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

  async updateUsername(userId: number, rawUsername: string): Promise<UserProfile> {
    const username = rawUsername.trim();
    if (!isValidUsername(username)) {
      throw new BadRequestException(
        'Username must be 3-20 characters, start with a letter, and contain only letters, numbers, and underscores',
      );
    }

    const updated = await this.users.updateUsername(userId, username);
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

  async updateDisplayName(userId: number, rawDisplayName: string | null): Promise<UserProfile> {
    if (rawDisplayName !== null) {
      const displayName = rawDisplayName.trim();
      if (displayName.length === 0) {
        throw new BadRequestException('Display name cannot be blank — use null to clear');
      }
      if (displayName.length > DISPLAY_NAME_MAX) {
        throw new BadRequestException(
          `Display name must be ${DISPLAY_NAME_MAX} characters or fewer`,
        );
      }
      rawDisplayName = displayName;
    }

    const updated = await this.users.updateDisplayName(userId, rawDisplayName);
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

  async searchUsers(
    query: string,
    excludeUserId: number,
    excludeIds: number[] = [],
  ): Promise<UserSearchResult[]> {
    const rows = await this.users.searchByUsername(query, excludeUserId, 20, excludeIds);
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
