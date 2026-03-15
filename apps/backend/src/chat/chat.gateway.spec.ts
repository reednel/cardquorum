import { IncomingMessage } from 'http';
import { Socket } from 'net';
import { UserIdentity, WS_EMIT } from '@cardquorum/shared';
import { WsAuthGuard } from '../auth/ws-auth.guard';
import { RoomService } from '../room/room.service';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';

function createMockRequest(token?: string): IncomingMessage {
  const socket = new Socket();
  const req = new IncomingMessage(socket);
  req.url = token ? `/ws?token=${token}` : '/ws';
  return req;
}

describe('ChatGateway', () => {
  let gateway: ChatGateway;
  let wsAuthGuard: jest.Mocked<WsAuthGuard>;
  let roomService: jest.Mocked<RoomService>;
  let chatService: jest.Mocked<ChatService>;

  const aliceIdentity: UserIdentity = { userId: 1, displayName: 'Alice' };
  const bobIdentity: UserIdentity = { userId: 2, displayName: 'Bob' };

  const createMockClient = () => ({ send: jest.fn(), close: jest.fn() });

  beforeEach(() => {
    const { RoomManager } = jest.requireActual('@cardquorum/engine');

    wsAuthGuard = {
      authenticate: jest.fn(),
    } as any;

    roomService = {
      manager: new RoomManager(),
      roomExists: jest.fn().mockResolvedValue(true),
    } as any;

    chatService = {
      saveMessage: jest.fn(),
      getRecentMessages: jest.fn().mockResolvedValue([]),
    } as any;

    gateway = new ChatGateway(wsAuthGuard, roomService, chatService);
  });

  describe('handleConnection', () => {
    it('should reject connections without a valid token', async () => {
      wsAuthGuard.authenticate.mockResolvedValue(null);
      const client = createMockClient();

      await gateway.handleConnection(client, createMockRequest());

      expect(client.close).toHaveBeenCalledWith(4001, 'Unauthorized');
    });

    it('should accept connections with a valid token', async () => {
      wsAuthGuard.authenticate.mockResolvedValue(aliceIdentity);
      const client = createMockClient();

      await gateway.handleConnection(client, createMockRequest('valid-token'));

      expect(client.close).not.toHaveBeenCalled();
    });
  });

  describe('handleConnection / handleDisconnect', () => {
    it('should track and clean up clients', async () => {
      wsAuthGuard.authenticate.mockResolvedValue(aliceIdentity);
      const client = createMockClient();
      await gateway.handleConnection(client, createMockRequest('valid'));

      await gateway.handleJoinRoom(client, { roomId: 1 });

      gateway.handleDisconnect(client);
      expect(roomService.manager.getRoomMembers('1')).toEqual([]);
    });
  });

  describe('handleJoinRoom', () => {
    it('should check room exists and send joined + history', async () => {
      wsAuthGuard.authenticate.mockResolvedValue(aliceIdentity);
      const client = createMockClient();
      await gateway.handleConnection(client, createMockRequest('valid'));

      await gateway.handleJoinRoom(client, { roomId: 1 });

      expect(roomService.roomExists).toHaveBeenCalledWith(1);
      expect(chatService.getRecentMessages).toHaveBeenCalledWith(1);

      expect(client.send).toHaveBeenCalledTimes(2);
      const calls = client.send.mock.calls.map((c: any) => JSON.parse(c[0]).event);
      expect(calls).toContain(WS_EMIT.ROOM_JOINED);
      expect(calls).toContain(WS_EMIT.MESSAGE_HISTORY);
    });

    it('should send error if room does not exist', async () => {
      roomService.roomExists.mockResolvedValue(false);
      wsAuthGuard.authenticate.mockResolvedValue(aliceIdentity);
      const client = createMockClient();
      await gateway.handleConnection(client, createMockRequest('valid'));

      await gateway.handleJoinRoom(client, { roomId: 999 });

      const parsed = JSON.parse(client.send.mock.calls[0][0]);
      expect(parsed.event).toBe(WS_EMIT.ERROR);
      expect(parsed.data.message).toContain('999');
    });
  });

  describe('handleLeaveRoom', () => {
    it('should remove member and broadcast departure', async () => {
      wsAuthGuard.authenticate
        .mockResolvedValueOnce(aliceIdentity)
        .mockResolvedValueOnce(bobIdentity);

      const client1 = createMockClient();
      const client2 = createMockClient();
      await gateway.handleConnection(client1, createMockRequest('valid'));
      await gateway.handleConnection(client2, createMockRequest('valid'));

      await gateway.handleJoinRoom(client1, { roomId: 1 });
      await gateway.handleJoinRoom(client2, { roomId: 1 });

      client2.send.mockClear();
      gateway.handleLeaveRoom(client1, { roomId: 1 });

      const lastCall = client2.send.mock.calls[0];
      const parsed = JSON.parse(lastCall[0]);
      expect(parsed.event).toBe(WS_EMIT.MEMBER_LEFT);
    });
  });

  describe('handleChatSend', () => {
    it('should reject if not in a room', async () => {
      wsAuthGuard.authenticate.mockResolvedValue(aliceIdentity);
      const client = createMockClient();
      await gateway.handleConnection(client, createMockRequest('valid'));

      const unconnectedClient = createMockClient();
      await gateway.handleChatSend(unconnectedClient, { roomId: 1, content: 'test' });

      const parsed = JSON.parse(unconnectedClient.send.mock.calls[0][0]);
      expect(parsed.event).toBe(WS_EMIT.ERROR);
    });

    it('should persist message and broadcast to room', async () => {
      wsAuthGuard.authenticate
        .mockResolvedValueOnce(aliceIdentity)
        .mockResolvedValueOnce(bobIdentity);

      const client1 = createMockClient();
      const client2 = createMockClient();
      await gateway.handleConnection(client1, createMockRequest('valid'));
      await gateway.handleConnection(client2, createMockRequest('valid'));

      await gateway.handleJoinRoom(client1, { roomId: 1 });
      await gateway.handleJoinRoom(client2, { roomId: 1 });

      const mockMsg = {
        id: 1,
        roomId: 1,
        senderUserId: 1,
        senderDisplayName: 'Alice',
        content: 'Hello',
        sentAt: '2026-03-02T12:00:00.000Z',
      };
      chatService.saveMessage.mockResolvedValue(mockMsg);

      client1.send.mockClear();
      client2.send.mockClear();
      await gateway.handleChatSend(client1, { roomId: 1, content: 'Hello' });

      expect(chatService.saveMessage).toHaveBeenCalled();

      for (const client of [client1, client2]) {
        const parsed = JSON.parse(client.send.mock.calls[0][0]);
        expect(parsed.event).toBe(WS_EMIT.CHAT_MESSAGE);
        expect(parsed.data.content).toBe('Hello');
      }
    });
  });

  describe('disconnect cleanup', () => {
    it('should broadcast departures to remaining room members', async () => {
      wsAuthGuard.authenticate
        .mockResolvedValueOnce(aliceIdentity)
        .mockResolvedValueOnce(bobIdentity);

      const client1 = createMockClient();
      const client2 = createMockClient();
      await gateway.handleConnection(client1, createMockRequest('valid'));
      await gateway.handleConnection(client2, createMockRequest('valid'));

      await gateway.handleJoinRoom(client1, { roomId: 1 });
      await gateway.handleJoinRoom(client2, { roomId: 1 });

      client2.send.mockClear();
      gateway.handleDisconnect(client1);

      const parsed = JSON.parse(client2.send.mock.calls[0][0]);
      expect(parsed.event).toBe(WS_EMIT.MEMBER_LEFT);
      expect(parsed.data.member.displayName).toBe('Alice');
    });
  });
});
