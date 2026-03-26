import { WebSocket } from 'ws';
import { UserIdentity, WS_EMIT } from '@cardquorum/shared';
import { RoomService } from '../room/room.service';
import { WsConnectionService } from '../ws/ws-connection.service';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';

describe('ChatGateway', () => {
  let gateway: ChatGateway;
  let connectionService: WsConnectionService;
  let roomService: RoomService;
  let chatService: jest.Mocked<ChatService>;

  const aliceIdentity: UserIdentity = { userId: 1, username: 'alice', displayName: 'Alice' };
  const bobIdentity: UserIdentity = { userId: 2, username: 'bob', displayName: 'Bob' };

  const createMockClient = () => ({ send: jest.fn(), close: jest.fn() }) as unknown as WebSocket;

  beforeEach(() => {
    const { RoomManager } = jest.requireActual('@cardquorum/engine');

    connectionService = new WsConnectionService();
    roomService = { manager: new RoomManager(), broadcastToRoom: jest.fn() } as any;

    chatService = {
      saveMessage: jest.fn(),
      getRecentMessages: jest.fn().mockResolvedValue([]),
    } as any;

    gateway = new ChatGateway(connectionService, roomService, chatService);
  });

  describe('handleChatSend', () => {
    it('should silently return if not tracked', async () => {
      const unconnectedClient = createMockClient();
      await gateway.handleChatSend(unconnectedClient, { roomId: 1, content: 'test' });

      expect(chatService.saveMessage).not.toHaveBeenCalled();
      expect(unconnectedClient.send).not.toHaveBeenCalled();
    });

    it('should persist message and broadcast to room', async () => {
      const client = createMockClient();
      connectionService.trackClient(client, aliceIdentity);

      const mockMsg = {
        id: 1,
        roomId: 1,
        senderUserId: 1,
        senderDisplayName: 'Alice',
        content: 'Hello',
        sentAt: '2026-03-02T12:00:00.000Z',
      };
      chatService.saveMessage.mockResolvedValue(mockMsg);

      await gateway.handleChatSend(client, { roomId: 1, content: 'Hello' });

      expect(chatService.saveMessage).toHaveBeenCalledWith(1, 1, 'Alice', 'Hello');
      expect(roomService.broadcastToRoom).toHaveBeenCalledWith('1', WS_EMIT.CHAT_MESSAGE, mockMsg);
    });
  });
});
