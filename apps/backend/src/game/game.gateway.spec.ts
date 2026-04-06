import { WebSocket } from 'ws';
import { RoomManager } from '@cardquorum/engine';
import { UserIdentity, WS_EMIT } from '@cardquorum/shared';
import { RoomService } from '../room/room.service';
import { WsConnectionService } from '../ws/ws-connection.service';
import { GameGateway } from './game.gateway';
import { GameService } from './game.service';

describe('GameGateway', () => {
  let gateway: GameGateway;
  let connectionService: WsConnectionService;
  let gameService: jest.Mocked<GameService>;
  let roomService: {
    manager: RoomManager;
    broadcastToRoom: (roomId: string, event: string, data: unknown) => void;
  };

  const aliceIdentity: UserIdentity = { userId: 1, username: 'alice', displayName: 'Alice' };
  const bobIdentity: UserIdentity = { userId: 2, username: 'bob', displayName: 'Bob' };
  const charlieIdentity: UserIdentity = { userId: 3, username: 'charlie', displayName: 'Charlie' };

  const createMockClient = () => ({ send: jest.fn(), close: jest.fn() }) as unknown as WebSocket;

  beforeEach(() => {
    const { RoomManager: RM } = jest.requireActual('@cardquorum/engine');
    connectionService = new WsConnectionService();
    const manager = new RM();
    roomService = {
      manager,
      broadcastToRoom(roomId: string, event: string, data: unknown) {
        const room = manager.getRoom(roomId);
        if (!room) return;
        const message = JSON.stringify({ event, data });
        for (const connId of room.members.keys()) {
          const tracked = connectionService.getTrackedById(connId);
          if (tracked) tracked.ws.send(message);
        }
      },
    };

    gameService = {
      createSession: jest.fn(),
      startSession: jest.fn(),
      applyAction: jest.fn(),
      cancelSession: jest.fn(),
      cleanupDisconnectedCreator: jest.fn(),
      getPlayerViewByRoom: jest.fn(),
    } as any;

    gateway = new GameGateway(
      connectionService,
      roomService as unknown as RoomService,
      gameService,
    );
    gateway.onModuleInit();
  });

  describe('handleGameCreate', () => {
    it('should call service.createSession and broadcast game:created to room members', async () => {
      const client1 = createMockClient();
      const client2 = createMockClient();
      const t1 = connectionService.trackClient(client1, aliceIdentity);
      const t2 = connectionService.trackClient(client2, bobIdentity);

      roomService.manager.joinRoom('1', t1.id, aliceIdentity);
      roomService.manager.joinRoom('1', t2.id, bobIdentity);

      const config = { name: '3-hand', playerCount: 3 };
      gameService.createSession.mockResolvedValue({
        sessionId: 1,
        gameType: 'sheepshead',
        config,
      });

      await gateway.handleGameCreate(client1, {
        roomId: 1,
        gameType: 'sheepshead',
        config,
      });

      expect(gameService.createSession).toHaveBeenCalledWith(
        1,
        'sheepshead',
        config,
        aliceIdentity.userId,
      );

      for (const client of [client1, client2]) {
        const parsed = JSON.parse((client.send as jest.Mock).mock.calls[0][0]);
        expect(parsed.event).toBe(WS_EMIT.GAME_CREATED);
        expect(parsed.data.sessionId).toBe(1);
      }
    });

    it('should reject if sender is not a room member', async () => {
      const client = createMockClient();
      connectionService.trackClient(client, aliceIdentity);

      await gateway.handleGameCreate(client, {
        roomId: 1,
        gameType: 'sheepshead',
        config: {},
      });

      const parsed = JSON.parse((client.send as jest.Mock).mock.calls[0][0]);
      expect(parsed.event).toBe(WS_EMIT.GAME_ERROR);
      expect(parsed.data.message).toBe('You must be a room member to create a game');
    });

    it('should send game:error if createSession throws', async () => {
      const client = createMockClient();
      const tracked = connectionService.trackClient(client, aliceIdentity);
      roomService.manager.joinRoom('1', tracked.id, aliceIdentity);

      gameService.createSession.mockRejectedValue(new Error('Invalid game configuration'));

      await gateway.handleGameCreate(client, {
        roomId: 1,
        gameType: 'sheepshead',
        config: {},
      });

      const parsed = JSON.parse((client.send as jest.Mock).mock.calls[0][0]);
      expect(parsed.event).toBe(WS_EMIT.GAME_ERROR);
      expect(parsed.data.message).toBe('Failed to create game session');
    });
  });

  describe('handleGameStart', () => {
    it('should send per-player views to individual clients', async () => {
      const client1 = createMockClient();
      const client2 = createMockClient();
      const client3 = createMockClient();
      connectionService.trackClient(client1, aliceIdentity);
      connectionService.trackClient(client2, bobIdentity);
      connectionService.trackClient(client3, charlieIdentity);

      gameService.startSession.mockResolvedValue({
        playerViews: [
          [1, { state: { hand: ['alice-view'] }, validActions: ['deal'] }],
          [2, { state: { hand: ['bob-view'] }, validActions: [] }],
          [3, { state: { hand: ['charlie-view'] }, validActions: [] }],
        ],
      });

      await gateway.handleGameStart(client1, { sessionId: 1 });

      expect(gameService.startSession).toHaveBeenCalledWith(1, aliceIdentity.userId);

      const parse = (c: WebSocket) => JSON.parse((c.send as jest.Mock).mock.calls[0][0]);

      expect(parse(client1).event).toBe(WS_EMIT.GAME_STARTED);
      expect(parse(client1).data.state).toEqual({ hand: ['alice-view'] });
      expect(parse(client1).data.validActions).toEqual(['deal']);

      expect(parse(client2).data.state).toEqual({ hand: ['bob-view'] });
      expect(parse(client3).data.state).toEqual({ hand: ['charlie-view'] });
    });

    it('should send game:error if startSession throws', async () => {
      const client = createMockClient();
      connectionService.trackClient(client, aliceIdentity);

      gameService.startSession.mockRejectedValue(
        new Error('Only the session creator can start the game'),
      );

      await gateway.handleGameStart(client, { sessionId: 1 });

      const parsed = JSON.parse((client.send as jest.Mock).mock.calls[0][0]);
      expect(parsed.event).toBe(WS_EMIT.GAME_ERROR);
    });
  });

  describe('handleGameAction', () => {
    it('should broadcast per-player state updates on success', async () => {
      const client1 = createMockClient();
      const client2 = createMockClient();
      connectionService.trackClient(client1, aliceIdentity);
      connectionService.trackClient(client2, bobIdentity);

      gameService.applyAction.mockResolvedValue({
        gameOver: false,
        playerViews: [
          [1, { state: { phase: 'pick' }, validActions: ['pick', 'pass'] }],
          [2, { state: { phase: 'pick' }, validActions: [] }],
        ],
      });

      await gateway.handleGameAction(client1, {
        sessionId: 1,
        action: { type: 'deal' },
      });

      const parse = (c: WebSocket) => JSON.parse((c.send as jest.Mock).mock.calls[0][0]);
      expect(parse(client1).event).toBe(WS_EMIT.GAME_STATE_UPDATE);
      expect(parse(client2).event).toBe(WS_EMIT.GAME_STATE_UPDATE);
    });

    it('should send game:over to all players when game finishes', async () => {
      const client1 = createMockClient();
      const client2 = createMockClient();
      connectionService.trackClient(client1, aliceIdentity);
      connectionService.trackClient(client2, bobIdentity);

      const store = { players: [{ userID: 1 }, { userID: 2 }] };
      gameService.applyAction.mockResolvedValue({
        gameOver: true,
        playerViews: [
          [1, { state: {}, validActions: [] }],
          [2, { state: {}, validActions: [] }],
        ],
        store,
      });

      await gateway.handleGameAction(client1, {
        sessionId: 1,
        action: { type: 'game_scored' },
      });

      for (const client of [client1, client2]) {
        const parsed = JSON.parse((client.send as jest.Mock).mock.calls[0][0]);
        expect(parsed.event).toBe(WS_EMIT.GAME_OVER);
        expect(parsed.data.store).toEqual(store);
      }
    });

    it('should send game:error if applyAction throws', async () => {
      const client = createMockClient();
      connectionService.trackClient(client, aliceIdentity);

      gameService.applyAction.mockRejectedValue(new Error("Action 'deal' is not valid for user 1"));

      await gateway.handleGameAction(client, {
        sessionId: 1,
        action: { type: 'deal' },
      });

      const parsed = JSON.parse((client.send as jest.Mock).mock.calls[0][0]);
      expect(parsed.event).toBe(WS_EMIT.GAME_ERROR);
      expect(parsed.data.message).toBe('Invalid action');
    });
  });

  describe('handleGameRejoin', () => {
    it('should send current player view if active game exists for room', async () => {
      const client = createMockClient();
      connectionService.trackClient(client, aliceIdentity);

      gameService.getPlayerViewByRoom.mockReturnValue({
        sessionId: 1,
        state: { phase: 'pick', hand: ['qc'] },
        validActions: ['pick', 'pass'],
      });

      await gateway.handleGameRejoin(client, { roomId: 1 });

      const parsed = JSON.parse((client.send as jest.Mock).mock.calls[0][0]);
      expect(parsed.event).toBe(WS_EMIT.GAME_STATE_UPDATE);
      expect(parsed.data.sessionId).toBe(1);
      expect(parsed.data.state.phase).toBe('pick');
    });

    it('should send nothing if no active game for room', async () => {
      const client = createMockClient();
      connectionService.trackClient(client, aliceIdentity);

      gameService.getPlayerViewByRoom.mockReturnValue(null);

      await gateway.handleGameRejoin(client, { roomId: 1 });

      expect(client.send).not.toHaveBeenCalled();
    });
  });

  describe('handleGameCancel', () => {
    it('should cancel session and broadcast game:cancelled to room', async () => {
      const client1 = createMockClient();
      const client2 = createMockClient();
      const t1 = connectionService.trackClient(client1, aliceIdentity);
      const t2 = connectionService.trackClient(client2, bobIdentity);

      roomService.manager.joinRoom('1', t1.id, aliceIdentity);
      roomService.manager.joinRoom('1', t2.id, bobIdentity);

      gameService.cancelSession.mockResolvedValue({ roomId: 1 });

      await gateway.handleGameCancel(client1, { sessionId: 1 });

      expect(gameService.cancelSession).toHaveBeenCalledWith(1, aliceIdentity.userId);

      for (const client of [client1, client2]) {
        const parsed = JSON.parse((client.send as jest.Mock).mock.calls[0][0]);
        expect(parsed.event).toBe(WS_EMIT.GAME_CANCELLED);
        expect(parsed.data.sessionId).toBe(1);
      }
    });

    it('should send game:error if cancelSession throws', async () => {
      const client = createMockClient();
      connectionService.trackClient(client, aliceIdentity);

      gameService.cancelSession.mockRejectedValue(
        new Error('Only the session creator can cancel the game'),
      );

      await gateway.handleGameCancel(client, { sessionId: 1 });

      const parsed = JSON.parse((client.send as jest.Mock).mock.calls[0][0]);
      expect(parsed.event).toBe(WS_EMIT.GAME_ERROR);
    });
  });

  describe('disconnect cleanup', () => {
    it('should clean up waiting sessions when creator has no remaining connections', async () => {
      const client = createMockClient();
      connectionService.trackClient(client, aliceIdentity);

      gameService.cleanupDisconnectedCreator.mockResolvedValue([{ sessionId: 1, roomId: 1 }]);

      // Bob is still in the room to receive the broadcast
      const bobClient = createMockClient();
      const bobTracked = connectionService.trackClient(bobClient, bobIdentity);
      roomService.manager.joinRoom('1', bobTracked.id, bobIdentity);

      await connectionService.notifyDisconnect(client);

      expect(gameService.cleanupDisconnectedCreator).toHaveBeenCalledWith(aliceIdentity.userId);

      const parsed = JSON.parse((bobClient.send as jest.Mock).mock.calls[0][0]);
      expect(parsed.event).toBe(WS_EMIT.GAME_CANCELLED);
    });

    it('should not clean up if user has other connections', async () => {
      const client1 = createMockClient();
      const client2 = createMockClient();
      connectionService.trackClient(client1, aliceIdentity);
      connectionService.trackClient(client2, aliceIdentity); // second tab

      await connectionService.notifyDisconnect(client1);

      expect(gameService.cleanupDisconnectedCreator).not.toHaveBeenCalled();
    });

    it('should do nothing for untracked clients', async () => {
      const client = createMockClient();

      await connectionService.notifyDisconnect(client);

      expect(gameService.cleanupDisconnectedCreator).not.toHaveBeenCalled();
    });
  });
});
