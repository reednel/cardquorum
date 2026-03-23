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
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
  } as any;
}

describe('FriendshipRepository', () => {
  let repo: FriendshipRepository;
  let db: ReturnType<typeof createMockDb>;

  const now = new Date();
  const friendship = {
    id: 1,
    requesterId: 10,
    addresseeId: 20,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  };

  beforeEach(() => {
    db = createMockDb();
    repo = new FriendshipRepository(db);
  });

  describe('create', () => {
    it('should insert a pending friendship and return it', async () => {
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
    it('should return accepted friendships with user data', async () => {
      const friendWithUser = {
        ...friendship,
        status: 'accepted',
        otherUserId: 20,
        otherUsername: 'bob',
        otherDisplayName: 'Bob',
      };
      db.where.mockResolvedValue([friendWithUser]);
      const result = await repo.findFriends(10);
      expect(result).toEqual([friendWithUser, friendWithUser]);
    });
  });

  describe('findIncomingRequests', () => {
    it('should return pending friendships addressed to user', async () => {
      const request = {
        ...friendship,
        otherUserId: 10,
        otherUsername: 'alice',
        otherDisplayName: 'Alice',
      };
      db.where.mockResolvedValue([request]);
      const result = await repo.findIncomingRequests(20);
      expect(result).toEqual([request]);
    });
  });

  describe('findOutgoingRequests', () => {
    it('should return pending friendships sent by user', async () => {
      const request = {
        ...friendship,
        otherUserId: 20,
        otherUsername: 'bob',
        otherDisplayName: 'Bob',
      };
      db.where.mockResolvedValue([request]);
      const result = await repo.findOutgoingRequests(10);
      expect(result).toEqual([request]);
    });
  });

  describe('accept', () => {
    it('should update status to accepted and return the row', async () => {
      const accepted = { ...friendship, status: 'accepted' };
      db.returning.mockResolvedValue([accepted]);
      const result = await repo.accept(1);
      expect(result).toBe(accepted);
      expect(db.update).toHaveBeenCalled();
    });

    it('should return null when friendship not found', async () => {
      db.returning.mockResolvedValue([]);
      const result = await repo.accept(999);
      expect(result).toBeNull();
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

  describe('areFriends', () => {
    it('should return true when accepted friendship exists', async () => {
      db.limit.mockResolvedValue([{ ...friendship, status: 'accepted' }]);
      const result = await repo.areFriends(10, 20);
      expect(result).toBe(true);
    });

    it('should return false when no accepted friendship exists', async () => {
      db.limit.mockResolvedValue([]);
      const result = await repo.areFriends(10, 20);
      expect(result).toBe(false);
    });
  });

  describe('findFriendIds', () => {
    it('should return array of friend user IDs', async () => {
      db.where.mockResolvedValue([
        { requesterId: 10, addresseeId: 20 },
        { requesterId: 30, addresseeId: 10 },
      ]);
      const result = await repo.findFriendIds(10);
      expect(result).toEqual([20, 30]);
    });
  });
});
