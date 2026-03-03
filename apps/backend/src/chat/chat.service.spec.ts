import { ChatService } from './chat.service';

describe('ChatService', () => {
  let service: ChatService;
  let mockDb: any;

  beforeEach(() => {
    mockDb = {
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      returning: jest.fn(),
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn(),
    };
    service = new ChatService(mockDb);
  });

  describe('saveMessage', () => {
    it('should insert and return a ChatMessagePayload', async () => {
      const now = new Date('2026-03-02T12:00:00Z');
      mockDb.returning.mockResolvedValue([
        {
          id: 'msg-1',
          roomId: 'room-1',
          senderUserId: 'u1',
          senderNickname: 'Alice',
          content: 'Hello',
          sentAt: now,
        },
      ]);

      const result = await service.saveMessage('room-1', 'u1', 'Alice', 'Hello');

      expect(result).toEqual({
        id: 'msg-1',
        roomId: 'room-1',
        senderUserId: 'u1',
        senderNickname: 'Alice',
        content: 'Hello',
        sentAt: '2026-03-02T12:00:00.000Z',
      });
      expect(mockDb.insert).toHaveBeenCalled();
    });
  });

  describe('getRecentMessages', () => {
    it('should return messages in chronological order', async () => {
      const rows = [
        {
          id: 'msg-2',
          roomId: 'room-1',
          senderUserId: 'u2',
          senderNickname: 'Bob',
          content: 'Hi',
          sentAt: new Date('2026-03-02T12:01:00Z'),
        },
        {
          id: 'msg-1',
          roomId: 'room-1',
          senderUserId: 'u1',
          senderNickname: 'Alice',
          content: 'Hello',
          sentAt: new Date('2026-03-02T12:00:00Z'),
        },
      ];
      mockDb.limit.mockResolvedValue(rows);

      const result = await service.getRecentMessages('room-1');

      // Should be reversed to chronological order
      expect(result[0].id).toBe('msg-1');
      expect(result[1].id).toBe('msg-2');
      expect(result[0].sentAt).toBe('2026-03-02T12:00:00.000Z');
    });
  });
});
