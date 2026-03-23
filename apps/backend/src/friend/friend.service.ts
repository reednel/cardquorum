import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FriendshipRepository, UserRepository } from '@cardquorum/db';
import { FriendshipResponse } from '@cardquorum/shared';

@Injectable()
export class FriendService {
  constructor(
    private readonly friendships: FriendshipRepository,
    private readonly users: UserRepository,
  ) {}

  async sendRequest(requesterId: number, addresseeId: number): Promise<FriendshipResponse> {
    if (requesterId === addresseeId) {
      throw new BadRequestException('Cannot send a friend request to yourself');
    }

    const targetUser = await this.users.findById(addresseeId);
    if (!targetUser) {
      throw new NotFoundException('User not found');
    }

    const existing = await this.friendships.findBetweenUsers(requesterId, addresseeId);
    if (existing) {
      throw new ConflictException('A friendship or request already exists with this user');
    }

    const row = await this.friendships.create(requesterId, addresseeId);

    return {
      friendshipId: row.id,
      user: {
        userId: targetUser.id,
        username: targetUser.username,
        displayName: targetUser.displayName,
      },
      status: row.status as 'pending',
      createdAt: row.createdAt.toISOString(),
    };
  }

  async acceptRequest(userId: number, friendshipId: number): Promise<FriendshipResponse> {
    const row = await this.friendships.findById(friendshipId);
    if (!row || row.status !== 'pending') {
      throw new NotFoundException('Friend request not found');
    }
    if (row.addresseeId !== userId) {
      throw new ForbiddenException('Only the addressee can accept a friend request');
    }

    const accepted = await this.friendships.accept(friendshipId);
    const requester = await this.users.findById(row.requesterId);

    return {
      friendshipId: accepted!.id,
      user: {
        userId: requester!.id,
        username: requester!.username,
        displayName: requester!.displayName,
      },
      status: 'accepted',
      createdAt: accepted!.createdAt.toISOString(),
    };
  }

  async deleteRequest(userId: number, friendshipId: number): Promise<void> {
    const row = await this.friendships.findById(friendshipId);
    if (!row || row.status !== 'pending') {
      throw new NotFoundException('Friend request not found');
    }
    if (row.requesterId !== userId && row.addresseeId !== userId) {
      throw new ForbiddenException('You are not a party to this friend request');
    }

    await this.friendships.deleteById(friendshipId);
  }

  async removeFriend(userId: number, friendshipId: number): Promise<void> {
    const row = await this.friendships.findById(friendshipId);
    if (!row || row.status !== 'accepted') {
      throw new NotFoundException('Friendship not found');
    }
    if (row.requesterId !== userId && row.addresseeId !== userId) {
      throw new ForbiddenException('You are not a party to this friendship');
    }

    await this.friendships.deleteById(friendshipId);
  }

  async listFriends(userId: number): Promise<FriendshipResponse[]> {
    const rows = await this.friendships.findFriends(userId);
    return rows.map((r) => ({
      friendshipId: r.id,
      user: { userId: r.otherUserId, username: r.otherUsername, displayName: r.otherDisplayName },
      status: r.status as 'accepted',
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async listIncomingRequests(userId: number): Promise<FriendshipResponse[]> {
    const rows = await this.friendships.findIncomingRequests(userId);
    return rows.map((r) => ({
      friendshipId: r.id,
      user: { userId: r.otherUserId, username: r.otherUsername, displayName: r.otherDisplayName },
      status: 'pending',
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async listOutgoingRequests(userId: number): Promise<FriendshipResponse[]> {
    const rows = await this.friendships.findOutgoingRequests(userId);
    return rows.map((r) => ({
      friendshipId: r.id,
      user: { userId: r.otherUserId, username: r.otherUsername, displayName: r.otherDisplayName },
      status: 'pending',
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async areFriends(userA: number, userB: number): Promise<boolean> {
    return this.friendships.areFriends(userA, userB);
  }

  async findFriendIds(userId: number): Promise<number[]> {
    return this.friendships.findFriendIds(userId);
  }
}
