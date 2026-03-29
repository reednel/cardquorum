import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BlockRepository, FriendshipRepository, UserRepository } from '@cardquorum/db';
import { BlockedUserResponse } from '@cardquorum/shared';

@Injectable()
export class BlockService {
  constructor(
    private readonly blocks: BlockRepository,
    private readonly friendships: FriendshipRepository,
    private readonly users: UserRepository,
  ) {}

  async blockUser(blockerId: number, blockedId: number): Promise<BlockedUserResponse> {
    if (blockerId === blockedId) {
      throw new BadRequestException('Cannot block yourself');
    }

    const targetUser = await this.users.findById(blockedId);
    if (!targetUser) {
      throw new NotFoundException('User not found');
    }

    const alreadyBlocked = await this.blocks.isBlocked(blockerId, blockedId);
    if (alreadyBlocked) {
      throw new ConflictException('User is already blocked');
    }

    await this.friendships.deleteBetweenUsers(blockerId, blockedId);
    const row = await this.blocks.create(blockerId, blockedId);

    return {
      userId: targetUser.id,
      username: targetUser.username,
      displayName: targetUser.displayName,
      blockedAt: row.createdAt.toISOString(),
    };
  }

  async unblockUser(blockerId: number, blockedId: number): Promise<void> {
    const deleted = await this.blocks.deleteByBlockerAndBlocked(blockerId, blockedId);
    if (!deleted) {
      throw new NotFoundException('Block not found');
    }
  }

  async getBlockList(blockerId: number): Promise<BlockedUserResponse[]> {
    const rows = await this.blocks.findByBlocker(blockerId);
    return rows.map((r) => ({
      userId: r.blockedId,
      username: r.blockedUsername,
      displayName: r.blockedDisplayName,
      blockedAt: r.createdAt.toISOString(),
    }));
  }

  async getBlockedIds(blockerId: number): Promise<number[]> {
    return this.blocks.findBlockedIds(blockerId);
  }

  async isBlocked(blockerId: number, blockedId: number): Promise<boolean> {
    return this.blocks.isBlocked(blockerId, blockedId);
  }
}
