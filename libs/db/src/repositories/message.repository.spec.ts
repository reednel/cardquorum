import { MessageRepository } from './message.repository';

function createMockDb() {
  return {
    insert: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    returning: jest.fn(),
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn(),
  } as any;
}

describe('MessageRepository', () => {
  let repo: MessageRepository;
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
    repo = new MessageRepository(db);
  });

  describe('insert', () => {
    it('should insert and return a ChatMessagePayload', async () => {
      const now = new Date('2026-03-02T12:00:00Z');
      db.returning.mockResolvedValue([
        {
          id: 1,
          roomId: 1,
          senderUserId: 1,
          senderDisplayName: 'Alice',
          content: 'Hello',
          sentAt: now,
        },
      ]);

      const result = await repo.insert(1, 1, 'Alice', 'Hello');

      expect(result).toEqual({
        id: 1,
        roomId: 1,
        senderUserId: 1,
        senderDisplayName: 'Alice',
        content: 'Hello',
        sentAt: '2026-03-02T12:00:00.000Z',
      });
      expect(db.insert).toHaveBeenCalled();
    });
  });

  describe('findByRoomId', () => {
    it('should return messages in chronological order', async () => {
      const rows = [
        {
          id: 2,
          roomId: 1,
          senderUserId: 2,
          senderDisplayName: 'Bob',
          content: 'Hi',
          sentAt: new Date('2026-03-02T12:01:00Z'),
        },
        {
          id: 1,
          roomId: 1,
          senderUserId: 1,
          senderDisplayName: 'Alice',
          content: 'Hello',
          sentAt: new Date('2026-03-02T12:00:00Z'),
        },
      ];
      db.limit.mockResolvedValue(rows);

      const result = await repo.findByRoomId(1);

      expect(result[0].id).toBe(1);
      expect(result[1].id).toBe(2);
      expect(result[0].sentAt).toBe('2026-03-02T12:00:00.000Z');
    });

    it('should use custom limit when provided', async () => {
      db.limit.mockResolvedValue([]);

      await repo.findByRoomId(1, 10);

      expect(db.limit).toHaveBeenCalledWith(10);
    });
  });
});
