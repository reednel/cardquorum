import { RoomRepository } from './room.repository';

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

describe('RoomRepository', () => {
  let repo: RoomRepository;
  let db: ReturnType<typeof createMockDb>;

  const now = new Date();
  const room = {
    id: 1,
    name: 'Room 1',
    ownerId: 10,
    ownerDisplayName: 'Alice',
    visibility: 'public',
    createdAt: now,
    updatedAt: now,
  };

  beforeEach(() => {
    db = createMockDb();
    repo = new RoomRepository(db);
  });

  describe('findById', () => {
    it('should return the room when found', async () => {
      db.limit.mockResolvedValue([room]);

      const result = await repo.findById(1);

      expect(result).toBe(room);
      expect(db.select).toHaveBeenCalled();
      expect(db.innerJoin).toHaveBeenCalled();
    });

    it('should return null when not found', async () => {
      db.limit.mockResolvedValue([]);

      const result = await repo.findById(999);

      expect(result).toBeNull();
    });
  });

  describe('findAll', () => {
    it('should return all rooms when no visibility filter', async () => {
      db.innerJoin.mockResolvedValue([room]);

      const result = await repo.findAll();

      expect(result).toEqual([room]);
      expect(db.select).toHaveBeenCalled();
    });

    it('should filter by visibility when provided', async () => {
      db.where.mockResolvedValue([room]);

      const result = await repo.findAll('public');

      expect(result).toEqual([room]);
      expect(db.where).toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('should insert with ownerId and return the new room', async () => {
      const created = {
        id: 1,
        name: 'Test',
        ownerId: 10,
        visibility: 'public',
        createdAt: now,
        updatedAt: now,
      };
      db.returning.mockResolvedValue([created]);

      const result = await repo.create('Test', 10);

      expect(result).toBe(created);
      expect(db.insert).toHaveBeenCalled();
    });

    it('should pass visibility when provided', async () => {
      const created = {
        id: 1,
        name: 'Private',
        ownerId: 10,
        visibility: 'invite-only',
        createdAt: now,
        updatedAt: now,
      };
      db.returning.mockResolvedValue([created]);

      const result = await repo.create('Private', 10, 'invite-only');

      expect(result).toBe(created);
    });
  });

  describe('update', () => {
    it('should update and return the room', async () => {
      const updated = { ...room, name: 'Updated' };
      db.returning.mockResolvedValue([updated]);

      const result = await repo.update(1, { name: 'Updated' });

      expect(result).toBe(updated);
      expect(db.update).toHaveBeenCalled();
      expect(db.set).toHaveBeenCalled();
    });

    it('should return null when room not found', async () => {
      db.returning.mockResolvedValue([]);

      const result = await repo.update(999, { name: 'Nope' });

      expect(result).toBeNull();
    });
  });

  describe('delete', () => {
    it('should delete and return the id', async () => {
      db.returning.mockResolvedValue([{ id: 1 }]);

      const result = await repo.delete(1);

      expect(result).toEqual({ id: 1 });
      expect(db.delete).toHaveBeenCalled();
    });

    it('should return null when room not found', async () => {
      db.returning.mockResolvedValue([]);

      const result = await repo.delete(999);

      expect(result).toBeNull();
    });
  });

  describe('findIdsByOwner', () => {
    it('should return room IDs owned by user', async () => {
      db.from.mockReturnValue({ where: db.where });
      db.where.mockResolvedValue([{ id: 10 }, { id: 20 }]);

      const result = await repo.findIdsByOwner(1);

      expect(result).toEqual([10, 20]);
    });

    it('should return empty array when user owns no rooms', async () => {
      db.from.mockReturnValue({ where: db.where });
      db.where.mockResolvedValue([]);

      const result = await repo.findIdsByOwner(999);

      expect(result).toEqual([]);
    });
  });

  describe('deleteByOwner', () => {
    it('should delete all rooms owned by user', async () => {
      db.returning.mockResolvedValue([{ id: 10 }, { id: 20 }]);

      const result = await repo.deleteByOwner(1);

      expect(db.delete).toHaveBeenCalled();
      expect(result).toEqual([{ id: 10 }, { id: 20 }]);
    });
  });
});
