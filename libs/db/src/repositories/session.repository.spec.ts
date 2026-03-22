import { SessionRepository } from './session.repository';

function createMockDb() {
  return {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    limit: jest.fn(),
    insert: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    returning: jest.fn(),
    delete: jest.fn().mockReturnThis(),
  } as any;
}

describe('SessionRepository', () => {
  let repo: SessionRepository;
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
    repo = new SessionRepository(db);
  });

  describe('create', () => {
    it('should insert a session and return the row', async () => {
      const row = { id: 'abc123', userId: 1, expiresAt: new Date() };
      db.returning.mockResolvedValue([row]);

      const result = await repo.create('abc123', 1);
      expect(result).toEqual(row);
      expect(db.insert).toHaveBeenCalled();
    });
  });

  describe('findValidSession', () => {
    it('should return user identity for a valid session', async () => {
      db.limit.mockResolvedValue([{ userId: 1, displayName: 'Alice' }]);

      const result = await repo.findValidSession('abc123');
      expect(result).toEqual({ userId: 1, displayName: 'Alice' });
    });

    it('should return null when session not found', async () => {
      db.limit.mockResolvedValue([]);

      const result = await repo.findValidSession('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('deleteById', () => {
    it('should delete the session', async () => {
      db.returning.mockResolvedValue([{ id: 'abc123' }]);

      const result = await repo.deleteById('abc123');
      expect(result).toEqual({ id: 'abc123' });
      expect(db.delete).toHaveBeenCalled();
    });
  });

  describe('deleteAllByUserId', () => {
    it('should delete all sessions for a user', async () => {
      db.returning.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);

      const result = await repo.deleteAllByUserId(1);
      expect(result).toHaveLength(2);
    });
  });
});
