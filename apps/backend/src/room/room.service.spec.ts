import { ConflictException, ForbiddenException } from '@nestjs/common';
import * as fc from 'fast-check';
import { WebSocket } from 'ws';
import { UserIdentity, WS_EMIT } from '@cardquorum/shared';
import { WsConnectionService } from '../ws/ws-connection.service';
import { RoomService } from './room.service';

describe('RoomService', () => {
  let service: RoomService;
  let connectionService: WsConnectionService;
  let mockRepo: {
    findById: jest.Mock;
    findAll: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  let mockFriendService: { areFriends: jest.Mock; findFriendIds: jest.Mock };
  let mockBlockService: { getBlockedIds: jest.Mock; isBlocked: jest.Mock };
  let mockInviteRepo: {
    findInvitedRoomIds: jest.Mock;
    isInvited: jest.Mock;
    findByRoom: jest.Mock;
    create: jest.Mock;
    createMany: jest.Mock;
    delete: jest.Mock;
  };
  let mockBanRepo: {
    findBannedRoomIds: jest.Mock;
    isBanned: jest.Mock;
    findByRoom: jest.Mock;
    create: jest.Mock;
    delete: jest.Mock;
  };
  let mockRosterRepo: {
    findByRoom: jest.Mock;
    addMember: jest.Mock;
    removeMember: jest.Mock;
    replaceRoster: jest.Mock;
    countMembers: jest.Mock;
    isMember: jest.Mock;
    getAssignedHues: jest.Mock;
    setAssignedHue: jest.Mock;
  };
  let mockColorAssignment: { assignHue: jest.Mock };
  let mockUserRepo: { getColorPreference: jest.Mock };
  let mockGameService: { isGameActive: jest.Mock };

  const alice: UserIdentity = { userId: 1, username: 'alice', displayName: 'Alice' };
  const bob: UserIdentity = { userId: 2, username: 'bob', displayName: 'Bob' };

  const createMockClient = () => ({ send: jest.fn(), close: jest.fn() }) as unknown as WebSocket;

  beforeEach(() => {
    connectionService = new WsConnectionService();

    mockRepo = {
      findById: jest.fn(),
      findAll: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };

    mockFriendService = { areFriends: jest.fn(), findFriendIds: jest.fn() };
    mockBlockService = { getBlockedIds: jest.fn(), isBlocked: jest.fn() };
    mockInviteRepo = {
      findInvitedRoomIds: jest.fn().mockResolvedValue([]),
      isInvited: jest.fn().mockResolvedValue(false),
      findByRoom: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      createMany: jest.fn(),
      delete: jest.fn(),
    };
    mockBanRepo = {
      findBannedRoomIds: jest.fn().mockResolvedValue([]),
      isBanned: jest.fn().mockResolvedValue(false),
      findByRoom: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      delete: jest.fn(),
    };
    mockRosterRepo = {
      findByRoom: jest.fn().mockResolvedValue([]),
      addMember: jest.fn(),
      removeMember: jest.fn().mockResolvedValue(true),
      replaceRoster: jest.fn(),
      countMembers: jest.fn().mockResolvedValue(0),
      isMember: jest.fn().mockResolvedValue(false),
      getAssignedHues: jest.fn().mockResolvedValue([]),
      setAssignedHue: jest.fn(),
    };

    mockColorAssignment = { assignHue: jest.fn().mockReturnValue(0) };
    mockUserRepo = { getColorPreference: jest.fn().mockResolvedValue(null) };
    mockGameService = { isGameActive: jest.fn().mockReturnValue(false) };

    service = new RoomService(
      mockRepo as any,
      mockInviteRepo as any,
      mockBanRepo as any,
      mockRosterRepo as any,
      { findByRoomId: jest.fn().mockResolvedValue([]) } as any,
      { findByRoomId: jest.fn().mockResolvedValue(null), upsert: jest.fn() } as any,
      connectionService,
      mockFriendService as any,
      mockBlockService as any,
      mockColorAssignment as any,
      mockUserRepo as any,
      mockGameService as any,
    );

    mockBlockService.getBlockedIds.mockResolvedValue([]);
    mockBlockService.isBlocked.mockResolvedValue(false);
  });

  describe('delete', () => {
    it('should broadcast ROOM_DELETED to connected members before deleting', async () => {
      const client1 = createMockClient();
      const client2 = createMockClient();
      connectionService.trackClient(client1, alice);
      connectionService.trackClient(client2, bob);

      // Both are in room 1
      const tracked1 = connectionService.getTracked(client1)!;
      const tracked2 = connectionService.getTracked(client2)!;
      service.manager.joinRoom('1', tracked1.id, alice);
      service.manager.joinRoom('1', tracked2.id, bob);

      mockRepo.delete.mockResolvedValue({ id: 1 });

      await service.delete(1);

      // Both clients should receive ROOM_DELETED
      for (const client of [client1, client2]) {
        const calls = (client.send as jest.Mock).mock.calls;
        expect(calls.length).toBeGreaterThanOrEqual(1);
        const parsed = JSON.parse(calls[0][0]);
        expect(parsed.event).toBe(WS_EMIT.ROOM_DELETED);
        expect(parsed.data.roomId).toBe(1);
      }
    });

    it('should remove all members from the room manager', async () => {
      const client1 = createMockClient();
      connectionService.trackClient(client1, alice);
      const tracked = connectionService.getTracked(client1)!;
      service.manager.joinRoom('1', tracked.id, alice);

      mockRepo.delete.mockResolvedValue({ id: 1 });

      await service.delete(1);

      expect(service.manager.getRoom('1')).toBeUndefined();
    });

    it('should handle deletion of room with no connected members', async () => {
      mockRepo.delete.mockResolvedValue({ id: 1 });

      await service.delete(1);

      expect(mockRepo.delete).toHaveBeenCalledWith(1);
    });
  });

  describe('getOnlineCount', () => {
    it('should return unique user count', async () => {
      const client1 = createMockClient();
      const client2 = createMockClient();
      connectionService.trackClient(client1, alice);
      connectionService.trackClient(client2, alice); // same user, two connections

      const tracked1 = connectionService.getTracked(client1)!;
      const tracked2 = connectionService.getTracked(client2)!;
      service.manager.joinRoom('1', tracked1.id, alice);
      service.manager.joinRoom('1', tracked2.id, alice);

      expect(service.getOnlineCount(1)).toBe(1);
    });

    it('should return 0 for room with no members', () => {
      expect(service.getOnlineCount(999)).toBe(0);
    });
  });

  describe('broadcastToRoom', () => {
    it('should send to all members except excluded connection', () => {
      const client1 = createMockClient();
      const client2 = createMockClient();
      connectionService.trackClient(client1, alice);
      connectionService.trackClient(client2, bob);

      const tracked1 = connectionService.getTracked(client1)!;
      const tracked2 = connectionService.getTracked(client2)!;
      service.manager.joinRoom('1', tracked1.id, alice);
      service.manager.joinRoom('1', tracked2.id, bob);

      service.broadcastToRoom('1', 'test:event', { msg: 'hello' }, tracked1.id);

      expect(client1.send).not.toHaveBeenCalled();
      expect(client2.send).toHaveBeenCalledTimes(1);
      const parsed = JSON.parse((client2.send as jest.Mock).mock.calls[0][0]);
      expect(parsed.event).toBe('test:event');
    });

    it('should not throw if a client send fails', () => {
      const client1 = createMockClient();
      (client1.send as jest.Mock).mockImplementation(() => {
        throw new Error('connection closed');
      });
      connectionService.trackClient(client1, alice);
      const tracked = connectionService.getTracked(client1)!;
      service.manager.joinRoom('1', tracked.id, alice);

      expect(() => service.broadcastToRoom('1', 'test', {})).not.toThrow();
    });
  });

  describe('findAllForUser', () => {
    it('should include public rooms', async () => {
      const publicRoom = {
        id: 1,
        name: 'Pub',
        ownerId: 99,
        ownerDisplayName: 'Other',
        visibility: 'public',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockRepo.findAll.mockResolvedValue([publicRoom]);
      mockFriendService.findFriendIds.mockResolvedValue([]);

      const result = await service.findAllForUser(10);

      expect(result).toEqual([publicRoom]);
    });

    it('should include rooms owned by user regardless of visibility', async () => {
      const ownRoom = {
        id: 2,
        name: 'Mine',
        ownerId: 10,
        ownerDisplayName: 'Me',
        visibility: 'friends-only',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockRepo.findAll.mockResolvedValue([ownRoom]);
      mockFriendService.findFriendIds.mockResolvedValue([]);

      const result = await service.findAllForUser(10);

      expect(result).toEqual([ownRoom]);
    });

    it('should include friends-only rooms where user is friends with owner', async () => {
      const friendRoom = {
        id: 3,
        name: 'Friend',
        ownerId: 20,
        ownerDisplayName: 'Friend',
        visibility: 'friends-only',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockRepo.findAll.mockResolvedValue([friendRoom]);
      mockFriendService.findFriendIds.mockResolvedValue([20]);

      const result = await service.findAllForUser(10);

      expect(result).toEqual([friendRoom]);
    });

    it('should exclude friends-only rooms where user is NOT friends with owner', async () => {
      const strangerRoom = {
        id: 4,
        name: 'Stranger',
        ownerId: 30,
        ownerDisplayName: 'Stranger',
        visibility: 'friends-only',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockRepo.findAll.mockResolvedValue([strangerRoom]);
      mockFriendService.findFriendIds.mockResolvedValue([20]);

      const result = await service.findAllForUser(10);

      expect(result).toEqual([]);
    });
  });

  describe('canAccessRoom', () => {
    it('should allow access to public rooms', async () => {
      mockRepo.findById.mockResolvedValue({ id: 1, visibility: 'public', ownerId: 99 });

      const result = await service.canAccessRoom(1, 10);

      expect(result).toBe(true);
    });

    it('should allow access to own friends-only room', async () => {
      mockRepo.findById.mockResolvedValue({ id: 1, visibility: 'friends-only', ownerId: 10 });

      const result = await service.canAccessRoom(1, 10);

      expect(result).toBe(true);
    });

    it('should allow friends-only access for friend of owner', async () => {
      mockRepo.findById.mockResolvedValue({ id: 1, visibility: 'friends-only', ownerId: 20 });
      mockFriendService.areFriends.mockResolvedValue(true);

      const result = await service.canAccessRoom(1, 10);

      expect(result).toBe(true);
    });

    it('should deny friends-only access for non-friend', async () => {
      mockRepo.findById.mockResolvedValue({ id: 1, visibility: 'friends-only', ownerId: 20 });
      mockFriendService.areFriends.mockResolvedValue(false);

      const result = await service.canAccessRoom(1, 10);

      expect(result).toBe(false);
    });
  });

  describe('findAllForUser - block filtering', () => {
    it('should exclude rooms owned by blocked users', async () => {
      mockRepo.findAll.mockResolvedValue([
        { id: 1, ownerId: 1, visibility: 'public', ownerDisplayName: 'Alice' },
        { id: 2, ownerId: 2, visibility: 'public', ownerDisplayName: 'Bob' },
        { id: 3, ownerId: 3, visibility: 'public', ownerDisplayName: 'Carol' },
      ]);
      mockFriendService.findFriendIds.mockResolvedValue([]);
      mockBlockService.getBlockedIds.mockResolvedValue([2]);

      const result = await service.findAllForUser(10);

      expect(result).toHaveLength(2);
      expect(result.map((r: any) => r.id)).toEqual([1, 3]);
    });
  });

  describe('canAccessRoom - block check', () => {
    it('should deny access when room owner has blocked the user', async () => {
      mockRepo.findById.mockResolvedValue({ id: 1, ownerId: 5, visibility: 'public' });
      mockBlockService.isBlocked.mockResolvedValue(true);

      const result = await service.canAccessRoom(1, 10);

      expect(result).toBe(false);
      expect(mockBlockService.isBlocked).toHaveBeenCalledWith(5, 10);
    });

    it('should allow access when room owner has not blocked the user', async () => {
      mockRepo.findById.mockResolvedValue({ id: 1, ownerId: 5, visibility: 'public' });
      mockBlockService.isBlocked.mockResolvedValue(false);

      const result = await service.canAccessRoom(1, 10);

      expect(result).toBe(true);
    });
  });

  describe('findAllForUser - invite filtering', () => {
    const inviteRoom = {
      id: 5,
      name: 'Invite',
      ownerId: 50,
      ownerDisplayName: 'Owner',
      visibility: 'invite-only',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should include invite-only rooms where user is invited', async () => {
      mockRepo.findAll.mockResolvedValue([inviteRoom]);
      mockFriendService.findFriendIds.mockResolvedValue([]);
      mockInviteRepo.findInvitedRoomIds.mockResolvedValue([5]);

      const result = await service.findAllForUser(10);
      expect(result).toEqual([inviteRoom]);
    });

    it('should exclude invite-only rooms where user is NOT invited', async () => {
      mockRepo.findAll.mockResolvedValue([inviteRoom]);
      mockFriendService.findFriendIds.mockResolvedValue([]);
      mockInviteRepo.findInvitedRoomIds.mockResolvedValue([]);

      const result = await service.findAllForUser(10);
      expect(result).toEqual([]);
    });
  });

  describe('findAllForUser - ban filtering', () => {
    it('should exclude rooms where user is banned', async () => {
      const room = {
        id: 1,
        name: 'Pub',
        ownerId: 99,
        ownerDisplayName: 'Other',
        visibility: 'public',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockRepo.findAll.mockResolvedValue([room]);
      mockFriendService.findFriendIds.mockResolvedValue([]);
      mockBanRepo.findBannedRoomIds.mockResolvedValue([1]);

      const result = await service.findAllForUser(10);
      expect(result).toEqual([]);
    });
  });

  describe('canAccessRoom - invite-only', () => {
    it('should allow invited user to access invite-only room', async () => {
      mockRepo.findById.mockResolvedValue({ id: 1, visibility: 'invite-only', ownerId: 50 });
      mockInviteRepo.isInvited.mockResolvedValue(true);

      const result = await service.canAccessRoom(1, 10);
      expect(result).toBe(true);
    });

    it('should deny non-invited user from invite-only room', async () => {
      mockRepo.findById.mockResolvedValue({ id: 1, visibility: 'invite-only', ownerId: 50 });
      mockInviteRepo.isInvited.mockResolvedValue(false);

      const result = await service.canAccessRoom(1, 10);
      expect(result).toBe(false);
    });

    it('should allow owner to access own invite-only room', async () => {
      mockRepo.findById.mockResolvedValue({ id: 1, visibility: 'invite-only', ownerId: 10 });

      const result = await service.canAccessRoom(1, 10);
      expect(result).toBe(true);
    });
  });

  describe('canAccessRoom - ban check', () => {
    it('should deny banned user even for public rooms', async () => {
      mockRepo.findById.mockResolvedValue({ id: 1, visibility: 'public', ownerId: 99 });
      mockBanRepo.isBanned.mockResolvedValue(true);

      const result = await service.canAccessRoom(1, 10);
      expect(result).toBe(false);
    });
  });

  describe('inviteUser', () => {
    it('should create an invite', async () => {
      mockBanRepo.isBanned.mockResolvedValue(false);
      mockInviteRepo.isInvited.mockResolvedValue(false);

      await service.inviteUser(1, 10);
      expect(mockInviteRepo.create).toHaveBeenCalledWith(1, 10);
    });

    it('should throw ConflictException if user is already invited', async () => {
      mockBanRepo.isBanned.mockResolvedValue(false);
      mockInviteRepo.isInvited.mockResolvedValue(true);

      await expect(service.inviteUser(1, 10)).rejects.toThrow('User is already invited');
    });

    it('should throw ConflictException if user is banned', async () => {
      mockBanRepo.isBanned.mockResolvedValue(true);

      await expect(service.inviteUser(1, 10)).rejects.toThrow('User is banned from this room');
    });
  });

  describe('uninviteUser', () => {
    it('should delete the invite', async () => {
      mockInviteRepo.delete.mockResolvedValue({ id: 1 });

      await service.uninviteUser(1, 10);
      expect(mockInviteRepo.delete).toHaveBeenCalledWith(1, 10);
    });

    it('should throw NotFoundException if invite does not exist', async () => {
      mockInviteRepo.delete.mockResolvedValue(null);

      await expect(service.uninviteUser(1, 10)).rejects.toThrow('Invite not found');
    });
  });

  describe('banUser', () => {
    it('should create a ban and delete any existing invite', async () => {
      mockBanRepo.isBanned.mockResolvedValue(false);

      await service.banUser(1, 10);

      expect(mockBanRepo.create).toHaveBeenCalledWith(1, 10);
      expect(mockInviteRepo.delete).toHaveBeenCalledWith(1, 10);
    });

    it('should throw ConflictException if user is already banned', async () => {
      mockBanRepo.isBanned.mockResolvedValue(true);

      await expect(service.banUser(1, 10)).rejects.toThrow('User is already banned');
    });

    it('should kick the user from the WS room', async () => {
      mockBanRepo.isBanned.mockResolvedValue(false);

      const client = createMockClient();
      connectionService.trackClient(client, {
        userId: 10,
        username: 'target',
        displayName: 'T',
      });
      const tracked = connectionService.getTracked(client)!;
      service.manager.joinRoom('1', tracked.id, {
        userId: 10,
        username: 'target',
        displayName: 'T',
      });

      await service.banUser(1, 10);

      const calls = (client.send as jest.Mock).mock.calls;
      const kickMsg = calls.find((c: any) => JSON.parse(c[0]).event === WS_EMIT.MEMBER_KICKED);
      expect(kickMsg).toBeDefined();
      expect(JSON.parse(kickMsg[0]).data).toEqual({ roomId: 1, userId: 10 });
    });
  });

  describe('unbanUser', () => {
    it('should delete the ban', async () => {
      mockBanRepo.delete.mockResolvedValue({ id: 1 });

      await service.unbanUser(1, 10);
      expect(mockBanRepo.delete).toHaveBeenCalledWith(1, 10);
    });

    it('should throw NotFoundException if ban does not exist', async () => {
      mockBanRepo.delete.mockResolvedValue(null);

      await expect(service.unbanUser(1, 10)).rejects.toThrow('Ban not found');
    });
  });

  describe('bulkInvite', () => {
    it('should call createMany with user IDs', async () => {
      await service.bulkInvite(1, [10, 20, 30]);
      expect(mockInviteRepo.createMany).toHaveBeenCalledWith(1, [10, 20, 30]);
    });

    it('should no-op for empty array', async () => {
      await service.bulkInvite(1, []);
      expect(mockInviteRepo.createMany).not.toHaveBeenCalled();
    });
  });

  /**
   * For any room, a leave-roster request from the room owner should be rejected
   * with a forbidden error, and the roster should remain unchanged.
   */
  describe('Owner cannot leave roster', () => {
    it('should reject removeFromRoster when userId is the room owner', async () => {
      await fc.assert(
        fc.asyncProperty(fc.integer({ min: 1, max: 10000 }), async (ownerId) => {
          mockRepo.findById.mockResolvedValue({
            id: 1,
            ownerId,
            visibility: 'public',
            name: 'Test Room',
          });
          mockRosterRepo.removeMember.mockClear();

          await expect(service.removeFromRoster(1, ownerId)).rejects.toThrow(ForbiddenException);
          expect(mockRosterRepo.removeMember).not.toHaveBeenCalled();
        }),
        { numRuns: 100 },
      );
    });
  });

  /**
   * For any room with an active game session, a roster reorder request should be
   * rejected with an error, and the roster should remain unchanged.
   */
  describe('Roster reorder rejected during active game', () => {
    it('should reject reorderRoster when game is active', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uniqueArray(fc.integer({ min: 1, max: 10000 }), { minLength: 0, maxLength: 5 }),
          fc.uniqueArray(fc.integer({ min: 1, max: 10000 }), { minLength: 0, maxLength: 5 }),
          async (players, spectators) => {
            mockRosterRepo.replaceRoster.mockClear();

            await expect(
              service.reorderRoster(1, players, spectators, { gameActive: true }),
            ).rejects.toThrow(ConflictException);
            expect(mockRosterRepo.replaceRoster).not.toHaveBeenCalled();
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe('reorderRoster - color assignment', () => {
    const roomId = 1;

    const makeMember = (
      userId: number,
      section: 'players' | 'spectators',
      assignedHue: number | null,
    ) => ({
      userId,
      username: `user${userId}`,
      displayName: `User ${userId}`,
      section,
      position: 0,
      assignedHue,
      readyToPlay: true,
    });

    beforeEach(() => {
      // getRoster calls rooms.findById after reorder
      mockRepo.findById.mockResolvedValue({ id: roomId, rotationMode: 'none' });
    });

    it('should assign a hue when a spectator is first promoted to player', async () => {
      const spectator = makeMember(1, 'spectators', null);
      mockRosterRepo.findByRoom.mockResolvedValue([spectator]);
      mockColorAssignment.assignHue.mockReturnValue(42);
      mockRosterRepo.getAssignedHues.mockResolvedValue([{ userId: 1, assignedHue: null }]);

      await service.reorderRoster(roomId, [1], []);

      expect(mockColorAssignment.assignHue).toHaveBeenCalled();
      expect(mockRosterRepo.setAssignedHue).toHaveBeenCalledWith(roomId, 1, 42);
    });

    it('should retain existing hue without recomputation when re-promoting a spectator', async () => {
      const spectatorWithHue = makeMember(1, 'spectators', 120);
      mockRosterRepo.findByRoom.mockResolvedValue([spectatorWithHue]);

      await service.reorderRoster(roomId, [1], []);

      expect(mockColorAssignment.assignHue).not.toHaveBeenCalled();
    });

    it('should keep existing hue when an active player is reordered', async () => {
      const existingPlayer = makeMember(1, 'players', 60);
      mockRosterRepo.findByRoom.mockResolvedValue([existingPlayer]);

      await service.reorderRoster(roomId, [1], []);

      expect(mockColorAssignment.assignHue).not.toHaveBeenCalled();
    });
  });
});
