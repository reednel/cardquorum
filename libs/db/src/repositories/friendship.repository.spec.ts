import { FriendshipRepository } from './friendship.repository';

function createMockDb() {
  return {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn(),
    insert: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    returning: jest.fn(),
    delete: jest.fn().mockReturnThis(),
  } as any;
}

describe('FriendshipRepository', () => {
  let repo: FriendshipRepository;
  let db: ReturnType<typeof createMockDb>;

  const now = new Date();
  const friendship = {
    id: 1,
    userId1: 10,
    userId2: 20,
    createdAt: now,
  };

  beforeEach(() => {
    db = createMockDb();
    repo = new FriendshipRepository(db);
  });

  describe('create', () => {
    it('should insert a friendship and return it', async () => {
      db.returning.mockResolvedValue([friendship]);
      const result = await repo.create(10, 20);
      expect(result).toBe(friendship);
      expect(db.insert).toHaveBeenCalled();
    });
  });

  describe('findById', () => {
    it('should return the friendship when found', async () => {
      db.limit.mockResolvedValue([friendship]);
      const result = await repo.findById(1);
      expect(result).toBe(friendship);
    });

    it('should return null when not found', async () => {
      db.limit.mockResolvedValue([]);
      const result = await repo.findById(999);
      expect(result).toBeNull();
    });
  });

  describe('findBetweenUsers', () => {
    it('should return the friendship between two users', async () => {
      db.limit.mockResolvedValue([friendship]);
      const result = await repo.findBetweenUsers(10, 20);
      expect(result).toBe(friendship);
    });

    it('should return null when no friendship exists', async () => {
      db.limit.mockResolvedValue([]);
      const result = await repo.findBetweenUsers(10, 99);
      expect(result).toBeNull();
    });
  });

  describe('findFriends', () => {
    it('should return friendships with other user data', async () => {
      const friendWithUser = {
        id: 1,
        createdAt: now,
        otherUserId: 20,
        otherUsername: 'bob',
        otherDisplayName: 'Bob',
      };
      db.innerJoin.mockResolvedValue([friendWithUser]);
      const result = await repo.findFriends(10);
      expect(result).toEqual([friendWithUser]);
    });
  });

  describe('deleteById', () => {
    it('should delete and return the row', async () => {
      db.returning.mockResolvedValue([{ id: 1 }]);
      const result = await repo.deleteById(1);
      expect(result).toEqual({ id: 1 });
    });

    it('should return null when not found', async () => {
      db.returning.mockResolvedValue([]);
      const result = await repo.deleteById(999);
      expect(result).toBeNull();
    });
  });

  describe('deleteBetweenUsers', () => {
    it('should delete and return the row', async () => {
      db.returning.mockResolvedValue([{ id: 1 }]);
      const result = await repo.deleteBetweenUsers(10, 20);
      expect(result).toEqual({ id: 1 });
      expect(db.delete).toHaveBeenCalled();
    });

    it('should return null when no friendship exists', async () => {
      db.returning.mockResolvedValue([]);
      const result = await repo.deleteBetweenUsers(10, 99);
      expect(result).toBeNull();
    });
  });

  describe('areFriends', () => {
    it('should return true when friendship exists', async () => {
      db.limit.mockResolvedValue([{ id: 1 }]);
      const result = await repo.areFriends(10, 20);
      expect(result).toBe(true);
    });

    it('should return false when no friendship exists', async () => {
      db.limit.mockResolvedValue([]);
      const result = await repo.areFriends(10, 20);
      expect(result).toBe(false);
    });
  });

  describe('findFriendIds', () => {
    it('should return array of friend user IDs', async () => {
      db.where.mockResolvedValue([
        { userId1: 10, userId2: 20 },
        { userId1: 30, userId2: 10 },
      ]);
      const result = await repo.findFriendIds(10);
      expect(result).toEqual([20, 30]);
    });
  });
});
