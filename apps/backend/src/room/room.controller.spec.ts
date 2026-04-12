import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserIdentity } from '@cardquorum/shared';
import { REQUEST_USER_KEY } from '../auth/http-auth.guard';
import { GameService } from '../game/game.service';
import { RoomController } from './room.controller';
import { RoomService } from './room.service';

describe('RoomController', () => {
  let controller: RoomController;
  let roomService: jest.Mocked<
    Pick<
      RoomService,
      | 'findById'
      | 'findAll'
      | 'findAllForUser'
      | 'canAccessRoom'
      | 'create'
      | 'update'
      | 'delete'
      | 'getOnlineCount'
      | 'inviteUser'
      | 'uninviteUser'
      | 'banUser'
      | 'unbanUser'
      | 'getInvites'
      | 'getBans'
      | 'bulkInvite'
      | 'kickUser'
      | 'getRoster'
      | 'reorderRoster'
      | 'toggleRotatePlayers'
      | 'countMembers'
      | 'isMember'
      | 'loadGameSettings'
      | 'findMemberships'
      | 'findDiscoverablePrivate'
      | 'findDiscoverablePublic'
      | 'searchDiscoverable'
      | 'removeFromRoster'
    >
  >;
  let gameService: jest.Mocked<Pick<GameService, 'forceCleanupRoom' | 'isGameActive'>>;

  const alice: UserIdentity = { userId: 1, username: 'alice', displayName: 'Alice' };
  const bob: UserIdentity = { userId: 2, username: 'bob', displayName: 'Bob' };

  const makeRequest = (user: UserIdentity) => ({ [REQUEST_USER_KEY]: user }) as any;

  const now = new Date('2026-03-16T00:00:00Z');

  const dbRoom = {
    id: 1,
    name: 'Test Room',
    description: null as string | null,
    ownerId: 1,
    ownerDisplayName: 'Alice',
    ownerUsername: 'alice',
    visibility: 'public',
    memberLimit: null as number | null,
    rotatePlayers: false,
    createdAt: now,
    updatedAt: now,
  };

  const nullGameSettings = null;

  beforeEach(() => {
    roomService = {
      findById: jest.fn(),
      findAll: jest.fn(),
      findAllForUser: jest.fn(),
      canAccessRoom: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      getOnlineCount: jest.fn().mockReturnValue(0),
      inviteUser: jest.fn().mockResolvedValue(undefined),
      uninviteUser: jest.fn().mockResolvedValue(undefined),
      banUser: jest.fn().mockResolvedValue(undefined),
      unbanUser: jest.fn().mockResolvedValue(undefined),
      getInvites: jest.fn().mockResolvedValue([]),
      getBans: jest.fn().mockResolvedValue([]),
      bulkInvite: jest.fn().mockResolvedValue(undefined),
      kickUser: jest.fn().mockResolvedValue({ players: [], spectators: [], rotatePlayers: false }),
      getRoster: jest.fn().mockResolvedValue({ players: [], spectators: [], rotatePlayers: false }),
      reorderRoster: jest
        .fn()
        .mockResolvedValue({ players: [], spectators: [], rotatePlayers: false }),
      toggleRotatePlayers: jest
        .fn()
        .mockResolvedValue({ players: [], spectators: [], rotatePlayers: false }),
      countMembers: jest.fn().mockResolvedValue(0),
      isMember: jest.fn().mockResolvedValue(false),
      loadGameSettings: jest.fn().mockResolvedValue(nullGameSettings),
      findMemberships: jest.fn().mockResolvedValue([]),
      findDiscoverablePrivate: jest.fn().mockResolvedValue([]),
      findDiscoverablePublic: jest
        .fn()
        .mockResolvedValue({ data: [], total: 0, page: 1, pageSize: 20 }),
      searchDiscoverable: jest.fn().mockResolvedValue([]),
      removeFromRoster: jest
        .fn()
        .mockResolvedValue({ players: [], spectators: [], rotatePlayers: false }),
    };

    gameService = {
      forceCleanupRoom: jest.fn().mockResolvedValue(null),
      isGameActive: jest.fn().mockReturnValue(false),
    };

    controller = new RoomController(
      roomService as unknown as RoomService,
      gameService as unknown as GameService,
    );
  });

  describe('create', () => {
    it('should create a room and return enriched response', async () => {
      roomService.create.mockResolvedValue(dbRoom);

      const result = await controller.create(makeRequest(alice), {
        name: 'Test Room',
      });

      expect(roomService.create).toHaveBeenCalledWith(
        'Test Room',
        1,
        'public',
        undefined,
        undefined,
      );
      expect(result.id).toBe(1);
      expect(result.name).toBe('Test Room');
      expect(result.ownerId).toBe(1);
      expect(result.ownerDisplayName).toBe('Alice');
      expect(result.ownerUsername).toBe('alice');
      expect(result.visibility).toBe('public');
      expect(result.onlineCount).toBe(0);
      expect(result.description).toBeNull();
      expect(result.gameType).toBeNull();
      expect(result.presetName).toBeNull();
      expect(result.gameInProgress).toBe(false);
    });

    it('should pass visibility when provided', async () => {
      roomService.create.mockResolvedValue({ ...dbRoom, visibility: 'invite-only' });

      await controller.create(makeRequest(alice), {
        name: 'Private Room',
        visibility: 'invite-only',
      });

      expect(roomService.create).toHaveBeenCalledWith(
        'Private Room',
        1,
        'invite-only',
        undefined,
        undefined,
      );
    });

    it('should pass description to the service', async () => {
      roomService.create.mockResolvedValue({ ...dbRoom, description: 'My room desc' });

      const result = await controller.create(makeRequest(alice), {
        name: 'Test Room',
        description: 'My room desc',
      });

      expect(roomService.create).toHaveBeenCalledWith(
        'Test Room',
        1,
        'public',
        undefined,
        'My room desc',
      );
      expect(result.description).toBe('My room desc');
    });
  });

  describe('list', () => {
    it('should return rooms with enriched fields', async () => {
      roomService.findAllForUser.mockResolvedValue([dbRoom]);
      roomService.getOnlineCount.mockReturnValue(3);
      roomService.loadGameSettings.mockResolvedValue({
        gameType: 'sheepshead',
        presetName: '3-hand',
        config: {},
        autostart: false,
      } as any);
      gameService.isGameActive.mockReturnValue(true);

      const result = await controller.list(makeRequest(alice));

      expect(roomService.findAllForUser).toHaveBeenCalledWith(alice.userId);
      expect(result).toHaveLength(1);
      expect(result[0].onlineCount).toBe(3);
      expect(result[0].description).toBeNull();
      expect(result[0].ownerUsername).toBe('alice');
      expect(result[0].gameType).toBe('sheepshead');
      expect(result[0].presetName).toBe('3-hand');
      expect(result[0].gameInProgress).toBe(true);
    });

    it('should return empty array when no rooms exist', async () => {
      roomService.findAllForUser.mockResolvedValue([]);

      const result = await controller.list(makeRequest(alice));
      expect(result).toEqual([]);
    });
  });

  describe('findOne', () => {
    it('should return an enriched room by id', async () => {
      roomService.canAccessRoom.mockResolvedValue(true);
      roomService.findById.mockResolvedValue(dbRoom);
      roomService.loadGameSettings.mockResolvedValue({
        gameType: 'sheepshead',
        presetName: null,
        config: {},
        autostart: false,
      } as any);
      gameService.isGameActive.mockReturnValue(false);

      const result = await controller.findOne(makeRequest(alice), 1);
      expect(result.id).toBe(1);
      expect(result.name).toBe('Test Room');
      expect(result.description).toBeNull();
      expect(result.ownerUsername).toBe('alice');
      expect(result.gameType).toBe('sheepshead');
      expect(result.presetName).toBeNull();
      expect(result.gameInProgress).toBe(false);
    });

    it('should throw NotFoundException when user cannot access room', async () => {
      roomService.canAccessRoom.mockResolvedValue(false);

      await expect(controller.findOne(makeRequest(alice), 999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update room when owner requests', async () => {
      roomService.findById.mockResolvedValue(dbRoom);
      roomService.update.mockResolvedValue({ ...dbRoom, name: 'New Name' });

      const result = await controller.update(makeRequest(alice), 1, { name: 'New Name' });

      expect(roomService.update).toHaveBeenCalledWith(1, { name: 'New Name' });
      expect(result.name).toBe('New Name');
    });

    it('should pass description in the update fields', async () => {
      roomService.findById.mockResolvedValue(dbRoom);
      roomService.update.mockResolvedValue({ ...dbRoom, description: 'Updated desc' });

      const result = await controller.update(makeRequest(alice), 1, {
        description: 'Updated desc',
      });

      expect(roomService.update).toHaveBeenCalledWith(1, { description: 'Updated desc' });
      expect(result.description).toBe('Updated desc');
    });

    it('should throw ForbiddenException when non-owner tries to update', async () => {
      roomService.findById.mockResolvedValue(dbRoom);

      await expect(controller.update(makeRequest(bob), 1, { name: 'Hijacked' })).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw NotFoundException for missing room', async () => {
      roomService.findById.mockResolvedValue(null);

      await expect(controller.update(makeRequest(alice), 999, { name: 'Nope' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('memberships', () => {
    it('should return memberships for the requesting user', async () => {
      const mockResponse = [
        {
          id: 1,
          name: 'Room 1',
          description: null,
          ownerId: 1,
          ownerDisplayName: 'Alice',
          ownerUsername: 'alice',
          visibility: 'public' as const,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
          onlineCount: 0,
          memberLimit: null,
          rosterCount: 2,
          isOnRoster: true,
          gameType: null,
          presetName: null,
          gameInProgress: false,
        },
      ];
      roomService.findMemberships.mockResolvedValue(mockResponse);

      const result = await controller.memberships(makeRequest(alice));

      expect(roomService.findMemberships).toHaveBeenCalledWith(alice.userId);
      expect(result).toEqual(mockResponse);
    });
  });

  describe('discover', () => {
    it('should call searchDiscoverable when search query is provided', async () => {
      const mockResults = [
        {
          id: 2,
          name: 'Fun Room',
          description: null,
          ownerId: 2,
          ownerDisplayName: 'Bob',
          ownerUsername: 'bob',
          visibility: 'public' as const,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
          onlineCount: 0,
          memberLimit: null,
          rosterCount: 1,
          isOnRoster: false,
          gameType: null,
          presetName: null,
          gameInProgress: false,
        },
      ];
      roomService.searchDiscoverable.mockResolvedValue(mockResults);

      const result = await controller.discover(makeRequest(alice), undefined, 'Fun');

      expect(roomService.searchDiscoverable).toHaveBeenCalledWith(alice.userId, 'Fun');
      expect(result).toEqual(mockResults);
    });

    it('should call findDiscoverablePrivate when filter is private', async () => {
      roomService.findDiscoverablePrivate.mockResolvedValue([]);

      const result = await controller.discover(makeRequest(alice), 'private');

      expect(roomService.findDiscoverablePrivate).toHaveBeenCalledWith(alice.userId);
      expect(result).toEqual([]);
    });

    it('should call findDiscoverablePublic with pagination when filter is public', async () => {
      const mockPaginated = { data: [], total: 0, page: 2, pageSize: 10 };
      roomService.findDiscoverablePublic.mockResolvedValue(mockPaginated);

      const result = await controller.discover(makeRequest(alice), 'public', undefined, '2', '10');

      expect(roomService.findDiscoverablePublic).toHaveBeenCalledWith(alice.userId, 2, 10);
      expect(result).toEqual(mockPaginated);
    });

    it('should default to page 1 and pageSize 20 when not provided', async () => {
      const mockPaginated = { data: [], total: 0, page: 1, pageSize: 20 };
      roomService.findDiscoverablePublic.mockResolvedValue(mockPaginated);

      await controller.discover(makeRequest(alice), 'public');

      expect(roomService.findDiscoverablePublic).toHaveBeenCalledWith(alice.userId, 1, 20);
    });

    it('should throw BadRequestException when no filter or search is provided', async () => {
      await expect(controller.discover(makeRequest(alice))).rejects.toThrow(BadRequestException);
    });

    it('should prioritize search over filter', async () => {
      roomService.searchDiscoverable.mockResolvedValue([]);

      await controller.discover(makeRequest(alice), 'public', 'query');

      expect(roomService.searchDiscoverable).toHaveBeenCalledWith(alice.userId, 'query');
      expect(roomService.findDiscoverablePublic).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('should delete room when owner requests', async () => {
      roomService.findById.mockResolvedValue(dbRoom);
      roomService.delete.mockResolvedValue({ id: 1 });

      const result = await controller.remove(makeRequest(alice), 1);

      expect(gameService.forceCleanupRoom).toHaveBeenCalledWith(1);
      expect(roomService.delete).toHaveBeenCalledWith(1);
      expect(result).toEqual({ deleted: true });
    });

    it('should throw ForbiddenException when non-owner tries to delete', async () => {
      roomService.findById.mockResolvedValue(dbRoom);

      await expect(controller.remove(makeRequest(bob), 1)).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException for missing room', async () => {
      roomService.findById.mockResolvedValue(null);

      await expect(controller.remove(makeRequest(alice), 999)).rejects.toThrow(NotFoundException);
    });

    it('should clean up game session before deleting room', async () => {
      roomService.findById.mockResolvedValue(dbRoom);
      roomService.delete.mockResolvedValue({ id: 1 });
      gameService.forceCleanupRoom.mockResolvedValue(42);

      await controller.remove(makeRequest(alice), 1);

      // forceCleanupRoom should be called before delete
      const cleanupOrder = gameService.forceCleanupRoom.mock.invocationCallOrder[0];
      const deleteOrder = roomService.delete.mock.invocationCallOrder[0];
      expect(cleanupOrder).toBeLessThan(deleteOrder);
    });
  });

  describe('create with invites', () => {
    it('should bulk invite users when invitedUserIds provided', async () => {
      roomService.create.mockResolvedValue(dbRoom);

      await controller.create(makeRequest(alice), {
        name: 'Invite Room',
        visibility: 'invite-only',
        invitedUserIds: [2, 3],
      });

      expect(roomService.bulkInvite).toHaveBeenCalledWith(1, [2, 3]);
    });

    it('should filter out the owner from invitedUserIds', async () => {
      roomService.create.mockResolvedValue(dbRoom);

      await controller.create(makeRequest(alice), {
        name: 'Invite Room',
        visibility: 'invite-only',
        invitedUserIds: [1, 2],
      });

      expect(roomService.bulkInvite).toHaveBeenCalledWith(1, [2]);
    });

    it('should not call bulkInvite when no invitedUserIds', async () => {
      roomService.create.mockResolvedValue(dbRoom);

      await controller.create(makeRequest(alice), { name: 'Room' });

      expect(roomService.bulkInvite).not.toHaveBeenCalled();
    });
  });

  describe('invite', () => {
    it('should invite a user when owner requests', async () => {
      roomService.findById.mockResolvedValue(dbRoom);

      const result = await controller.invite(makeRequest(alice), 1, { userId: 2 });

      expect(roomService.inviteUser).toHaveBeenCalledWith(1, 2);
      expect(result).toEqual({ success: true });
    });

    it('should throw ForbiddenException when non-owner invites', async () => {
      roomService.findById.mockResolvedValue(dbRoom);

      await expect(controller.invite(makeRequest(bob), 1, { userId: 3 })).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw BadRequestException when inviting self', async () => {
      roomService.findById.mockResolvedValue(dbRoom);

      await expect(controller.invite(makeRequest(alice), 1, { userId: 1 })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('uninvite', () => {
    it('should uninvite a user when owner requests', async () => {
      roomService.findById.mockResolvedValue(dbRoom);

      const result = await controller.uninvite(makeRequest(alice), 1, 2);

      expect(roomService.uninviteUser).toHaveBeenCalledWith(1, 2);
      expect(result).toEqual({ success: true });
    });

    it('should throw ForbiddenException when non-owner uninvites', async () => {
      roomService.findById.mockResolvedValue(dbRoom);

      await expect(controller.uninvite(makeRequest(bob), 1, 3)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('ban', () => {
    it('should ban a user when owner requests', async () => {
      roomService.findById.mockResolvedValue(dbRoom);

      const result = await controller.ban(makeRequest(alice), 1, { userId: 2 });

      expect(roomService.banUser).toHaveBeenCalledWith(1, 2);
      expect(result).toEqual({ success: true });
    });

    it('should throw ForbiddenException when non-owner bans', async () => {
      roomService.findById.mockResolvedValue(dbRoom);

      await expect(controller.ban(makeRequest(bob), 1, { userId: 3 })).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw BadRequestException when banning self', async () => {
      roomService.findById.mockResolvedValue(dbRoom);

      await expect(controller.ban(makeRequest(alice), 1, { userId: 1 })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('unban', () => {
    it('should unban a user when owner requests', async () => {
      roomService.findById.mockResolvedValue(dbRoom);

      const result = await controller.unban(makeRequest(alice), 1, 2);

      expect(roomService.unbanUser).toHaveBeenCalledWith(1, 2);
      expect(result).toEqual({ success: true });
    });

    it('should throw ForbiddenException when non-owner unbans', async () => {
      roomService.findById.mockResolvedValue(dbRoom);

      await expect(controller.unban(makeRequest(bob), 1, 3)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('kick', () => {
    it('should kick a user when owner requests', async () => {
      roomService.findById.mockResolvedValue(dbRoom);

      const result = await controller.kick(makeRequest(alice), 1, { userId: 2 });

      expect(roomService.kickUser).toHaveBeenCalledWith(1, 2);
      expect(result).toEqual({ success: true });
    });

    it('should throw ForbiddenException when non-owner kicks', async () => {
      roomService.findById.mockResolvedValue(dbRoom);

      await expect(controller.kick(makeRequest(bob), 1, { userId: 3 })).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw BadRequestException when kicking self', async () => {
      roomService.findById.mockResolvedValue(dbRoom);

      await expect(controller.kick(makeRequest(alice), 1, { userId: 1 })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('listInvites', () => {
    it('should return invites for accessible room', async () => {
      roomService.canAccessRoom.mockResolvedValue(true);
      const invites = [{ userId: 2, username: 'bob', displayName: 'Bob', invitedAt: 'x' }];
      roomService.getInvites.mockResolvedValue(invites);

      const result = await controller.listInvites(makeRequest(alice), 1);

      expect(result).toEqual(invites);
    });

    it('should throw NotFoundException when user cannot access room', async () => {
      roomService.canAccessRoom.mockResolvedValue(false);

      await expect(controller.listInvites(makeRequest(bob), 1)).rejects.toThrow(NotFoundException);
    });
  });

  describe('listBans', () => {
    it('should return bans for owner', async () => {
      roomService.findById.mockResolvedValue(dbRoom);
      const bans = [{ userId: 3, username: 'carol', displayName: 'Carol', bannedAt: 'x' }];
      roomService.getBans.mockResolvedValue(bans);

      const result = await controller.listBans(makeRequest(alice), 1);

      expect(result).toEqual(bans);
    });

    it('should throw ForbiddenException for non-owner', async () => {
      roomService.findById.mockResolvedValue(dbRoom);

      await expect(controller.listBans(makeRequest(bob), 1)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getRoster', () => {
    const rosterState = {
      players: [
        {
          userId: 1,
          username: 'alice',
          displayName: 'Alice',
          section: 'players' as const,
          position: 0,
          assignedHue: null,
        },
      ],
      spectators: [
        {
          userId: 2,
          username: 'bob',
          displayName: 'Bob',
          section: 'spectators' as const,
          position: 0,
          assignedHue: null,
        },
      ],
      rotatePlayers: false,
    };

    it('should return roster for accessible room', async () => {
      roomService.canAccessRoom.mockResolvedValue(true);
      roomService.getRoster.mockResolvedValue(rosterState);

      const result = await controller.getRoster(makeRequest(alice), 1);

      expect(roomService.canAccessRoom).toHaveBeenCalledWith(1, alice.userId);
      expect(roomService.getRoster).toHaveBeenCalledWith(1);
      expect(result).toEqual(rosterState);
    });

    it('should throw NotFoundException when user cannot access room', async () => {
      roomService.canAccessRoom.mockResolvedValue(false);

      await expect(controller.getRoster(makeRequest(bob), 1)).rejects.toThrow(NotFoundException);
    });
  });

  describe('leaveRoom', () => {
    it('should remove the requesting user from the roster', async () => {
      const result = await controller.leaveRoom(makeRequest(bob), 1);

      expect(roomService.removeFromRoster).toHaveBeenCalledWith(1, bob.userId);
      expect(result).toEqual({ success: true });
    });

    it('should propagate ForbiddenException when owner tries to leave', async () => {
      roomService.removeFromRoster.mockRejectedValue(
        new ForbiddenException('Room owner cannot leave the room'),
      );

      await expect(controller.leaveRoom(makeRequest(alice), 1)).rejects.toThrow(ForbiddenException);
    });

    it('should propagate NotFoundException when room does not exist', async () => {
      roomService.removeFromRoster.mockRejectedValue(new NotFoundException('Room not found'));

      await expect(controller.leaveRoom(makeRequest(alice), 999)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateRoster', () => {
    const updatedRoster = {
      players: [
        {
          userId: 2,
          username: 'bob',
          displayName: 'Bob',
          section: 'players' as const,
          position: 0,
          assignedHue: null,
        },
      ],
      spectators: [
        {
          userId: 1,
          username: 'alice',
          displayName: 'Alice',
          section: 'spectators' as const,
          position: 0,
          assignedHue: null,
        },
      ],
      rotatePlayers: false,
    };

    it('should reorder roster when owner requests', async () => {
      roomService.findById.mockResolvedValue(dbRoom);
      gameService.isGameActive.mockReturnValue(false);
      roomService.reorderRoster.mockResolvedValue(updatedRoster);

      const result = await controller.updateRoster(makeRequest(alice), 1, {
        players: [2],
        spectators: [1],
      });

      expect(gameService.isGameActive).toHaveBeenCalledWith(1);
      expect(roomService.reorderRoster).toHaveBeenCalledWith(1, [2], [1], { gameActive: false });
      expect(result).toEqual(updatedRoster);
    });

    it('should pass gameActive true when a game is active', async () => {
      roomService.findById.mockResolvedValue(dbRoom);
      gameService.isGameActive.mockReturnValue(true);
      roomService.reorderRoster.mockResolvedValue(updatedRoster);

      await controller.updateRoster(makeRequest(alice), 1, {
        players: [2],
        spectators: [1],
      });

      expect(roomService.reorderRoster).toHaveBeenCalledWith(1, [2], [1], { gameActive: true });
    });

    it('should throw ForbiddenException when non-owner reorders', async () => {
      roomService.findById.mockResolvedValue(dbRoom);

      await expect(
        controller.updateRoster(makeRequest(bob), 1, { players: [2], spectators: [1] }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException for missing room', async () => {
      roomService.findById.mockResolvedValue(null);

      await expect(
        controller.updateRoster(makeRequest(alice), 999, { players: [], spectators: [] }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('toggleRotate', () => {
    const rosterWithRotate = {
      players: [],
      spectators: [],
      rotatePlayers: true,
    };

    it('should toggle rotation when owner requests', async () => {
      roomService.findById.mockResolvedValue(dbRoom);
      roomService.toggleRotatePlayers.mockResolvedValue(rosterWithRotate);

      const result = await controller.toggleRotate(makeRequest(alice), 1, { enabled: true });

      expect(roomService.toggleRotatePlayers).toHaveBeenCalledWith(1, true);
      expect(result).toEqual(rosterWithRotate);
    });

    it('should throw ForbiddenException when non-owner toggles', async () => {
      roomService.findById.mockResolvedValue(dbRoom);

      await expect(controller.toggleRotate(makeRequest(bob), 1, { enabled: true })).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw NotFoundException for missing room', async () => {
      roomService.findById.mockResolvedValue(null);

      await expect(
        controller.toggleRotate(makeRequest(alice), 999, { enabled: false }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
