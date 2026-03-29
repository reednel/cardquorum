import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FriendshipRepository, FriendshipRequestRepository, UserRepository } from '@cardquorum/db';
import { FriendRequestResponse, FriendshipResponse } from '@cardquorum/shared';

@Injectable()
export class FriendService {
  constructor(
    private readonly friendships: FriendshipRepository,
    private readonly friendshipRequests: FriendshipRequestRepository,
    private readonly users: UserRepository,
  ) {}

  async sendRequest(requesterId: number, addresseeId: number): Promise<FriendRequestResponse> {
    if (requesterId === addresseeId) {
      throw new BadRequestException('Cannot send a friend request to yourself');
    }

    const targetUser = await this.users.findById(addresseeId);
    if (!targetUser) {
      throw new NotFoundException('User not found');
    }

    const existingFriendship = await this.friendships.findBetweenUsers(requesterId, addresseeId);
    if (existingFriendship) {
      throw new ConflictException('Already friends with this user');
    }

    const existingRequest = await this.friendshipRequests.findBetweenUsers(
      requesterId,
      addresseeId,
    );
    if (existingRequest) {
      throw new ConflictException('A friend request already exists with this user');
    }

    const row = await this.friendshipRequests.create(requesterId, addresseeId);

    return {
      requestId: row.id,
      user: {
        userId: targetUser.id,
        username: targetUser.username,
        displayName: targetUser.displayName,
      },
      createdAt: row.createdAt.toISOString(),
    };
  }

  async acceptRequest(userId: number, requestId: number): Promise<FriendshipResponse> {
    const request = await this.friendshipRequests.findById(requestId);
    if (!request) {
      throw new NotFoundException('Friend request not found');
    }
    if (request.addresseeId !== userId) {
      throw new ForbiddenException('Only the addressee can accept a friend request');
    }

    await this.friendshipRequests.deleteById(requestId);
    const friendship = await this.friendships.create(request.requesterId, request.addresseeId);
    const requester = await this.users.findById(request.requesterId);

    return {
      friendshipId: friendship.id,
      user: {
        userId: requester!.id,
        username: requester!.username,
        displayName: requester!.displayName,
      },
      createdAt: friendship.createdAt.toISOString(),
    };
  }

  async deleteRequest(userId: number, requestId: number): Promise<void> {
    const row = await this.friendshipRequests.findById(requestId);
    if (!row) {
      throw new NotFoundException('Friend request not found');
    }
    if (row.requesterId !== userId && row.addresseeId !== userId) {
      throw new ForbiddenException('You are not a party to this friend request');
    }

    await this.friendshipRequests.deleteById(requestId);
  }

  async removeFriend(userId: number, friendshipId: number): Promise<void> {
    const row = await this.friendships.findById(friendshipId);
    if (!row) {
      throw new NotFoundException('Friendship not found');
    }
    if (row.userId1 !== userId && row.userId2 !== userId) {
      throw new ForbiddenException('You are not a party to this friendship');
    }

    await this.friendships.deleteById(friendshipId);
  }

  async listFriends(userId: number): Promise<FriendshipResponse[]> {
    const rows = await this.friendships.findFriends(userId);
    return rows.map((r) => ({
      friendshipId: r.id,
      user: { userId: r.otherUserId, username: r.otherUsername, displayName: r.otherDisplayName },
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async listIncomingRequests(userId: number): Promise<FriendRequestResponse[]> {
    const rows = await this.friendshipRequests.findIncomingRequests(userId);
    return rows.map((r) => ({
      requestId: r.id,
      user: { userId: r.otherUserId, username: r.otherUsername, displayName: r.otherDisplayName },
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async listOutgoingRequests(userId: number): Promise<FriendRequestResponse[]> {
    const rows = await this.friendshipRequests.findOutgoingRequests(userId);
    return rows.map((r) => ({
      requestId: r.id,
      user: { userId: r.otherUserId, username: r.otherUsername, displayName: r.otherDisplayName },
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
