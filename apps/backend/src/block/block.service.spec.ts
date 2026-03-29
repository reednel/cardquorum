import { BlockService } from './block.service';

describe('BlockService', () => {
  let service: BlockService;
  let mockBlockRepo: {
    create: jest.Mock;
    deleteByBlockerAndBlocked: jest.Mock;
    findByBlocker: jest.Mock;
    findBlockedIds: jest.Mock;
    isBlocked: jest.Mock;
  };
  let mockFriendshipRepo: {
    deleteBetweenUsers: jest.Mock;
  };
  let mockUserRepo: {
    findById: jest.Mock;
  };

  const now = new Date();
  const block = { id: 1, blockerId: 10, blockedId: 20, createdAt: now };

  beforeEach(() => {
    mockBlockRepo = {
      create: jest.fn(),
      deleteByBlockerAndBlocked: jest.fn(),
      findByBlocker: jest.fn(),
      findBlockedIds: jest.fn(),
      isBlocked: jest.fn(),
    };
    mockFriendshipRepo = {
      deleteBetweenUsers: jest.fn(),
    };
    mockUserRepo = {
      findById: jest.fn(),
    };

    service = new BlockService(
      mockBlockRepo as any,
      mockFriendshipRepo as any,
      mockUserRepo as any,
    );
  });

  describe('blockUser', () => {
    it('should create a block and return response', async () => {
      mockUserRepo.findById.mockResolvedValue({ id: 20, username: 'bob', displayName: 'Bob' });
      mockBlockRepo.isBlocked.mockResolvedValue(false);
      mockFriendshipRepo.deleteBetweenUsers.mockResolvedValue(null);
      mockBlockRepo.create.mockResolvedValue(block);

      const result = await service.blockUser(10, 20);

      expect(result.userId).toBe(20);
      expect(result.username).toBe('bob');
      expect(result.blockedAt).toBe(now.toISOString());
    });

    it('should delete existing friendship when blocking', async () => {
      mockUserRepo.findById.mockResolvedValue({ id: 20, username: 'bob', displayName: 'Bob' });
      mockBlockRepo.isBlocked.mockResolvedValue(false);
      mockFriendshipRepo.deleteBetweenUsers.mockResolvedValue({ id: 5 });
      mockBlockRepo.create.mockResolvedValue(block);

      await service.blockUser(10, 20);

      expect(mockFriendshipRepo.deleteBetweenUsers).toHaveBeenCalledWith(10, 20);
    });

    it('should throw 400 when blocking self', async () => {
      await expect(service.blockUser(10, 10)).rejects.toThrow('Cannot block yourself');
    });

    it('should throw 404 when target user does not exist', async () => {
      mockUserRepo.findById.mockResolvedValue(null);
      await expect(service.blockUser(10, 99)).rejects.toThrow('User not found');
    });

    it('should throw 409 when already blocked', async () => {
      mockUserRepo.findById.mockResolvedValue({ id: 20 });
      mockBlockRepo.isBlocked.mockResolvedValue(true);
      await expect(service.blockUser(10, 20)).rejects.toThrow();
    });
  });

  describe('unblockUser', () => {
    it('should delete the block', async () => {
      mockBlockRepo.deleteByBlockerAndBlocked.mockResolvedValue({ id: 1 });
      await service.unblockUser(10, 20);
      expect(mockBlockRepo.deleteByBlockerAndBlocked).toHaveBeenCalledWith(10, 20);
    });

    it('should throw 404 when block does not exist', async () => {
      mockBlockRepo.deleteByBlockerAndBlocked.mockResolvedValue(null);
      await expect(service.unblockUser(10, 99)).rejects.toThrow();
    });
  });

  describe('getBlockList', () => {
    it('should return formatted block list', async () => {
      mockBlockRepo.findByBlocker.mockResolvedValue([
        {
          id: 1,
          blockedId: 20,
          createdAt: now,
          blockedUsername: 'bob',
          blockedDisplayName: 'Bob',
        },
      ]);

      const result = await service.getBlockList(10);

      expect(result).toEqual([
        {
          userId: 20,
          username: 'bob',
          displayName: 'Bob',
          blockedAt: now.toISOString(),
        },
      ]);
    });
  });

  describe('getBlockedIds', () => {
    it('should delegate to repository', async () => {
      mockBlockRepo.findBlockedIds.mockResolvedValue([20, 30]);
      const result = await service.getBlockedIds(10);
      expect(result).toEqual([20, 30]);
    });
  });

  describe('isBlocked', () => {
    it('should delegate to repository', async () => {
      mockBlockRepo.isBlocked.mockResolvedValue(true);
      const result = await service.isBlocked(10, 20);
      expect(result).toBe(true);
    });
  });
});
