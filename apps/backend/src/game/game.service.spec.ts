import { GameSessionRepository } from '@cardquorum/db';
import { RoomManager } from '@cardquorum/engine';
import { RoomService } from '../room/room.service';
import { GameService } from './game.service';

describe('GameService', () => {
  let service: GameService;
  let mockSessionRepo: jest.Mocked<
    Pick<GameSessionRepository, 'create' | 'updateStatusAndTimestamp' | 'updateStore'>
  >;
  let roomService: { manager: RoomManager };

  const aliceIdentity = { userId: 1, username: 'alice', displayName: 'Alice' };
  const bobIdentity = { userId: 2, username: 'bob', displayName: 'Bob' };
  const charlieIdentity = { userId: 3, username: 'charlie', displayName: 'Charlie' };

  // Minimal valid 3-player sheepshead config
  const validConfig = {
    name: '3-hand',
    playerCount: 3,
    handSize: 10,
    blindSize: 2,
    pickerRule: 'left-of-dealer' as const,
    partnerRule: null,
    noPick: 'leaster' as const,
    cracking: false,
    blitzing: false,
    doubleOnTheBump: false,
    partnerOffTheHook: false,
    noAceFaceTrump: false,
    multiplicityLimit: null,
    callOwnAce: null,
  };

  beforeEach(() => {
    mockSessionRepo = {
      create: jest.fn().mockResolvedValue({ id: 1 }),
      updateStatusAndTimestamp: jest.fn().mockResolvedValue({}),
      updateStore: jest.fn().mockResolvedValue({}),
    };

    const { RoomManager: RM } = jest.requireActual('@cardquorum/engine');
    roomService = { manager: new RM() };

    service = new GameService(
      mockSessionRepo as unknown as GameSessionRepository,
      roomService as unknown as RoomService,
    );
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  describe('createSession', () => {
    it('should validate config, persist to DB, and return session info', async () => {
      const result = await service.createSession(1, 'sheepshead', validConfig, 10);

      expect(mockSessionRepo.create).toHaveBeenCalledWith({
        roomId: 1,
        gameType: 'sheepshead',
        config: validConfig,
      });
      expect(result).toEqual({
        sessionId: 1,
        gameType: 'sheepshead',
        config: validConfig,
      });
    });

    it('should throw for unknown game type', async () => {
      await expect(service.createSession(1, 'unknown-game', {}, 10)).rejects.toThrow(
        'Unknown game type: unknown-game',
      );
    });

    it('should throw for invalid config', async () => {
      await expect(service.createSession(1, 'sheepshead', { bad: 'config' }, 10)).rejects.toThrow(
        'Invalid game configuration',
      );
    });

    it('should throw if room already has an active game', async () => {
      await service.createSession(1, 'sheepshead', validConfig, 10);

      await expect(service.createSession(1, 'sheepshead', validConfig, 10)).rejects.toThrow(
        'Room 1 already has an active game session',
      );
    });
  });

  describe('startSession', () => {
    it('should initialize state and return per-player views', async () => {
      roomService.manager.joinRoom('1', 'conn-1', aliceIdentity);
      roomService.manager.joinRoom('1', 'conn-2', bobIdentity);
      roomService.manager.joinRoom('1', 'conn-3', charlieIdentity);

      await service.createSession(1, 'sheepshead', validConfig, 1);

      const result = await service.startSession(1, 1);

      expect(result.playerViews).toHaveLength(3);
      for (const [userID, view] of result.playerViews) {
        expect(typeof userID).toBe('number');
        expect(view).toBeDefined();
      }
      expect(mockSessionRepo.updateStatusAndTimestamp).toHaveBeenCalledWith(
        1,
        'active',
        'startedAt',
      );
    });

    it('should throw if session does not exist', async () => {
      await expect(service.startSession(999, 1)).rejects.toThrow('Game session 999 not found');
    });

    it('should throw if sender is not the creator', async () => {
      roomService.manager.joinRoom('1', 'conn-1', aliceIdentity);
      roomService.manager.joinRoom('1', 'conn-2', bobIdentity);
      roomService.manager.joinRoom('1', 'conn-3', charlieIdentity);

      await service.createSession(1, 'sheepshead', validConfig, 1);

      await expect(service.startSession(1, 2)).rejects.toThrow(
        'Only the session creator can start the game',
      );
    });

    it('should throw if session is already active', async () => {
      roomService.manager.joinRoom('1', 'conn-1', aliceIdentity);
      roomService.manager.joinRoom('1', 'conn-2', bobIdentity);
      roomService.manager.joinRoom('1', 'conn-3', charlieIdentity);

      await service.createSession(1, 'sheepshead', validConfig, 1);
      await service.startSession(1, 1);

      await expect(service.startSession(1, 1)).rejects.toThrow(
        'Game session 1 is not in waiting status',
      );
    });

    it('should throw if player count does not match config', async () => {
      roomService.manager.joinRoom('1', 'conn-1', aliceIdentity);
      roomService.manager.joinRoom('1', 'conn-2', bobIdentity);

      await service.createSession(1, 'sheepshead', validConfig, 1);

      await expect(service.startSession(1, 1)).rejects.toThrow(
        'Expected 3 players, but room has 2',
      );
    });

    it('should deduplicate players with multiple connections', async () => {
      roomService.manager.joinRoom('1', 'conn-1', aliceIdentity);
      roomService.manager.joinRoom('1', 'conn-1b', aliceIdentity);
      roomService.manager.joinRoom('1', 'conn-2', bobIdentity);
      roomService.manager.joinRoom('1', 'conn-3', charlieIdentity);

      await service.createSession(1, 'sheepshead', validConfig, 1);

      const result = await service.startSession(1, 1);
      expect(result.playerViews).toHaveLength(3);
    });
  });

  describe('applyAction', () => {
    async function setupActiveGame(): Promise<number> {
      roomService.manager.joinRoom('1', 'conn-1', aliceIdentity);
      roomService.manager.joinRoom('1', 'conn-2', bobIdentity);
      roomService.manager.joinRoom('1', 'conn-3', charlieIdentity);

      await service.createSession(1, 'sheepshead', validConfig, 1);
      await service.startSession(1, 1);
      return 1;
    }

    it('should apply a valid deal action and return player views', async () => {
      const sessionId = await setupActiveGame();

      // Player 1 (dealer/activePlayer at userIDs[0]) deals
      const result = await service.applyAction(sessionId, 1, {
        type: 'deal',
      });

      expect(result.gameOver).toBe(false);
      expect(result.playerViews).toHaveLength(3);
      expect(result.store).toBeUndefined();
    });

    it('should throw for unknown session', async () => {
      await expect(service.applyAction(999, 1, { type: 'deal' })).rejects.toThrow(
        'Game session 999 not found',
      );
    });

    it('should throw if session is not active', async () => {
      roomService.manager.joinRoom('1', 'conn-1', aliceIdentity);
      await service.createSession(1, 'sheepshead', validConfig, 1);

      await expect(service.applyAction(1, 1, { type: 'deal' })).rejects.toThrow(
        'Game session 1 is not active',
      );
    });

    it('should throw if user is not a player', async () => {
      const sessionId = await setupActiveGame();

      await expect(service.applyAction(sessionId, 99, { type: 'deal' })).rejects.toThrow(
        'User 99 is not a player in session 1',
      );
    });

    it('should throw if action is not valid for user', async () => {
      const sessionId = await setupActiveGame();

      // Player 2 is not the dealer (userIDs[0] = 1), cannot deal
      await expect(service.applyAction(sessionId, 2, { type: 'deal' })).rejects.toThrow(
        "Action 'deal' is not valid for user 2",
      );
    });
  });

  describe('getPlayerView', () => {
    it('should return the player view for an active session', async () => {
      roomService.manager.joinRoom('1', 'conn-1', aliceIdentity);
      roomService.manager.joinRoom('1', 'conn-2', bobIdentity);
      roomService.manager.joinRoom('1', 'conn-3', charlieIdentity);

      await service.createSession(1, 'sheepshead', validConfig, 1);
      await service.startSession(1, 1);

      const view = service.getPlayerView(1, 1);
      expect(view).toBeDefined();
    });

    it('should return null if no active game for the room', () => {
      const view = service.getPlayerViewByRoom(99, 1);
      expect(view).toBeNull();
    });

    it('should return player view by roomId for reconnection', async () => {
      roomService.manager.joinRoom('1', 'conn-1', aliceIdentity);
      roomService.manager.joinRoom('1', 'conn-2', bobIdentity);
      roomService.manager.joinRoom('1', 'conn-3', charlieIdentity);

      await service.createSession(1, 'sheepshead', validConfig, 1);
      await service.startSession(1, 1);

      const result = service.getPlayerViewByRoom(1, 1);
      expect(result).not.toBeNull();
      expect(result!.sessionId).toBe(1);
      expect(result!.state).toBeDefined();
    });

    it('should return null for a non-player', async () => {
      roomService.manager.joinRoom('1', 'conn-1', aliceIdentity);
      roomService.manager.joinRoom('1', 'conn-2', bobIdentity);
      roomService.manager.joinRoom('1', 'conn-3', charlieIdentity);

      await service.createSession(1, 'sheepshead', validConfig, 1);
      await service.startSession(1, 1);

      const view = service.getPlayerView(1, 99);
      expect(view).toBeNull();
    });
  });

  describe('cancelSession', () => {
    it('should cancel a waiting session and clean up maps', async () => {
      roomService.manager.joinRoom('1', 'conn-1', aliceIdentity);
      await service.createSession(1, 'sheepshead', validConfig, 1);

      const result = await service.cancelSession(1, 1);

      expect(result.roomId).toBe(1);
      expect(mockSessionRepo.updateStatusAndTimestamp).toHaveBeenCalledWith(
        1,
        'cancelled',
        'finishedAt',
      );

      // Room is unblocked — can create a new session
      mockSessionRepo.create.mockResolvedValue({ id: 2 } as any);
      const newSession = await service.createSession(1, 'sheepshead', validConfig, 1);
      expect(newSession.sessionId).toBe(2);
    });

    it('should throw if session does not exist', async () => {
      await expect(service.cancelSession(999, 1)).rejects.toThrow('Game session 999 not found');
    });

    it('should throw if session is not in waiting status', async () => {
      roomService.manager.joinRoom('1', 'conn-1', aliceIdentity);
      roomService.manager.joinRoom('1', 'conn-2', bobIdentity);
      roomService.manager.joinRoom('1', 'conn-3', charlieIdentity);

      await service.createSession(1, 'sheepshead', validConfig, 1);
      await service.startSession(1, 1);

      await expect(service.cancelSession(1, 1)).rejects.toThrow(
        'Game session 1 is not in waiting status',
      );
    });

    it('should throw if requester is not the creator', async () => {
      roomService.manager.joinRoom('1', 'conn-2', bobIdentity);
      await service.createSession(1, 'sheepshead', validConfig, 1);

      await expect(service.cancelSession(1, 2)).rejects.toThrow(
        'Only the session creator can cancel the game',
      );
    });
  });

  describe('cleanupDisconnectedCreator', () => {
    it('should cancel all waiting sessions created by the user', async () => {
      await service.createSession(1, 'sheepshead', validConfig, 1);
      mockSessionRepo.create.mockResolvedValue({ id: 2 } as any);
      await service.createSession(2, 'sheepshead', validConfig, 1);

      const cancelled = await service.cleanupDisconnectedCreator(1);

      expect(cancelled).toHaveLength(2);
      expect(cancelled.map((c) => c.roomId).sort()).toEqual([1, 2]);
    });

    it('should not cancel active sessions', async () => {
      roomService.manager.joinRoom('1', 'conn-1', aliceIdentity);
      roomService.manager.joinRoom('1', 'conn-2', bobIdentity);
      roomService.manager.joinRoom('1', 'conn-3', charlieIdentity);

      await service.createSession(1, 'sheepshead', validConfig, 1);
      await service.startSession(1, 1);

      const cancelled = await service.cleanupDisconnectedCreator(1);
      expect(cancelled).toHaveLength(0);
    });

    it('should not cancel sessions created by other users', async () => {
      await service.createSession(1, 'sheepshead', validConfig, 2);

      const cancelled = await service.cleanupDisconnectedCreator(1);
      expect(cancelled).toHaveLength(0);
    });
  });
});
