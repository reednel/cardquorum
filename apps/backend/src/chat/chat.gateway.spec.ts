import { ChatGateway } from './chat.gateway';
import { RoomService } from '../room/room.service';
import { ChatService } from './chat.service';
import { WS_EMIT } from '@cardquorum/shared';

describe('ChatGateway', () => {
  let gateway: ChatGateway;
  let roomService: jest.Mocked<RoomService>;
  let chatService: jest.Mocked<ChatService>;

  const createMockClient = () => ({ send: jest.fn() });

  beforeEach(() => {
    const { RoomManager } = jest.requireActual('@cardquorum/engine');
    roomService = {
      manager: new RoomManager(),
      ensureRoomExists: jest.fn().mockResolvedValue(undefined),
    } as any;

    chatService = {
      saveMessage: jest.fn(),
      getRecentMessages: jest.fn().mockResolvedValue([]),
    } as any;

    gateway = new ChatGateway(roomService, chatService);
  });

  describe('handleConnection / handleDisconnect', () => {
    it('should track and clean up clients', () => {
      const client = createMockClient();
      gateway.handleConnection(client);

      // Client is tracked — join a room to verify
      gateway.handleJoinRoom(client, { roomId: 'r1', nickname: 'Alice' });

      gateway.handleDisconnect(client);
      // After disconnect, the room should be empty
      expect(roomService.manager.getRoomMembers('r1')).toEqual([]);
    });
  });

  describe('handleJoinRoom', () => {
    it('should ensure room exists in DB and send joined + history', async () => {
      const client = createMockClient();
      gateway.handleConnection(client);

      await gateway.handleJoinRoom(client, { roomId: 'r1', nickname: 'Alice' });

      expect(roomService.ensureRoomExists).toHaveBeenCalledWith('r1');
      expect(chatService.getRecentMessages).toHaveBeenCalledWith('r1');

      // Should have sent room:joined and message:history
      expect(client.send).toHaveBeenCalledTimes(2);
      const calls = client.send.mock.calls.map((c: any) => JSON.parse(c[0]).event);
      expect(calls).toContain(WS_EMIT.ROOM_JOINED);
      expect(calls).toContain(WS_EMIT.MESSAGE_HISTORY);
    });
  });

  describe('handleLeaveRoom', () => {
    it('should remove member and broadcast departure', async () => {
      const client1 = createMockClient();
      const client2 = createMockClient();
      gateway.handleConnection(client1);
      gateway.handleConnection(client2);

      await gateway.handleJoinRoom(client1, { roomId: 'r1', nickname: 'Alice' });
      await gateway.handleJoinRoom(client2, { roomId: 'r1', nickname: 'Bob' });

      client2.send.mockClear();
      gateway.handleLeaveRoom(client1, { roomId: 'r1' });

      // Bob should get a member:left broadcast
      const lastCall = client2.send.mock.calls[0];
      const parsed = JSON.parse(lastCall[0]);
      expect(parsed.event).toBe(WS_EMIT.MEMBER_LEFT);
    });
  });

  describe('handleChatSend', () => {
    it('should reject if not in a room', async () => {
      const client = createMockClient();
      gateway.handleConnection(client);

      await gateway.handleChatSend(client, { roomId: 'r1', content: 'test' });

      const parsed = JSON.parse(client.send.mock.calls[0][0]);
      expect(parsed.event).toBe(WS_EMIT.ERROR);
    });

    it('should persist message and broadcast to room', async () => {
      const client1 = createMockClient();
      const client2 = createMockClient();
      gateway.handleConnection(client1);
      gateway.handleConnection(client2);

      await gateway.handleJoinRoom(client1, { roomId: 'r1', nickname: 'Alice' });
      await gateway.handleJoinRoom(client2, { roomId: 'r1', nickname: 'Bob' });

      const mockMsg = {
        id: 'msg-1',
        roomId: 'r1',
        senderUserId: 'u1',
        senderNickname: 'Alice',
        content: 'Hello',
        sentAt: '2026-03-02T12:00:00.000Z',
      };
      chatService.saveMessage.mockResolvedValue(mockMsg);

      client1.send.mockClear();
      client2.send.mockClear();
      await gateway.handleChatSend(client1, { roomId: 'r1', content: 'Hello' });

      expect(chatService.saveMessage).toHaveBeenCalled();

      // Both clients should receive the broadcast
      for (const client of [client1, client2]) {
        const parsed = JSON.parse(client.send.mock.calls[0][0]);
        expect(parsed.event).toBe(WS_EMIT.CHAT_MESSAGE);
        expect(parsed.data.content).toBe('Hello');
      }
    });
  });

  describe('disconnect cleanup', () => {
    it('should broadcast departures to remaining room members', async () => {
      const client1 = createMockClient();
      const client2 = createMockClient();
      gateway.handleConnection(client1);
      gateway.handleConnection(client2);

      await gateway.handleJoinRoom(client1, { roomId: 'r1', nickname: 'Alice' });
      await gateway.handleJoinRoom(client2, { roomId: 'r1', nickname: 'Bob' });

      client2.send.mockClear();
      gateway.handleDisconnect(client1);

      const parsed = JSON.parse(client2.send.mock.calls[0][0]);
      expect(parsed.event).toBe(WS_EMIT.MEMBER_LEFT);
      expect(parsed.data.member.nickname).toBe('Alice');
    });
  });
});
