import { UserRepository } from './user.repository';

function createMockDb() {
  return {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn(),
    insert: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    returning: jest.fn(),
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
  } as any;
}

describe('UserRepository', () => {
  let repo: UserRepository;
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
    repo = new UserRepository(db);
  });

  describe('findById', () => {
    it('should return the user when found', async () => {
      const user = { id: 1, username: 'alice', displayName: 'Alice' };
      db.limit.mockResolvedValue([user]);

      const result = await repo.findById(1);

      expect(result).toBe(user);
      expect(db.select).toHaveBeenCalled();
    });

    it('should return null when not found', async () => {
      db.limit.mockResolvedValue([]);

      const result = await repo.findById(999);

      expect(result).toBeNull();
    });
  });

  describe('findByUsername', () => {
    it('should return the user when found', async () => {
      const user = { id: 1, username: 'alice', displayName: 'Alice' };
      db.limit.mockResolvedValue([user]);

      const result = await repo.findByUsername('alice');

      expect(result).toBe(user);
    });

    it('should return null when not found', async () => {
      db.limit.mockResolvedValue([]);

      const result = await repo.findByUsername('missing');

      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('should insert and return the new user', async () => {
      const user = { id: 1, username: 'alice', displayName: 'Alice' };
      db.returning.mockResolvedValue([user]);

      const result = await repo.create({ username: 'alice', displayName: 'Alice' });

      expect(result).toBe(user);
      expect(db.insert).toHaveBeenCalled();
    });
  });

  describe('updateDisplayName', () => {
    it('should update and return the user', async () => {
      const updated = {
        id: 1,
        username: 'alice',
        displayName: 'Alicia',
        email: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      db.returning.mockResolvedValue([updated]);

      const result = await repo.updateDisplayName(1, 'Alicia');

      expect(result).toBe(updated);
      expect(db.update).toHaveBeenCalled();
      expect(db.set).toHaveBeenCalled();
    });

    it('should return null when user not found', async () => {
      db.returning.mockResolvedValue([]);

      const result = await repo.updateDisplayName(999, 'Nobody');

      expect(result).toBeNull();
    });
  });

  describe('searchByUsername', () => {
    it('should return matching users up to limit', async () => {
      const results = [{ id: 1, username: 'alice', displayName: 'Alice' }];
      db.limit.mockResolvedValue(results);

      const result = await repo.searchByUsername('ali', 99, 20);

      expect(result).toEqual(results);
      expect(db.select).toHaveBeenCalled();
    });

    it('should return empty array when no matches', async () => {
      db.limit.mockResolvedValue([]);

      const result = await repo.searchByUsername('zzz', 1, 20);

      expect(result).toEqual([]);
    });
  });
});
