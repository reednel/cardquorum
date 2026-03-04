import { ChatService } from './chat.service';
import { MessageRepository } from '@cardquorum/api';

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
        id: 'msg-1',
        roomId: 'room-1',
        senderUserId: 'u1',
        senderNickname: 'Alice',
        content: 'Hello',
        sentAt: '2026-03-02T12:00:00.000Z',
      };
      mockRepo.insert.mockResolvedValue(payload);

      const result = await service.saveMessage('room-1', 'u1', 'Alice', 'Hello');

      expect(result).toEqual(payload);
      expect(mockRepo.insert).toHaveBeenCalledWith('room-1', 'u1', 'Alice', 'Hello');
    });
  });

  describe('getRecentMessages', () => {
    it('should delegate to MessageRepository.findByRoomId', async () => {
      const messages = [
        {
          id: 'msg-1',
          roomId: 'room-1',
          senderUserId: 'u1',
          senderNickname: 'Alice',
          content: 'Hello',
          sentAt: '2026-03-02T12:00:00.000Z',
        },
      ];
      mockRepo.findByRoomId.mockResolvedValue(messages);

      const result = await service.getRecentMessages('room-1');

      expect(result).toEqual(messages);
      expect(mockRepo.findByRoomId).toHaveBeenCalledWith('room-1', 50);
    });

    it('should pass custom limit', async () => {
      mockRepo.findByRoomId.mockResolvedValue([]);

      await service.getRecentMessages('room-1', 10);

      expect(mockRepo.findByRoomId).toHaveBeenCalledWith('room-1', 10);
    });
  });
});
