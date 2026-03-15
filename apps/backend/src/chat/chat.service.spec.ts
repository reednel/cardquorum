import { MessageRepository } from '@cardquorum/db';
import { ChatService } from './chat.service';

describe('ChatService', () => {
  let service: ChatService;
  let mockRepo: jest.Mocked<Pick<MessageRepository, 'insert' | 'findByRoomId'>>;

  beforeEach(() => {
    mockRepo = {
      insert: jest.fn(),
      findByRoomId: jest.fn(),
    };
    service = new ChatService(mockRepo as unknown as MessageRepository);
  });

  describe('saveMessage', () => {
    it('should delegate to MessageRepository.insert', async () => {
      const payload = {
        id: 1,
        roomId: 1,
        senderUserId: 1,
        senderDisplayName: 'Alice',
        content: 'Hello',
        sentAt: '2026-03-02T12:00:00.000Z',
      };
      mockRepo.insert.mockResolvedValue(payload);

      const result = await service.saveMessage(1, 1, 'Alice', 'Hello');

      expect(result).toEqual(payload);
      expect(mockRepo.insert).toHaveBeenCalledWith(1, 1, 'Alice', 'Hello');
    });
  });

  describe('getRecentMessages', () => {
    it('should delegate to MessageRepository.findByRoomId', async () => {
      const messages = [
        {
          id: 1,
          roomId: 1,
          senderUserId: 1,
          senderDisplayName: 'Alice',
          content: 'Hello',
          sentAt: '2026-03-02T12:00:00.000Z',
        },
      ];
      mockRepo.findByRoomId.mockResolvedValue(messages);

      const result = await service.getRecentMessages(1);

      expect(result).toEqual(messages);
      expect(mockRepo.findByRoomId).toHaveBeenCalledWith(1, 50);
    });

    it('should pass custom limit', async () => {
      mockRepo.findByRoomId.mockResolvedValue([]);

      await service.getRecentMessages(1, 10);

      expect(mockRepo.findByRoomId).toHaveBeenCalledWith(1, 10);
    });
  });
});
