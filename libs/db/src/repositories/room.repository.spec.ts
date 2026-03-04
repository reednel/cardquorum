import { RoomRepository } from './room.repository';

function createMockDb() {
  return {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn(),
    insert: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    returning: jest.fn(),
  } as any;
}

describe('RoomRepository', () => {
  let repo: RoomRepository;
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
    repo = new RoomRepository(db);
  });

  describe('findById', () => {
    it('should return the room when found', async () => {
      const room = { id: 1, name: 'Room 1', createdAt: new Date() };
      db.limit.mockResolvedValue([room]);

      const result = await repo.findById(1);

      expect(result).toBe(room);
      expect(db.select).toHaveBeenCalled();
    });

    it('should return null when not found', async () => {
      db.limit.mockResolvedValue([]);

      const result = await repo.findById(999);

      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('should insert and return the new room', async () => {
      const room = { id: 1, name: 'Test', createdAt: new Date() };
      db.returning.mockResolvedValue([room]);

      const result = await repo.create('Test');

      expect(result).toBe(room);
      expect(db.insert).toHaveBeenCalled();
    });
  });
});
