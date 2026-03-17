import { WebSocket } from 'ws';
import { UserIdentity, WS_EMIT } from '@cardquorum/shared';
import { WsConnectionService } from '../ws/ws-connection.service';
import { RoomService } from './room.service';

describe('RoomService', () => {
  let service: RoomService;
  let connectionService: WsConnectionService;
  let mockRepo: {
    findById: jest.Mock;
    findAll: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };

  const alice: UserIdentity = { userId: 1, displayName: 'Alice' };
  const bob: UserIdentity = { userId: 2, displayName: 'Bob' };

  const createMockClient = () => ({ send: jest.fn(), close: jest.fn() }) as unknown as WebSocket;

  beforeEach(() => {
    connectionService = new WsConnectionService();

    mockRepo = {
      findById: jest.fn(),
      findAll: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };

    service = new RoomService(mockRepo as any, connectionService);
  });

  describe('delete', () => {
    it('should broadcast ROOM_DELETED to connected members before deleting', async () => {
      const client1 = createMockClient();
      const client2 = createMockClient();
      connectionService.trackClient(client1, alice);
      connectionService.trackClient(client2, bob);

      // Both are in room 1
      const tracked1 = connectionService.getTracked(client1)!;
      const tracked2 = connectionService.getTracked(client2)!;
      service.manager.joinRoom('1', tracked1.id, alice);
      service.manager.joinRoom('1', tracked2.id, bob);

      mockRepo.delete.mockResolvedValue({ id: 1 });

      await service.delete(1);

      // Both clients should receive ROOM_DELETED
      for (const client of [client1, client2]) {
        const calls = (client.send as jest.Mock).mock.calls;
        expect(calls.length).toBeGreaterThanOrEqual(1);
        const parsed = JSON.parse(calls[0][0]);
        expect(parsed.event).toBe(WS_EMIT.ROOM_DELETED);
        expect(parsed.data.roomId).toBe(1);
      }
    });

    it('should remove all members from the room manager', async () => {
      const client1 = createMockClient();
      connectionService.trackClient(client1, alice);
      const tracked = connectionService.getTracked(client1)!;
      service.manager.joinRoom('1', tracked.id, alice);

      mockRepo.delete.mockResolvedValue({ id: 1 });

      await service.delete(1);

      expect(service.manager.getRoom('1')).toBeUndefined();
    });

    it('should handle deletion of room with no connected members', async () => {
      mockRepo.delete.mockResolvedValue({ id: 1 });

      await service.delete(1);

      expect(mockRepo.delete).toHaveBeenCalledWith(1);
    });
  });

  describe('getOnlineCount', () => {
    it('should return unique user count', async () => {
      const client1 = createMockClient();
      const client2 = createMockClient();
      connectionService.trackClient(client1, alice);
      connectionService.trackClient(client2, alice); // same user, two connections

      const tracked1 = connectionService.getTracked(client1)!;
      const tracked2 = connectionService.getTracked(client2)!;
      service.manager.joinRoom('1', tracked1.id, alice);
      service.manager.joinRoom('1', tracked2.id, alice);

      expect(service.getOnlineCount(1)).toBe(1);
    });

    it('should return 0 for room with no members', () => {
      expect(service.getOnlineCount(999)).toBe(0);
    });
  });

  describe('broadcastToRoom', () => {
    it('should send to all members except excluded connection', () => {
      const client1 = createMockClient();
      const client2 = createMockClient();
      connectionService.trackClient(client1, alice);
      connectionService.trackClient(client2, bob);

      const tracked1 = connectionService.getTracked(client1)!;
      const tracked2 = connectionService.getTracked(client2)!;
      service.manager.joinRoom('1', tracked1.id, alice);
      service.manager.joinRoom('1', tracked2.id, bob);

      service.broadcastToRoom('1', 'test:event', { msg: 'hello' }, tracked1.id);

      expect(client1.send).not.toHaveBeenCalled();
      expect(client2.send).toHaveBeenCalledTimes(1);
      const parsed = JSON.parse((client2.send as jest.Mock).mock.calls[0][0]);
      expect(parsed.event).toBe('test:event');
    });

    it('should not throw if a client send fails', () => {
      const client1 = createMockClient();
      (client1.send as jest.Mock).mockImplementation(() => {
        throw new Error('connection closed');
      });
      connectionService.trackClient(client1, alice);
      const tracked = connectionService.getTracked(client1)!;
      service.manager.joinRoom('1', tracked.id, alice);

      expect(() => service.broadcastToRoom('1', 'test', {})).not.toThrow();
    });
  });
});
