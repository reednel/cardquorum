import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { RoomBanRepository, RoomInviteRepository, RoomRepository } from '@cardquorum/db';
import { RoomManager } from '@cardquorum/engine';
import { RoomBanResponse, RoomInviteResponse, RoomVisibility, WS_EMIT } from '@cardquorum/shared';
import { BlockService } from '../block/block.service';
import { FriendService } from '../friend/friend.service';
import { WsConnectionService } from '../ws/ws-connection.service';

@Injectable()
export class RoomService {
  private readonly logger = new Logger(RoomService.name);
  readonly manager = new RoomManager();

  constructor(
    private readonly rooms: RoomRepository,
    private readonly roomInvites: RoomInviteRepository,
    private readonly roomBans: RoomBanRepository,
    private readonly connectionService: WsConnectionService,
    private readonly friendService: FriendService,
    private readonly blockService: BlockService,
  ) {}

  async findById(roomId: number) {
    return this.rooms.findById(roomId);
  }

  async findAll(visibility?: string) {
    return this.rooms.findAll(visibility);
  }

  async findAllForUser(userId: number) {
    const allRooms = await this.rooms.findAll();
    const friendIds = await this.friendService.findFriendIds(userId);
    const blockedIds = await this.blockService.getBlockedIds(userId);
    const bannedRoomIds = await this.roomBans.findBannedRoomIds(userId);
    const invitedRoomIds = await this.roomInvites.findInvitedRoomIds(userId);
    const friendIdSet = new Set(friendIds);
    const blockedIdSet = new Set(blockedIds);
    const bannedRoomIdSet = new Set(bannedRoomIds);
    const invitedRoomIdSet = new Set(invitedRoomIds);

    return allRooms.filter((room) => {
      if (bannedRoomIdSet.has(room.id)) return false;
      if (blockedIdSet.has(room.ownerId)) return false;
      if (room.ownerId === userId) return true;
      if (room.visibility === 'public') return true;
      if (room.visibility === 'friends-only' && friendIdSet.has(room.ownerId)) return true;
      if (room.visibility === 'invite-only' && invitedRoomIdSet.has(room.id)) return true;
      return false;
    });
  }

  async canAccessRoom(roomId: number, userId: number): Promise<boolean> {
    const room = await this.rooms.findById(roomId);
    if (!room) return false;

    const isBanned = await this.roomBans.isBanned(roomId, userId);
    if (isBanned) return false;

    const ownerBlockedUser = await this.blockService.isBlocked(room.ownerId, userId);
    if (ownerBlockedUser) return false;

    if (room.ownerId === userId) return true;
    if (room.visibility === 'public') return true;
    if (room.visibility === 'invite-only') {
      return this.roomInvites.isInvited(roomId, userId);
    }
    if (room.visibility === 'friends-only') {
      return this.friendService.areFriends(userId, room.ownerId);
    }
    return false;
  }

  async create(name: string, ownerId: number, visibility: RoomVisibility = 'public') {
    const room = await this.rooms.create(name, ownerId, visibility);
    this.logger.log(`Room ${room.id} "${name}" created by user ${ownerId}`);
    return room;
  }

  async update(roomId: number, fields: { name?: string; visibility?: string }) {
    const updated = await this.rooms.update(roomId, fields);
    if (updated) {
      this.logger.log(`Room ${roomId} updated: ${JSON.stringify(fields)}`);
    }
    return updated;
  }

  async delete(roomId: number) {
    const roomKey = String(roomId);

    const room = this.manager.getRoom(roomKey);
    if (room) {
      this.broadcastToRoom(roomKey, WS_EMIT.ROOM_DELETED, { roomId });
      for (const connId of [...room.members.keys()]) {
        this.manager.leaveRoom(roomKey, connId);
      }
    }

    const deleted = await this.rooms.delete(roomId);
    if (deleted) {
      this.logger.log(`Room ${roomId} deleted`);
    }
    return deleted;
  }

  async roomExists(roomId: number): Promise<boolean> {
    const room = await this.rooms.findById(roomId);
    return room !== null;
  }

  getOnlineCount(roomId: number): number {
    const members = this.manager.getRoomMembers(String(roomId));
    const uniqueUserIds = new Set(members.map((m) => m.userId));
    return uniqueUserIds.size;
  }

  broadcastToRoom(roomId: string, event: string, data: unknown, excludeConnId?: string): void {
    const room = this.manager.getRoom(roomId);
    if (!room) return;

    const message = JSON.stringify({ event, data });
    for (const connId of room.members.keys()) {
      if (connId === excludeConnId) continue;
      const tracked = this.connectionService.getTrackedById(connId);
      if (tracked) {
        try {
          tracked.ws.send(message);
        } catch (err) {
          this.logger.warn(`Failed to send to ${connId}: ${err}`);
        }
      }
    }
  }

  // --- Invite methods ---

  async inviteUser(roomId: number, userId: number): Promise<void> {
    const isBanned = await this.roomBans.isBanned(roomId, userId);
    if (isBanned) {
      throw new ConflictException('User is banned from this room');
    }
    const already = await this.roomInvites.isInvited(roomId, userId);
    if (already) {
      throw new ConflictException('User is already invited');
    }
    await this.roomInvites.create(roomId, userId);
  }

  async uninviteUser(roomId: number, userId: number): Promise<void> {
    const deleted = await this.roomInvites.delete(roomId, userId);
    if (!deleted) {
      throw new NotFoundException('Invite not found');
    }
  }

  async getInvites(roomId: number): Promise<RoomInviteResponse[]> {
    const rows = await this.roomInvites.findByRoom(roomId);
    return rows.map((r) => ({
      userId: r.userId,
      username: r.username,
      displayName: r.displayName,
      invitedAt: r.createdAt.toISOString(),
    }));
  }

  async bulkInvite(roomId: number, userIds: number[]): Promise<void> {
    if (userIds.length === 0) return;
    await this.roomInvites.createMany(roomId, userIds);
  }

  // --- Ban methods ---

  async banUser(roomId: number, userId: number): Promise<void> {
    const already = await this.roomBans.isBanned(roomId, userId);
    if (already) {
      throw new ConflictException('User is already banned');
    }

    await this.roomBans.create(roomId, userId);
    // Also remove invite if one exists
    await this.roomInvites.delete(roomId, userId);

    // Kick from WS room
    this.kickUserFromRoom(roomId, userId);
  }

  async unbanUser(roomId: number, userId: number): Promise<void> {
    const deleted = await this.roomBans.delete(roomId, userId);
    if (!deleted) {
      throw new NotFoundException('Ban not found');
    }
  }

  async getBans(roomId: number): Promise<RoomBanResponse[]> {
    const rows = await this.roomBans.findByRoom(roomId);
    return rows.map((r) => ({
      userId: r.userId,
      username: r.username,
      displayName: r.displayName,
      bannedAt: r.createdAt.toISOString(),
    }));
  }

  private kickUserFromRoom(roomId: number, userId: number): void {
    const roomKey = String(roomId);
    const room = this.manager.getRoom(roomKey);
    if (!room) return;

    for (const [connId, identity] of room.members.entries()) {
      if (identity.userId === userId) {
        this.manager.leaveRoom(roomKey, connId);
        const tracked = this.connectionService.getTrackedById(connId);
        if (tracked) {
          try {
            tracked.ws.send(
              JSON.stringify({ event: WS_EMIT.MEMBER_KICKED, data: { roomId, userId } }),
            );
          } catch (err) {
            this.logger.warn(`Failed to send kick to ${connId}: ${err}`);
          }
        }
      }
    }

    // Notify remaining members
    this.broadcastToRoom(roomKey, WS_EMIT.MEMBER_LEFT, {
      roomId,
      member: { userId, username: '', displayName: null },
    });
  }
}
