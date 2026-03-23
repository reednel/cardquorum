import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { UserRepository } from '@cardquorum/db';
import { UserProfile, UserSearchResult } from '@cardquorum/shared';

@Injectable()
export class UserService {
  constructor(private readonly users: UserRepository) {}

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
}
