import { WebSocket } from 'ws';
import { MAX_CONNECTIONS_PER_USER, WsConnectionService } from './ws-connection.service';

describe('WsConnectionService', () => {
  let service: WsConnectionService;

  const aliceIdentity = { userId: 1, displayName: 'Alice' };
  const bobIdentity = { userId: 2, displayName: 'Bob' };

  const createMockWs = () => ({ send: jest.fn(), close: jest.fn() }) as unknown as WebSocket;

  beforeEach(() => {
    service = new WsConnectionService();
  });

  describe('trackClient', () => {
    it('should register a client and return tracked info', () => {
      const ws = createMockWs();
      const tracked = service.trackClient(ws, aliceIdentity)!;

      expect(tracked.identity).toEqual(aliceIdentity);
      expect(tracked.id).toMatch(/^conn-/);
      expect(tracked.ws).toBe(ws);
    });

    it('should assign unique IDs', () => {
      const ws1 = createMockWs();
      const ws2 = createMockWs();
      const t1 = service.trackClient(ws1, aliceIdentity)!;
      const t2 = service.trackClient(ws2, bobIdentity)!;

      expect(t1.id).not.toBe(t2.id);
    });

    it('should reject when user exceeds connection limit', () => {
      for (let i = 0; i < MAX_CONNECTIONS_PER_USER; i++) {
        expect(service.trackClient(createMockWs(), aliceIdentity)).not.toBeNull();
      }

      expect(service.trackClient(createMockWs(), aliceIdentity)).toBeNull();
    });

    it('should allow new connections after one is untracked', () => {
      const sockets: WebSocket[] = [];
      for (let i = 0; i < MAX_CONNECTIONS_PER_USER; i++) {
        sockets.push(createMockWs());
        service.trackClient(sockets[i], aliceIdentity);
      }

      service.untrackClient(sockets[0]);
      expect(service.trackClient(createMockWs(), aliceIdentity)).not.toBeNull();
    });
  });

  describe('getTracked', () => {
    it('should return tracked client by ws reference', () => {
      const ws = createMockWs();
      service.trackClient(ws, aliceIdentity);

      const tracked = service.getTracked(ws);
      expect(tracked?.identity).toEqual(aliceIdentity);
    });

    it('should return undefined for unknown ws', () => {
      expect(service.getTracked(createMockWs())).toBeUndefined();
    });
  });

  describe('getTrackedById', () => {
    it('should return tracked client by connection ID', () => {
      const ws = createMockWs();
      const tracked = service.trackClient(ws, aliceIdentity)!;

      expect(service.getTrackedById(tracked.id)).toBe(tracked);
    });

    it('should return undefined for unknown ID', () => {
      expect(service.getTrackedById('conn-999')).toBeUndefined();
    });
  });

  describe('untrackClient', () => {
    it('should remove client and return tracked info', () => {
      const ws = createMockWs();
      const tracked = service.trackClient(ws, aliceIdentity)!;

      const removed = service.untrackClient(ws);
      expect(removed?.identity).toEqual(aliceIdentity);
      expect(service.getTracked(ws)).toBeUndefined();
      expect(service.getTrackedById(tracked.id)).toBeUndefined();
    });
  });

  describe('getClientsByUserId', () => {
    it('should return all connections for a user', () => {
      const ws1 = createMockWs();
      const ws2 = createMockWs();
      service.trackClient(ws1, aliceIdentity);
      service.trackClient(ws2, aliceIdentity); // second tab

      const clients = service.getClientsByUserId(1);
      expect(clients).toHaveLength(2);
    });

    it('should return empty array for unknown user', () => {
      expect(service.getClientsByUserId(999)).toEqual([]);
    });
  });

  describe('getAllClients', () => {
    it('should iterate all tracked clients', () => {
      const ws1 = createMockWs();
      const ws2 = createMockWs();
      service.trackClient(ws1, aliceIdentity);
      service.trackClient(ws2, bobIdentity);

      const all = [...service.getAllClients()];
      expect(all).toHaveLength(2);
    });
  });

  describe('notifyDisconnect', () => {
    it('should call listeners before untracking', async () => {
      const ws = createMockWs();
      service.trackClient(ws, aliceIdentity);

      let wasTrackedDuringCallback = false;
      service.onDisconnect((tracked) => {
        wasTrackedDuringCallback = service.getTracked(ws) !== undefined;
      });

      await service.notifyDisconnect(ws);

      expect(wasTrackedDuringCallback).toBe(true);
      expect(service.getTracked(ws)).toBeUndefined();
    });

    it('should return undefined for untracked ws', async () => {
      const ws = createMockWs();
      const result = await service.notifyDisconnect(ws);
      expect(result).toBeUndefined();
    });

    it('should call multiple listeners in order', async () => {
      const ws = createMockWs();
      service.trackClient(ws, aliceIdentity);

      const order: number[] = [];
      service.onDisconnect(() => {
        order.push(1);
      });
      service.onDisconnect(() => {
        order.push(2);
      });

      await service.notifyDisconnect(ws);

      expect(order).toEqual([1, 2]);
    });
  });
});
