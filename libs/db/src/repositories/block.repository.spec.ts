import { BlockRepository } from './block.repository';

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

describe('BlockRepository', () => {
  let repo: BlockRepository;
  let db: ReturnType<typeof createMockDb>;

  const now = new Date();
  const block = { id: 1, blockerId: 10, blockedId: 20, createdAt: now };

  beforeEach(() => {
    db = createMockDb();
    repo = new BlockRepository(db);
  });

  describe('create', () => {
    it('should insert a block and return it', async () => {
      db.returning.mockResolvedValue([block]);
      const result = await repo.create(10, 20);
      expect(result).toBe(block);
      expect(db.insert).toHaveBeenCalled();
    });
  });

  describe('deleteByBlockerAndBlocked', () => {
    it('should delete and return the row', async () => {
      db.returning.mockResolvedValue([{ id: 1 }]);
      const result = await repo.deleteByBlockerAndBlocked(10, 20);
      expect(result).toEqual({ id: 1 });
    });

    it('should return null when not found', async () => {
      db.returning.mockResolvedValue([]);
      const result = await repo.deleteByBlockerAndBlocked(10, 99);
      expect(result).toBeNull();
    });
  });

  describe('findByBlocker', () => {
    it('should return blocked users with user data', async () => {
      const blockedWithUser = {
        id: 1,
        blockedId: 20,
        createdAt: now,
        blockedUsername: 'bob',
        blockedDisplayName: 'Bob',
      };
      db.where.mockResolvedValue([blockedWithUser]);
      const result = await repo.findByBlocker(10);
      expect(result).toEqual([blockedWithUser]);
    });
  });

  describe('findBlockedIds', () => {
    it('should return array of blocked user IDs', async () => {
      db.where.mockResolvedValue([{ blockedId: 20 }, { blockedId: 30 }]);
      const result = await repo.findBlockedIds(10);
      expect(result).toEqual([20, 30]);
    });

    it('should return empty array when no blocks exist', async () => {
      db.where.mockResolvedValue([]);
      const result = await repo.findBlockedIds(10);
      expect(result).toEqual([]);
    });
  });

  describe('isBlocked', () => {
    it('should return true when block exists', async () => {
      db.limit.mockResolvedValue([block]);
      const result = await repo.isBlocked(10, 20);
      expect(result).toBe(true);
    });

    it('should return false when block does not exist', async () => {
      db.limit.mockResolvedValue([]);
      const result = await repo.isBlocked(10, 20);
      expect(result).toBe(false);
    });
  });
});
