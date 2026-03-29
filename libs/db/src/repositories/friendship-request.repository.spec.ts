import { FriendshipRequestRepository } from './friendship-request.repository';

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

describe('FriendshipRequestRepository', () => {
  let repo: FriendshipRequestRepository;
  let db: ReturnType<typeof createMockDb>;

  const now = new Date();
  const friendshipRequest = {
    id: 1,
    requesterId: 10,
    addresseeId: 20,
    createdAt: now,
  };

  beforeEach(() => {
    db = createMockDb();
    repo = new FriendshipRequestRepository(db);
  });

  describe('create', () => {
    it('should insert a friendship request and return it', async () => {
      db.returning.mockResolvedValue([friendshipRequest]);
      const result = await repo.create(10, 20);
      expect(result).toBe(friendshipRequest);
      expect(db.insert).toHaveBeenCalled();
    });
  });

  describe('findById', () => {
    it('should return the request when found', async () => {
      db.limit.mockResolvedValue([friendshipRequest]);
      const result = await repo.findById(1);
      expect(result).toBe(friendshipRequest);
    });

    it('should return null when not found', async () => {
      db.limit.mockResolvedValue([]);
      const result = await repo.findById(999);
      expect(result).toBeNull();
    });
  });

  describe('findBetweenUsers', () => {
    it('should return the request between two users', async () => {
      db.limit.mockResolvedValue([friendshipRequest]);
      const result = await repo.findBetweenUsers(10, 20);
      expect(result).toBe(friendshipRequest);
    });

    it('should return null when no request exists', async () => {
      db.limit.mockResolvedValue([]);
      const result = await repo.findBetweenUsers(10, 99);
      expect(result).toBeNull();
    });
  });

  describe('findIncomingRequests', () => {
    it('should return requests addressed to user', async () => {
      const request = {
        ...friendshipRequest,
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
    it('should return requests sent by user', async () => {
      const request = {
        ...friendshipRequest,
        otherUserId: 20,
        otherUsername: 'bob',
        otherDisplayName: 'Bob',
      };
      db.where.mockResolvedValue([request]);
      const result = await repo.findOutgoingRequests(10);
      expect(result).toEqual([request]);
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
});
