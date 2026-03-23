import { Injectable, Logger } from '@nestjs/common';
import { RoomRepository } from '@cardquorum/db';
import { RoomManager } from '@cardquorum/engine';
import { RoomVisibility, WS_EMIT } from '@cardquorum/shared';
import { FriendService } from '../friend/friend.service';
import { WsConnectionService } from '../ws/ws-connection.service';

@Injectable()
export class RoomService {
  private readonly logger = new Logger(RoomService.name);
  readonly manager = new RoomManager();

  constructor(
    private readonly rooms: RoomRepository,
    private readonly connectionService: WsConnectionService,
    private readonly friendService: FriendService,
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
    const friendIdSet = new Set(friendIds);

    return allRooms.filter((room) => {
      if (room.visibility === 'public' || room.visibility === 'invite-only') return true;
      if (room.ownerId === userId) return true;
      if (room.visibility === 'friends-only' && friendIdSet.has(room.ownerId)) return true;
      return false;
    });
  }

  async canAccessRoom(roomId: number, userId: number): Promise<boolean> {
    const room = await this.rooms.findById(roomId);
    if (!room) return false;
    if (room.visibility === 'public') return true;
    if (room.visibility === 'invite-only') return true;
    if (room.ownerId === userId) return true;
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

    // Boot all connected members
    const room = this.manager.getRoom(roomKey);
    if (room) {
      this.broadcastToRoom(roomKey, WS_EMIT.ROOM_DELETED, { roomId });
      // Remove all members from in-memory state
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
    // Deduplicate by userId (a user can have multiple connections)
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
}
