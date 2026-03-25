import { CredentialRepository } from './credential.repository';

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
    onConflictDoUpdate: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
  } as any;
}

describe('CredentialRepository', () => {
  let repo: CredentialRepository;
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
    repo = new CredentialRepository(db);
  });

  describe('findCredentialByUserId', () => {
    it('should return credential when found', async () => {
      db.limit.mockResolvedValue([{ credential: 'hashed-pw' }]);

      const result = await repo.findCredentialByUserId(1, 'basic');

      expect(result).toBe('hashed-pw');
    });

    it('should return null when not found', async () => {
      db.limit.mockResolvedValue([]);

      const result = await repo.findCredentialByUserId(1, 'basic');

      expect(result).toBeNull();
    });
  });

  describe('findUserByCredential', () => {
    it('should return user when found', async () => {
      const user = { id: 1, username: 'alice', displayName: 'Alice' };
      db.limit.mockResolvedValue([user]);

      const result = await repo.findUserByCredential('oidc', 'oidc-sub-123');

      expect(result).toBe(user);
    });

    it('should return null when not found', async () => {
      db.limit.mockResolvedValue([]);

      const result = await repo.findUserByCredential('oidc', 'missing');

      expect(result).toBeNull();
    });

    it('should filter out deleted users (deletedAt check in query)', async () => {
      db.limit.mockResolvedValue([]);
      const result = await repo.findUserByCredential('oidc', 'deleted-user-sub');
      expect(result).toBeNull();
    });
  });

  describe('upsertCredential', () => {
    it('should insert or update and return the row', async () => {
      const cred = { id: 1, userId: 1, method: 'basic', credential: 'hash' };
      db.returning.mockResolvedValue([cred]);

      const result = await repo.upsertCredential(1, 'basic', 'hash');

      expect(result).toBe(cred);
      expect(db.insert).toHaveBeenCalled();
    });
  });

  describe('findOrCreateUserByOidc', () => {
    it('should return existing user if found', async () => {
      const user = { id: 1, username: 'oidc-123', displayName: 'Alice' };
      db.limit.mockResolvedValue([user]);

      const result = await repo.findOrCreateUserByOidc('oidc-123', 'Alice');

      expect(result).toBe(user);
      expect(db.insert).not.toHaveBeenCalled();
    });

    it('should create user and credential if not found', async () => {
      db.limit.mockResolvedValue([]);
      const newUser = { id: 2, username: 'oidc-456', displayName: 'Bob' };
      db.returning.mockResolvedValue([newUser]);

      const result = await repo.findOrCreateUserByOidc('oidc-456', 'Bob');

      expect(result).toBe(newUser);
      expect(db.insert).toHaveBeenCalled();
    });
  });

  describe('deleteAllByUserId', () => {
    it('should delete all credentials for user', async () => {
      db.where.mockResolvedValue(undefined);

      await repo.deleteAllByUserId(42);

      expect(db.delete).toHaveBeenCalled();
      expect(db.where).toHaveBeenCalled();
    });
  });
});
