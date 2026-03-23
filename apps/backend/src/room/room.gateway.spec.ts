import { WebSocket } from 'ws';
import { MessageRepository } from '@cardquorum/db';
import { UserIdentity, WS_EMIT } from '@cardquorum/shared';
import { WsConnectionService } from '../ws/ws-connection.service';
import { RoomGateway } from './room.gateway';
import { RoomService } from './room.service';

describe('RoomGateway', () => {
  let gateway: RoomGateway;
  let connectionService: WsConnectionService;
  let roomService: RoomService;
  let messageRepo: jest.Mocked<Pick<MessageRepository, 'findByRoomId'>>;

  const aliceIdentity: UserIdentity = { userId: 1, displayName: 'Alice' };
  const bobIdentity: UserIdentity = { userId: 2, displayName: 'Bob' };

  const createMockClient = () => ({ send: jest.fn(), close: jest.fn() }) as unknown as WebSocket;

  beforeEach(() => {
    const { RoomManager } = jest.requireActual('@cardquorum/engine');

    connectionService = new WsConnectionService();

    const manager = new RoomManager();
    roomService = {
      manager,
      roomExists: jest.fn().mockResolvedValue(true),
      canAccessRoom: jest.fn().mockResolvedValue(true),
      broadcastToRoom: jest.fn(
        (roomId: string, event: string, data: unknown, excludeConnId?: string) => {
          const room = manager.getRoom(roomId);
          if (!room) return;
          const message = JSON.stringify({ event, data });
          for (const connId of room.members.keys()) {
            if (connId === excludeConnId) continue;
            const tracked = connectionService.getTrackedById(connId);
            if (tracked) tracked.ws.send(message);
          }
        },
      ),
    } as any;

    messageRepo = {
      findByRoomId: jest.fn().mockResolvedValue([]),
    };

    gateway = new RoomGateway(
      connectionService,
      roomService,
      messageRepo as unknown as MessageRepository,
    );
    gateway.onModuleInit();
  });

  describe('handleJoinRoom', () => {
    it('should check room exists and send joined + history', async () => {
      const client = createMockClient();
      connectionService.trackClient(client, aliceIdentity);

      await gateway.handleJoinRoom(client, { roomId: 1 });

      expect(roomService.roomExists).toHaveBeenCalledWith(1);
      expect(messageRepo.findByRoomId).toHaveBeenCalledWith(1);

      const mockSend = client.send as jest.Mock;
      expect(mockSend).toHaveBeenCalledTimes(2);
      const calls = mockSend.mock.calls.map((c: any) => JSON.parse(c[0]).event);
      expect(calls).toContain(WS_EMIT.ROOM_JOINED);
      expect(calls).toContain(WS_EMIT.MESSAGE_HISTORY);
    });

    it('should send error if room does not exist', async () => {
      (roomService.roomExists as jest.Mock).mockResolvedValue(false);
      const client = createMockClient();
      connectionService.trackClient(client, aliceIdentity);

      await gateway.handleJoinRoom(client, { roomId: 999 });

      const parsed = JSON.parse((client.send as jest.Mock).mock.calls[0][0]);
      expect(parsed.event).toBe(WS_EMIT.ERROR);
      expect(parsed.data.message).toBe('Room does not exist');
    });

    it('should broadcast member joined to other room members', async () => {
      const client1 = createMockClient();
      const client2 = createMockClient();
      connectionService.trackClient(client1, aliceIdentity);
      connectionService.trackClient(client2, bobIdentity);

      await gateway.handleJoinRoom(client1, { roomId: 1 });
      (client1.send as jest.Mock).mockClear();

      await gateway.handleJoinRoom(client2, { roomId: 1 });

      // client1 should get MEMBER_JOINED for Bob
      const calls = (client1.send as jest.Mock).mock.calls.map((c: any) => JSON.parse(c[0]).event);
      expect(calls).toContain(WS_EMIT.MEMBER_JOINED);
    });
  });

  describe('handleLeaveRoom', () => {
    it('should remove member and broadcast departure', async () => {
      const client1 = createMockClient();
      const client2 = createMockClient();
      connectionService.trackClient(client1, aliceIdentity);
      connectionService.trackClient(client2, bobIdentity);

      await gateway.handleJoinRoom(client1, { roomId: 1 });
      await gateway.handleJoinRoom(client2, { roomId: 1 });

      (client2.send as jest.Mock).mockClear();
      gateway.handleLeaveRoom(client1, { roomId: 1 });

      const parsed = JSON.parse((client2.send as jest.Mock).mock.calls[0][0]);
      expect(parsed.event).toBe(WS_EMIT.MEMBER_LEFT);
    });
  });

  describe('disconnect cleanup', () => {
    it('should broadcast departures to remaining room members', async () => {
      const client1 = createMockClient();
      const client2 = createMockClient();
      connectionService.trackClient(client1, aliceIdentity);
      connectionService.trackClient(client2, bobIdentity);

      await gateway.handleJoinRoom(client1, { roomId: 1 });
      await gateway.handleJoinRoom(client2, { roomId: 1 });

      (client2.send as jest.Mock).mockClear();
      await connectionService.notifyDisconnect(client1);

      const parsed = JSON.parse((client2.send as jest.Mock).mock.calls[0][0]);
      expect(parsed.event).toBe(WS_EMIT.MEMBER_LEFT);
      expect(parsed.data.member.displayName).toBe('Alice');
    });
  });
});
