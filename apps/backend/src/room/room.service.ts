import {
  ConflictException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  MessageRepository,
  RoomBanRepository,
  RoomGameSettingsRepository,
  RoomInviteRepository,
  RoomRepository,
  RoomRosterRepository,
  UserRepository,
} from '@cardquorum/db';
import { RoomManager, rotateSeat as rosterRotateSeat } from '@cardquorum/engine';
import {
  PaginatedResponse,
  RoomBanResponse,
  RoomInviteResponse,
  RoomResponse,
  RoomVisibility,
  RosterMember,
  RosterState,
  WS_EMIT,
} from '@cardquorum/shared';
import { BlockService } from '../block/block.service';
import { ColorAssignmentService } from '../color/color-assignment.service';
import { FriendService } from '../friend/friend.service';
import { GameService } from '../game/game.service';
import { WsConnectionService } from '../ws/ws-connection.service';

/** Hard cap: maximum number of players allowed in a single room. */
const MAX_PLAYERS = 16;
/** Hard cap: maximum total members (players + spectators) allowed in a single room. */
const MAX_ROOM_MEMBERS = 128;

@Injectable()
export class RoomService {
  private readonly logger = new Logger(RoomService.name);
  readonly manager = new RoomManager();

  constructor(
    private readonly rooms: RoomRepository,
    private readonly roomInvites: RoomInviteRepository,
    private readonly roomBans: RoomBanRepository,
    private readonly roomRosters: RoomRosterRepository,
    private readonly messages: MessageRepository,
    private readonly roomGameSettings: RoomGameSettingsRepository,
    private readonly connectionService: WsConnectionService,
    private readonly friendService: FriendService,
    private readonly blockService: BlockService,
    private readonly colorAssignment: ColorAssignmentService,
    private readonly userRepo: UserRepository,
    @Inject(forwardRef(() => GameService))
    private readonly gameService: GameService,
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

  async create(
    name: string,
    ownerId: number,
    visibility: RoomVisibility = 'public',
    memberLimit?: number | null,
    description?: string | null,
  ) {
    const room = await this.rooms.create(name, ownerId, visibility, memberLimit, description);
    this.logger.log(`Room ${room.id} "${name}" created by user ${ownerId}`);
    return room;
  }

  async update(
    roomId: number,
    fields: { name?: string; visibility?: string; description?: string | null },
  ) {
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

  async countMembers(roomId: number): Promise<number> {
    return this.roomRosters.countMembers(roomId);
  }

  async isMember(roomId: number, userId: number): Promise<boolean> {
    return this.roomRosters.isMember(roomId, userId);
  }

  async getMessageHistory(roomId: number) {
    return this.messages.findByRoomId(roomId);
  }

  async upsertGameSettings(
    roomId: number,
    settings: {
      gameType: string | null;
      presetName: string | null;
      config: Record<string, unknown>;
      autostart: boolean;
    },
  ) {
    return this.roomGameSettings.upsert(roomId, settings);
  }

  async loadGameSettings(roomId: number) {
    return this.roomGameSettings.findByRoomId(roomId);
  }

  getOnlineCount(roomId: number): number {
    const members = this.manager.getRoomMembers(String(roomId));
    const uniqueUserIds = new Set(members.map((m) => m.userId));
    return uniqueUserIds.size;
  }

  async updateLastVisitedAt(roomId: number, userId: number): Promise<void> {
    await this.roomRosters.updateLastVisitedAt(roomId, userId);
  }

  async findMemberships(userId: number): Promise<RoomResponse[]> {
    const rooms = await this.rooms.findMemberships(userId);
    return Promise.all(rooms.map((r) => this.buildRoomResponse(r, userId)));
  }

  async findDiscoverablePrivate(userId: number): Promise<RoomResponse[]> {
    const [friendIds, invitedRoomIds, bannedRoomIds, blockedIds, rosteredRoomIds] =
      await Promise.all([
        this.friendService.findFriendIds(userId),
        this.roomInvites.findInvitedRoomIds(userId),
        this.roomBans.findBannedRoomIds(userId),
        this.blockService.getBlockedIds(userId),
        this.roomRosters.findRosteredRoomIds(userId),
      ]);

    const rooms = await this.rooms.findDiscoverablePrivate(
      userId,
      friendIds,
      invitedRoomIds,
      bannedRoomIds,
      blockedIds,
      rosteredRoomIds,
    );

    return Promise.all(rooms.map((r) => this.buildRoomResponse(r, userId)));
  }

  async findDiscoverablePublic(
    userId: number,
    page: number,
    pageSize: number,
  ): Promise<PaginatedResponse<RoomResponse>> {
    const [bannedRoomIds, blockedIds, rosteredRoomIds] = await Promise.all([
      this.roomBans.findBannedRoomIds(userId),
      this.blockService.getBlockedIds(userId),
      this.roomRosters.findRosteredRoomIds(userId),
    ]);

    const offset = (page - 1) * pageSize;
    const result = await this.rooms.findDiscoverablePublic(
      userId,
      bannedRoomIds,
      blockedIds,
      rosteredRoomIds,
      offset,
      pageSize,
    );

    const data = await Promise.all(result.rooms.map((r) => this.buildRoomResponse(r, userId)));

    return { data, total: result.total, page, pageSize };
  }

  async searchDiscoverable(userId: number, query: string): Promise<RoomResponse[]> {
    const [friendIds, invitedRoomIds, bannedRoomIds, blockedIds, rosteredRoomIds] =
      await Promise.all([
        this.friendService.findFriendIds(userId),
        this.roomInvites.findInvitedRoomIds(userId),
        this.roomBans.findBannedRoomIds(userId),
        this.blockService.getBlockedIds(userId),
        this.roomRosters.findRosteredRoomIds(userId),
      ]);

    const rooms = await this.rooms.searchDiscoverable(
      userId,
      query,
      friendIds,
      invitedRoomIds,
      bannedRoomIds,
      blockedIds,
      rosteredRoomIds,
    );

    return Promise.all(rooms.map((r) => this.buildRoomResponse(r, userId)));
  }

  private async buildRoomResponse(
    room: {
      id: number;
      name: string;
      description: string | null;
      ownerId: number;
      ownerDisplayName: string | null;
      ownerUsername: string;
      visibility: string;
      memberLimit: number | null;
      createdAt: Date;
      updatedAt: Date;
    },
    userId: number,
  ): Promise<RoomResponse> {
    const [gameSettings, rosterCount, isOnRoster] = await Promise.all([
      this.roomGameSettings.findByRoomId(room.id),
      this.roomRosters.countMembers(room.id),
      this.roomRosters.isMember(room.id, userId),
    ]);

    return {
      id: room.id,
      name: room.name,
      description: room.description,
      ownerId: room.ownerId,
      ownerDisplayName: room.ownerDisplayName ?? '',
      ownerUsername: room.ownerUsername,
      visibility: room.visibility as RoomVisibility,
      createdAt: room.createdAt.toISOString(),
      updatedAt: room.updatedAt.toISOString(),
      onlineCount: this.getOnlineCount(room.id),
      memberLimit: room.memberLimit ?? null,
      rosterCount,
      isOnRoster,
      gameType: gameSettings?.gameType ?? null,
      presetName: gameSettings?.presetName ?? null,
      gameInProgress: this.gameService.isGameActive(room.id),
    };
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

    // Remove from roster if on it
    const isOnRoster = await this.roomRosters.isMember(roomId, userId);
    if (isOnRoster) {
      await this.roomRosters.removeMember(roomId, userId);
      // Reindex positions
      const members = await this.roomRosters.findByRoom(roomId);
      const players = members.filter((m) => m.section === 'players').map((m) => m.userId);
      const spectators = members.filter((m) => m.section === 'spectators').map((m) => m.userId);
      await this.roomRosters.replaceRoster(roomId, players, spectators);

      const roster = await this.getRoster(roomId);
      this.broadcastToRoom(String(roomId), WS_EMIT.ROSTER_UPDATED, { roomId, roster });
    }

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

  // --- Roster methods ---

  async getRoster(roomId: number): Promise<RosterState> {
    const members = await this.roomRosters.findByRoom(roomId);
    const room = await this.rooms.findById(roomId);
    const rotatePlayers = room?.rotatePlayers ?? false;

    const players: RosterMember[] = members
      .filter((m) => m.section === 'players')
      .map((m, i) => ({ ...m, position: i }));

    const spectators: RosterMember[] = members
      .filter((m) => m.section === 'spectators')
      .map((m, i) => ({ ...m, position: i }));

    return { players, spectators, rotatePlayers };
  }

  async addToRoster(roomId: number, userId: number): Promise<RosterState> {
    const room = await this.rooms.findById(roomId);
    if (!room) {
      throw new NotFoundException('Room not found');
    }

    const currentCount = await this.roomRosters.countMembers(roomId);
    if (currentCount >= MAX_ROOM_MEMBERS) {
      throw new ConflictException('Room is full');
    }
    if (room.memberLimit != null && room.memberLimit > 0 && currentCount >= room.memberLimit) {
      throw new ConflictException(`Room is full (limit: ${room.memberLimit})`);
    }

    // Get user info for the roster member
    const existingMembers = await this.roomRosters.findByRoom(roomId);
    const spectatorCount = existingMembers.filter((m) => m.section === 'spectators').length;

    await this.roomRosters.addMember(roomId, userId, 'spectators', spectatorCount);

    const roster = await this.getRoster(roomId);
    this.broadcastToRoom(String(roomId), WS_EMIT.ROSTER_UPDATED, { roomId, roster });
    return roster;
  }

  async removeFromRoster(roomId: number, userId: number): Promise<RosterState> {
    const room = await this.rooms.findById(roomId);
    if (!room) {
      throw new NotFoundException('Room not found');
    }

    if (room.ownerId === userId) {
      throw new ForbiddenException('Room owner cannot leave the room');
    }

    await this.roomRosters.removeMember(roomId, userId);

    // Reindex positions: read current roster and replace to fix positions
    const members = await this.roomRosters.findByRoom(roomId);
    const players = members.filter((m) => m.section === 'players').map((m) => m.userId);
    const spectators = members.filter((m) => m.section === 'spectators').map((m) => m.userId);
    await this.roomRosters.replaceRoster(roomId, players, spectators);

    const roster = await this.getRoster(roomId);
    this.broadcastToRoom(String(roomId), WS_EMIT.ROSTER_UPDATED, { roomId, roster });
    return roster;
  }

  async reorderRoster(
    roomId: number,
    players: number[],
    spectators: number[],
    options?: { gameActive?: boolean },
  ): Promise<RosterState> {
    if (options?.gameActive) {
      throw new ConflictException('Cannot reorder roster while a game is active');
    }

    if (players.length > MAX_PLAYERS) {
      throw new ConflictException('Room has reached maximum player count');
    }

    // Validate all members present
    const currentMembers = await this.roomRosters.findByRoom(roomId);
    const currentIds = new Set(currentMembers.map((m) => m.userId));
    const newIds = new Set([...players, ...spectators]);

    if (currentIds.size !== newIds.size || [...currentIds].some((id) => !newIds.has(id))) {
      throw new ConflictException('Roster update must contain all current members');
    }

    // Check for duplicates
    if (players.length + spectators.length !== newIds.size) {
      throw new ConflictException('Roster update must contain all current members');
    }

    await this.roomRosters.replaceRoster(roomId, players, spectators);

    // Assign hues to any players that don't have one yet
    for (const userId of players) {
      const existingHue = currentMembers.find((m) => m.userId === userId)?.assignedHue ?? null;

      // Skip if the player already has an assigned hue
      if (existingHue !== null) {
        continue;
      }

      // Player has no assigned hue — assign one
      const preferredHue = await this.userRepo.getColorPreference(userId);
      const allHues = await this.roomRosters.getAssignedHues(roomId);
      const occupiedHues = allHues
        .filter((h) => h.assignedHue !== null && h.userId !== userId)
        .map((h) => h.assignedHue as number);

      const assignedHue = this.colorAssignment.assignHue(preferredHue, occupiedHues);
      await this.roomRosters.setAssignedHue(roomId, userId, assignedHue);
    }

    const roster = await this.getRoster(roomId);
    this.broadcastToRoom(String(roomId), WS_EMIT.ROSTER_UPDATED, { roomId, roster });
    return roster;
  }

  async kickUser(roomId: number, userId: number): Promise<RosterState> {
    const roster = await this.removeFromRoster(roomId, userId);

    // Disconnect WS and send MEMBER_KICKED to kicked user
    this.kickUserFromRoom(roomId, userId);

    return roster;
  }

  async toggleRotatePlayers(roomId: number, enabled: boolean): Promise<RosterState> {
    await this.rooms.update(roomId, { rotatePlayers: enabled });

    const roster = await this.getRoster(roomId);
    this.broadcastToRoom(String(roomId), WS_EMIT.ROSTER_UPDATED, { roomId, roster });
    return roster;
  }

  async rotateSeat(roomId: number): Promise<RosterState> {
    const roster = await this.getRoster(roomId);

    const rotated = rosterRotateSeat(roster);

    const players = rotated.players.map((m) => m.userId);
    const spectators = rotated.spectators.map((m) => m.userId);
    await this.roomRosters.replaceRoster(roomId, players, spectators);

    const updatedRoster = await this.getRoster(roomId);
    this.broadcastToRoom(String(roomId), WS_EMIT.ROSTER_UPDATED, { roomId, roster: updatedRoster });
    return updatedRoster;
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
