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
      const row = { id: 'abc123', userId: 1, authMethod: 'basic', expiresAt: new Date() };
      db.returning.mockResolvedValue([row]);

      const result = await repo.create('abc123', 1, 'basic');
      expect(result).toEqual(row);
      expect(db.insert).toHaveBeenCalled();
    });

    it('should pass authMethod to the insert', async () => {
      const row = { id: 'abc123', userId: 1, authMethod: 'oidc', expiresAt: new Date() };
      db.returning.mockResolvedValue([row]);

      await repo.create('abc123', 1, 'oidc');
      expect(db.values).toHaveBeenCalledWith(expect.objectContaining({ authMethod: 'oidc' }));
    });

    it('should pass oidcSid to the insert when provided', async () => {
      const row = {
        id: 'abc123',
        userId: 1,
        authMethod: 'oidc',
        oidcSid: 'idp-sid-xyz',
        expiresAt: new Date(),
      };
      db.returning.mockResolvedValue([row]);

      await repo.create('abc123', 1, 'oidc', 'idp-sid-xyz');
      expect(db.values).toHaveBeenCalledWith(
        expect.objectContaining({ authMethod: 'oidc', oidcSid: 'idp-sid-xyz' }),
      );
    });

    it('should omit oidcSid from insert when not provided', async () => {
      const row = { id: 'abc123', userId: 1, authMethod: 'basic', expiresAt: new Date() };
      db.returning.mockResolvedValue([row]);

      await repo.create('abc123', 1, 'basic');
      expect(db.values).toHaveBeenCalledWith(
        expect.not.objectContaining({ oidcSid: expect.anything() }),
      );
    });
  });

  describe('findValidSession', () => {
    it('should return user identity with authMethod and createdAt for a valid session', async () => {
      const createdAt = new Date('2026-01-01');
      db.limit.mockResolvedValue([
        { userId: 1, displayName: 'Alice', authMethod: 'basic', createdAt },
      ]);

      const result = await repo.findValidSession('abc123');
      expect(result).toEqual({ userId: 1, displayName: 'Alice', authMethod: 'basic', createdAt });
    });

    it('should return null when session not found', async () => {
      db.limit.mockResolvedValue([]);

      const result = await repo.findValidSession('nonexistent');
      expect(result).toBeNull();
    });

    it('should return null when user is soft-deleted', async () => {
      db.limit.mockResolvedValue([]);

      const result = await repo.findValidSession('valid-session-id');
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

  describe('deleteByOidcSid', () => {
    it('should delete sessions matching the given IdP session ID', async () => {
      db.returning.mockResolvedValue([{ id: 'session-abc' }]);

      const result = await repo.deleteByOidcSid('idp-sid-xyz');
      expect(result).toEqual([{ id: 'session-abc' }]);
      expect(db.delete).toHaveBeenCalled();
    });

    it('should return an empty array when no session matches the IdP session ID', async () => {
      db.returning.mockResolvedValue([]);

      const result = await repo.deleteByOidcSid('unknown-sid');
      expect(result).toEqual([]);
    });
  });
});
