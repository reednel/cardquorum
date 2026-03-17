import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserIdentity } from '@cardquorum/shared';
import { REQUEST_USER_KEY } from '../auth/http-auth.guard';
import { GameService } from '../game/game.service';
import { RoomController } from './room.controller';
import { RoomService } from './room.service';

describe('RoomController', () => {
  let controller: RoomController;
  let roomService: jest.Mocked<
    Pick<RoomService, 'findById' | 'findAll' | 'create' | 'update' | 'delete' | 'getOnlineCount'>
  >;
  let gameService: jest.Mocked<Pick<GameService, 'forceCleanupRoom'>>;

  const alice: UserIdentity = { userId: 1, displayName: 'Alice' };
  const bob: UserIdentity = { userId: 2, displayName: 'Bob' };

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
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      getOnlineCount: jest.fn().mockReturnValue(0),
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
    it('should return public rooms with online counts', async () => {
      roomService.findAll.mockResolvedValue([dbRoom]);
      roomService.getOnlineCount.mockReturnValue(3);

      const result = await controller.list();

      expect(roomService.findAll).toHaveBeenCalledWith('public');
      expect(result).toHaveLength(1);
      expect(result[0].onlineCount).toBe(3);
    });

    it('should return empty array when no rooms exist', async () => {
      roomService.findAll.mockResolvedValue([]);

      const result = await controller.list();
      expect(result).toEqual([]);
    });
  });

  describe('findOne', () => {
    it('should return a room by id', async () => {
      roomService.findById.mockResolvedValue(dbRoom);

      const result = await controller.findOne(1);
      expect(result.id).toBe(1);
      expect(result.name).toBe('Test Room');
    });

    it('should throw NotFoundException for missing room', async () => {
      roomService.findById.mockResolvedValue(null);

      await expect(controller.findOne(999)).rejects.toThrow(NotFoundException);
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
});
