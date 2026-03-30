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
    >
  >;
  let gameService: jest.Mocked<Pick<GameService, 'forceCleanupRoom'>>;

  const alice: UserIdentity = { userId: 1, username: 'alice', displayName: 'Alice' };
  const bob: UserIdentity = { userId: 2, username: 'bob', displayName: 'Bob' };

  const makeRequest = (user: UserIdentity) => ({ [REQUEST_USER_KEY]: user }) as any;

  const now = new Date('2026-03-16T00:00:00Z');

  const dbRoom = {
    id: 1,
    name: 'Test Room',
    ownerId: 1,
    ownerDisplayName: 'Alice',
    visibility: 'public',
    createdAt: now,
    updatedAt: now,
  };

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
    };

    gameService = {
      forceCleanupRoom: jest.fn().mockResolvedValue(null),
    };

    controller = new RoomController(
      roomService as unknown as RoomService,
      gameService as unknown as GameService,
    );
  });

  describe('create', () => {
    it('should create a room and return response', async () => {
      roomService.create.mockResolvedValue(dbRoom);

      const result = await controller.create(makeRequest(alice), {
        name: 'Test Room',
      });

      expect(roomService.create).toHaveBeenCalledWith('Test Room', 1, 'public');
      expect(result.id).toBe(1);
      expect(result.name).toBe('Test Room');
      expect(result.ownerId).toBe(1);
      expect(result.ownerDisplayName).toBe('Alice');
      expect(result.visibility).toBe('public');
      expect(result.onlineCount).toBe(0);
    });

    it('should pass visibility when provided', async () => {
      roomService.create.mockResolvedValue({ ...dbRoom, visibility: 'invite-only' });

      await controller.create(makeRequest(alice), {
        name: 'Private Room',
        visibility: 'invite-only',
      });

      expect(roomService.create).toHaveBeenCalledWith('Private Room', 1, 'invite-only');
    });
  });

  describe('list', () => {
    it('should return rooms for the user with online counts', async () => {
      roomService.findAllForUser.mockResolvedValue([dbRoom]);
      roomService.getOnlineCount.mockReturnValue(3);

      const result = await controller.list(makeRequest(alice));

      expect(roomService.findAllForUser).toHaveBeenCalledWith(alice.userId);
      expect(result).toHaveLength(1);
      expect(result[0].onlineCount).toBe(3);
    });

    it('should return empty array when no rooms exist', async () => {
      roomService.findAllForUser.mockResolvedValue([]);

      const result = await controller.list(makeRequest(alice));
      expect(result).toEqual([]);
    });
  });

  describe('findOne', () => {
    it('should return a room by id', async () => {
      roomService.canAccessRoom.mockResolvedValue(true);
      roomService.findById.mockResolvedValue(dbRoom);

      const result = await controller.findOne(makeRequest(alice), 1);
      expect(result.id).toBe(1);
      expect(result.name).toBe('Test Room');
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
});
