import * as fc from 'fast-check';
import { GameSessionRepository } from '@cardquorum/db';
import { RoomManager } from '@cardquorum/engine';
import { RosterState } from '@cardquorum/shared';
import { RoomService } from '../room/room.service';
import { GameService } from './game.service';

describe('GameService', () => {
  let service: GameService;
  let mockSessionRepo: jest.Mocked<
    Pick<GameSessionRepository, 'create' | 'updateStatusAndTimestamp' | 'updateStore'>
  >;
  let roomService: { manager: RoomManager; getRoster: jest.Mock; rotateSeat: jest.Mock };

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

  /** Helper to build a RosterState from player identities */
  function buildRoster(
    players: Array<{ userId: number; username: string; displayName: string }>,
    spectators: Array<{ userId: number; username: string; displayName: string }> = [],
  ): RosterState {
    return {
      players: players.map((p, i) => ({
        userId: p.userId,
        username: p.username,
        displayName: p.displayName,
        section: 'players' as const,
        position: i,
        assignedHue: null as number | null,
      })),
      spectators: spectators.map((s, i) => ({
        userId: s.userId,
        username: s.username,
        displayName: s.displayName,
        section: 'spectators' as const,
        position: i,
        assignedHue: null as number | null,
      })),
      rotatePlayers: false,
    };
  }

  beforeEach(() => {
    mockSessionRepo = {
      create: jest.fn().mockResolvedValue({ id: 1 }),
      updateStatusAndTimestamp: jest.fn().mockResolvedValue({}),
      updateStore: jest.fn().mockResolvedValue({}),
    };

    const { RoomManager: RM } = jest.requireActual('@cardquorum/engine');
    roomService = {
      manager: new RM(),
      getRoster: jest.fn().mockResolvedValue(buildRoster([])),
      rotateSeat: jest.fn().mockResolvedValue(buildRoster([])),
    };

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
      roomService.getRoster.mockResolvedValue(
        buildRoster([aliceIdentity, bobIdentity, charlieIdentity]),
      );

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
      roomService.getRoster.mockResolvedValue(
        buildRoster([aliceIdentity, bobIdentity, charlieIdentity]),
      );

      await service.createSession(1, 'sheepshead', validConfig, 1);

      await expect(service.startSession(1, 2)).rejects.toThrow(
        'Only the session creator can start the game',
      );
    });

    it('should throw if session is already active', async () => {
      roomService.manager.joinRoom('1', 'conn-1', aliceIdentity);
      roomService.manager.joinRoom('1', 'conn-2', bobIdentity);
      roomService.manager.joinRoom('1', 'conn-3', charlieIdentity);
      roomService.getRoster.mockResolvedValue(
        buildRoster([aliceIdentity, bobIdentity, charlieIdentity]),
      );

      await service.createSession(1, 'sheepshead', validConfig, 1);
      await service.startSession(1, 1);

      await expect(service.startSession(1, 1)).rejects.toThrow(
        'Game session 1 is not in waiting status',
      );
    });

    it('should throw if player count does not match config', async () => {
      roomService.manager.joinRoom('1', 'conn-1', aliceIdentity);
      roomService.manager.joinRoom('1', 'conn-2', bobIdentity);
      roomService.getRoster.mockResolvedValue(buildRoster([aliceIdentity, bobIdentity]));

      await service.createSession(1, 'sheepshead', validConfig, 1);

      await expect(service.startSession(1, 1)).rejects.toThrow(
        'Expected 3 players, but Players list has 2',
      );
    });

    it('should throw if too many players in roster', async () => {
      const daveIdentity = { userId: 4, username: 'dave', displayName: 'Dave' };
      roomService.manager.joinRoom('1', 'conn-1', aliceIdentity);
      roomService.manager.joinRoom('1', 'conn-2', bobIdentity);
      roomService.manager.joinRoom('1', 'conn-3', charlieIdentity);
      roomService.manager.joinRoom('1', 'conn-4', daveIdentity);
      roomService.getRoster.mockResolvedValue(
        buildRoster([aliceIdentity, bobIdentity, charlieIdentity, daveIdentity]),
      );

      await service.createSession(1, 'sheepshead', validConfig, 1);

      await expect(service.startSession(1, 1)).rejects.toThrow(
        'Expected 3 players, but Players list has 4',
      );
    });

    it('should return colorMap built from roster assigned hues', async () => {
      roomService.manager.joinRoom('1', 'conn-1', aliceIdentity);
      roomService.manager.joinRoom('1', 'conn-2', bobIdentity);
      roomService.manager.joinRoom('1', 'conn-3', charlieIdentity);

      const rosterWithHues: RosterState = {
        players: [
          {
            userId: 1,
            username: 'alice',
            displayName: 'Alice',
            section: 'players' as const,
            position: 0,
            assignedHue: 40,
          },
          {
            userId: 2,
            username: 'bob',
            displayName: 'Bob',
            section: 'players' as const,
            position: 1,
            assignedHue: 160,
          },
          {
            userId: 3,
            username: 'charlie',
            displayName: 'Charlie',
            section: 'players' as const,
            position: 2,
            assignedHue: 280,
          },
        ],
        spectators: [],
        rotatePlayers: false,
      };
      roomService.getRoster.mockResolvedValue(rosterWithHues);

      await service.createSession(1, 'sheepshead', validConfig, 1);
      const result = await service.startSession(1, 1);

      expect(result.colorMap).toEqual({ 1: 40, 2: 160, 3: 280 });
    });

    it('should omit players with null assignedHue from colorMap', async () => {
      roomService.manager.joinRoom('1', 'conn-1', aliceIdentity);
      roomService.manager.joinRoom('1', 'conn-2', bobIdentity);
      roomService.manager.joinRoom('1', 'conn-3', charlieIdentity);

      const rosterWithPartialHues: RosterState = {
        players: [
          {
            userId: 1,
            username: 'alice',
            displayName: 'Alice',
            section: 'players' as const,
            position: 0,
            assignedHue: 100,
          },
          {
            userId: 2,
            username: 'bob',
            displayName: 'Bob',
            section: 'players' as const,
            position: 1,
            assignedHue: null,
          },
          {
            userId: 3,
            username: 'charlie',
            displayName: 'Charlie',
            section: 'players' as const,
            position: 2,
            assignedHue: 220,
          },
        ],
        spectators: [],
        rotatePlayers: false,
      };
      roomService.getRoster.mockResolvedValue(rosterWithPartialHues);

      await service.createSession(1, 'sheepshead', validConfig, 1);
      const result = await service.startSession(1, 1);

      expect(result.colorMap).toEqual({ 1: 100, 3: 220 });
      expect(result.colorMap).not.toHaveProperty('2');
    });

    it('should use only roster players, not spectators', async () => {
      const daveIdentity = { userId: 4, username: 'dave', displayName: 'Dave' };
      roomService.manager.joinRoom('1', 'conn-1', aliceIdentity);
      roomService.manager.joinRoom('1', 'conn-2', bobIdentity);
      roomService.manager.joinRoom('1', 'conn-3', charlieIdentity);
      roomService.manager.joinRoom('1', 'conn-4', daveIdentity);
      roomService.getRoster.mockResolvedValue(
        buildRoster([aliceIdentity, bobIdentity, charlieIdentity], [daveIdentity]),
      );

      await service.createSession(1, 'sheepshead', validConfig, 1);

      const result = await service.startSession(1, 1);
      expect(result.playerViews).toHaveLength(3);
      const playerIds = result.playerViews.map(([id]) => id);
      expect(playerIds).toEqual([1, 2, 3]);
    });
  });

  describe('applyAction', () => {
    async function setupActiveGame(): Promise<number> {
      roomService.manager.joinRoom('1', 'conn-1', aliceIdentity);
      roomService.manager.joinRoom('1', 'conn-2', bobIdentity);
      roomService.manager.joinRoom('1', 'conn-3', charlieIdentity);
      roomService.getRoster.mockResolvedValue(
        buildRoster([aliceIdentity, bobIdentity, charlieIdentity]),
      );

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
      roomService.getRoster.mockResolvedValue(
        buildRoster([aliceIdentity, bobIdentity, charlieIdentity]),
      );

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
      roomService.getRoster.mockResolvedValue(
        buildRoster([aliceIdentity, bobIdentity, charlieIdentity]),
      );

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
      roomService.getRoster.mockResolvedValue(
        buildRoster([aliceIdentity, bobIdentity, charlieIdentity]),
      );

      await service.createSession(1, 'sheepshead', validConfig, 1);
      await service.startSession(1, 1);

      const view = service.getPlayerView(1, 99);
      expect(view).toBeNull();
    });
  });

  describe('getValidTargets', () => {
    async function setupActiveGame(): Promise<number> {
      roomService.manager.joinRoom('1', 'conn-1', aliceIdentity);
      roomService.manager.joinRoom('1', 'conn-2', bobIdentity);
      roomService.manager.joinRoom('1', 'conn-3', charlieIdentity);
      roomService.getRoster.mockResolvedValue(
        buildRoster([aliceIdentity, bobIdentity, charlieIdentity]),
      );

      await service.createSession(1, 'sheepshead', validConfig, 1);
      await service.startSession(1, 1);
      return 1;
    }

    it('should return empty array for a non-existent session', async () => {
      const result = service.getValidTargets(999, 1, 'hand', ['qc']);
      expect(result).toEqual([]);
    });

    it('should return empty array for a non-player user', async () => {
      const sessionId = await setupActiveGame();

      const result = service.getValidTargets(sessionId, 99, 'hand', ['qc']);
      expect(result).toEqual([]);
    });

    it('should return empty array when session is not active (waiting)', async () => {
      roomService.manager.joinRoom('1', 'conn-1', aliceIdentity);
      await service.createSession(1, 'sheepshead', validConfig, 1);

      const result = service.getValidTargets(1, 1, 'hand', ['qc']);
      expect(result).toEqual([]);
    });

    it('should delegate to plugin getValidTargets for an active session with a valid player', async () => {
      const sessionId = await setupActiveGame();

      // Deal to advance past the initial state
      await service.applyAction(sessionId, 1, { type: 'deal' });

      // Get the active player and their hand to make a valid query
      const view = service.getPlayerView(sessionId, 1);
      expect(view).not.toBeNull();

      // The result should be an array (possibly empty depending on game state)
      const result = service.getValidTargets(sessionId, 1, 'hand', ['qc']);
      expect(Array.isArray(result)).toBe(true);
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

    it('should abort an active session and clean up maps', async () => {
      roomService.manager.joinRoom('1', 'conn-1', aliceIdentity);
      roomService.manager.joinRoom('1', 'conn-2', bobIdentity);
      roomService.manager.joinRoom('1', 'conn-3', charlieIdentity);
      roomService.getRoster.mockResolvedValue(
        buildRoster([aliceIdentity, bobIdentity, charlieIdentity]),
      );

      await service.createSession(1, 'sheepshead', validConfig, 1);
      await service.startSession(1, 1);

      const result = await service.cancelSession(1, 1);

      expect(result.roomId).toBe(1);
      expect(mockSessionRepo.updateStatusAndTimestamp).toHaveBeenCalledWith(
        1,
        'aborted',
        'finishedAt',
      );

      // Room is unblocked — can create a new session
      mockSessionRepo.create.mockResolvedValue({ id: 2 } as any);
      const newSession = await service.createSession(1, 'sheepshead', validConfig, 1);
      expect(newSession.sessionId).toBe(2);
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
      roomService.getRoster.mockResolvedValue(
        buildRoster([aliceIdentity, bobIdentity, charlieIdentity]),
      );

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

  describe('action blocking during pending scheduled timers', () => {
    async function setupActiveGame(): Promise<number> {
      roomService.manager.joinRoom('1', 'conn-1', aliceIdentity);
      roomService.manager.joinRoom('1', 'conn-2', bobIdentity);
      roomService.manager.joinRoom('1', 'conn-3', charlieIdentity);
      roomService.getRoster.mockResolvedValue(
        buildRoster([aliceIdentity, bobIdentity, charlieIdentity]),
      );

      await service.createSession(1, 'sheepshead', validConfig, 1);
      await service.startSession(1, 1);
      return 1;
    }

    function getActivePlayer(
      playerViews: Array<[number, { state: unknown; validActions: string[] }]>,
    ): number | null {
      return (playerViews[0][1].state as any).activePlayer;
    }

    function getPhase(
      playerViews: Array<[number, { state: unknown; validActions: string[] }]>,
    ): string {
      return (playerViews[0][1].state as any).phase;
    }

    function getPlayerHand(
      playerViews: Array<[number, { state: unknown; validActions: string[] }]>,
      userId: number,
    ): any[] {
      const view = playerViews.find(([id]) => id === userId)?.[1]?.state as any;
      return view.players.find((p: any) => p.userID === userId).hand;
    }

    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    /**
     * Drive the game from deal through bury into the play phase,
     * then play one full trick (3 cards) to trigger scheduledEvents.
     * Returns the result of the last play_card action.
     */
    async function driveToCompletedTrick(sessionId: number): Promise<{
      result: {
        gameOver: boolean;
        playerViews: Array<[number, { state: unknown; validActions: string[] }]>;
      };
      broadcastFn: jest.Mock;
    }> {
      const broadcastFn = jest.fn();

      // Deal — with left-of-dealer, auto-picks and goes to bury
      let result = await service.applyAction(sessionId, 1, { type: 'deal' }, broadcastFn);
      let phase = getPhase(result.playerViews);

      // Bury phase — picker buries first 2 cards from hand
      if (phase === 'bury') {
        const active = getActivePlayer(result.playerViews)!;
        const hand = getPlayerHand(result.playerViews, active);
        result = await service.applyAction(
          sessionId,
          active,
          { type: 'bury', payload: { cards: hand.slice(0, validConfig.blindSize) } },
          broadcastFn,
        );
        phase = getPhase(result.playerViews);
      }

      expect(phase).toBe('play');

      // Play one full trick (3 cards, one per player)
      for (let i = 0; i < 3; i++) {
        const active = getActivePlayer(result.playerViews)!;
        const hand = getPlayerHand(result.playerViews, active);

        let played = false;
        for (const card of hand) {
          try {
            result = await service.applyAction(
              sessionId,
              active,
              { type: 'play_card', payload: { card } },
              broadcastFn,
            );
            played = true;
            break;
          } catch {
            continue;
          }
        }
        if (!played) throw new Error(`No legal play found for user ${active}`);
      }

      return { result, broadcastFn };
    }

    it('should reject player actions while scheduled timers are pending', async () => {
      const sessionId = await setupActiveGame();
      await driveToCompletedTrick(sessionId);

      // Any action should be rejected while timers are pending
      await expect(
        service.applyAction(sessionId, 1, { type: 'play_card', payload: { card: { name: 'ac' } } }),
      ).rejects.toThrow('A transition is in progress');
    });

    it('should accept player actions after all scheduled timers fire', async () => {
      const sessionId = await setupActiveGame();
      const { broadcastFn } = await driveToCompletedTrick(sessionId);

      // Timers are pending — actions blocked
      await expect(
        service.applyAction(sessionId, 1, { type: 'play_card', payload: { card: { name: 'ac' } } }),
      ).rejects.toThrow('A transition is in progress');

      // Advance timers to fire the trick_advance event
      jest.advanceTimersByTime(2000);

      // broadcastFn should have been called by processScheduledEvent
      expect(broadcastFn).toHaveBeenCalled();

      // Now actions should be accepted — get the current active player and play a card
      const view = service.getPlayerView(sessionId, 1);
      expect(view).not.toBeNull();

      const activePlayer = (view!.state as any).activePlayer;
      expect(activePlayer).not.toBeNull();

      const activeView = service.getPlayerView(sessionId, activePlayer)!;
      const hand = (activeView.state as any).players.find(
        (p: any) => p.userID === activePlayer,
      ).hand;

      // Try playing a card — should not throw "A transition is in progress"
      let accepted = false;
      for (const card of hand) {
        try {
          await service.applyAction(
            sessionId,
            activePlayer,
            { type: 'play_card', payload: { card } },
            broadcastFn,
          );
          accepted = true;
          break;
        } catch (e: any) {
          // "A transition is in progress" means timers are still pending — that's a failure
          if (e.message === 'A transition is in progress') {
            throw e;
          }
          // Other errors (illegal play) are fine — try next card
          continue;
        }
      }
      expect(accepted).toBe(true);
    });
  });

  describe('timer cleanup on session end', () => {
    async function setupActiveGame(): Promise<number> {
      roomService.manager.joinRoom('1', 'conn-1', aliceIdentity);
      roomService.manager.joinRoom('1', 'conn-2', bobIdentity);
      roomService.manager.joinRoom('1', 'conn-3', charlieIdentity);
      roomService.getRoster.mockResolvedValue(
        buildRoster([aliceIdentity, bobIdentity, charlieIdentity]),
      );

      await service.createSession(1, 'sheepshead', validConfig, 1);
      await service.startSession(1, 1);
      return 1;
    }

    function getActivePlayer(
      playerViews: Array<[number, { state: unknown; validActions: string[] }]>,
    ): number | null {
      return (playerViews[0][1].state as any).activePlayer;
    }

    function getPhase(
      playerViews: Array<[number, { state: unknown; validActions: string[] }]>,
    ): string {
      return (playerViews[0][1].state as any).phase;
    }

    function getPlayerHand(
      playerViews: Array<[number, { state: unknown; validActions: string[] }]>,
      userId: number,
    ): any[] {
      const view = playerViews.find(([id]) => id === userId)?.[1]?.state as any;
      return view.players.find((p: any) => p.userID === userId).hand;
    }

    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    async function driveToCompletedTrick(sessionId: number): Promise<{
      result: {
        gameOver: boolean;
        playerViews: Array<[number, { state: unknown; validActions: string[] }]>;
      };
      broadcastFn: jest.Mock;
    }> {
      const broadcastFn = jest.fn();

      let result = await service.applyAction(sessionId, 1, { type: 'deal' }, broadcastFn);
      let phase = getPhase(result.playerViews);

      if (phase === 'bury') {
        const active = getActivePlayer(result.playerViews)!;
        const hand = getPlayerHand(result.playerViews, active);
        result = await service.applyAction(
          sessionId,
          active,
          { type: 'bury', payload: { cards: hand.slice(0, validConfig.blindSize) } },
          broadcastFn,
        );
        phase = getPhase(result.playerViews);
      }

      expect(phase).toBe('play');

      for (let i = 0; i < 3; i++) {
        const active = getActivePlayer(result.playerViews)!;
        const hand = getPlayerHand(result.playerViews, active);

        let played = false;
        for (const card of hand) {
          try {
            result = await service.applyAction(
              sessionId,
              active,
              { type: 'play_card', payload: { card } },
              broadcastFn,
            );
            played = true;
            break;
          } catch {
            continue;
          }
        }
        if (!played) throw new Error(`No legal play found for user ${active}`);
      }

      return { result, broadcastFn };
    }

    it('should clear pending timers when cancelling a session', async () => {
      const sessionId = await setupActiveGame();
      await driveToCompletedTrick(sessionId);

      // Timers are pending — actions are blocked
      await expect(
        service.applyAction(sessionId, 1, { type: 'play_card', payload: { card: { name: 'ac' } } }),
      ).rejects.toThrow('A transition is in progress');

      // Cancel the session
      await service.cancelSession(sessionId, 1);

      // Advance timers — the scheduled event should NOT fire (no broadcast, no error)
      const broadcastSpy = jest.fn();
      jest.advanceTimersByTime(5000);

      // Session is gone — getPlayerView returns null
      expect(service.getPlayerView(sessionId, 1)).toBeNull();
      expect(broadcastSpy).not.toHaveBeenCalled();
    });

    it('should clear pending timers when force-cleaning a room', async () => {
      const sessionId = await setupActiveGame();
      await driveToCompletedTrick(sessionId);

      // Timers are pending
      await expect(
        service.applyAction(sessionId, 1, { type: 'play_card', payload: { card: { name: 'ac' } } }),
      ).rejects.toThrow('A transition is in progress');

      // Force-cleanup the room
      const cleaned = await service.forceCleanupRoom(1);
      expect(cleaned).toBe(sessionId);

      // Advance timers — the scheduled event should NOT fire
      jest.advanceTimersByTime(5000);

      // Session is gone
      expect(service.getPlayerView(sessionId, 1)).toBeNull();
    });

    it('should clear timer references when game ends via scheduled event', async () => {
      const sessionId = await setupActiveGame();
      const broadcastFn = jest.fn();

      let result = await service.applyAction(sessionId, 1, { type: 'deal' }, broadcastFn);
      let phase = getPhase(result.playerViews);

      if (phase === 'bury') {
        const active = getActivePlayer(result.playerViews)!;
        const hand = getPlayerHand(result.playerViews, active);
        result = await service.applyAction(
          sessionId,
          active,
          { type: 'bury', payload: { cards: hand.slice(0, validConfig.blindSize) } },
          broadcastFn,
        );
        phase = getPhase(result.playerViews);
      }

      expect(phase).toBe('play');

      // Play all tricks until score phase, advancing timers between tricks
      let gameOver = false;
      const totalCards = validConfig.handSize * validConfig.playerCount;
      for (let cardCount = 0; cardCount < totalCards && !gameOver; ) {
        const active = getActivePlayer(result.playerViews);
        if (active === null) {
          // In pending state — advance timers to fire trick_advance
          jest.advanceTimersByTime(2000);

          // Check if game ended via broadcast
          const lastCall = broadcastFn.mock.calls[broadcastFn.mock.calls.length - 1];
          if (lastCall && lastCall[0].gameOver) {
            gameOver = true;
            break;
          }

          // Get fresh view after trick_advance
          const views: Array<[number, { state: unknown; validActions: string[] }]> = [];
          for (const uid of [1, 2, 3]) {
            const v = service.getPlayerView(sessionId, uid);
            if (v) views.push([uid, v]);
          }
          if (views.length === 0) {
            gameOver = true;
            break;
          }
          result = { gameOver: false, playerViews: views };
          continue;
        }

        const hand = getPlayerHand(result.playerViews, active);
        let played = false;
        for (const card of hand) {
          try {
            result = await service.applyAction(
              sessionId,
              active,
              { type: 'play_card', payload: { card } },
              broadcastFn,
            );
            played = true;
            cardCount++;
            if (result.gameOver) {
              gameOver = true;
            }
            break;
          } catch {
            continue;
          }
        }
        if (!played) throw new Error(`No legal play found for user ${active}`);
      }

      // If not game over yet, advance timers for the final trick_advance → score → game_scored
      if (!gameOver) {
        jest.advanceTimersByTime(2000); // fires trick_advance → transitions to score
        jest.advanceTimersByTime(1); // fires chained game_scored → computes scores → game over
      }

      // Session should now be cleaned up (game_scored auto-fires and ends the game)
      expect(service.getPlayerView(sessionId, 1)).toBeNull();
    });
  });

  describe('Game session uses exactly the players list', () => {
    // Generator for a unique identity with a given userId
    const identityArb = (userId: number) =>
      fc.record({
        userId: fc.constant(userId),
        username: fc.constant(`user${userId}`),
        displayName: fc.constant(`User ${userId}`),
      });

    // Generator for a list of exactly 3 unique user identities (matching sheepshead playerCount=3)
    const threePlayersArb = fc
      .uniqueArray(fc.integer({ min: 1, max: 10000 }), { minLength: 3, maxLength: 3 })
      .chain((ids) => fc.tuple(...ids.map((id) => identityArb(id))));

    // Generator for an arbitrary-length spectator list with IDs disjoint from a given set
    const spectatorsArb = (excludeIds: number[]) =>
      fc
        .uniqueArray(
          fc.integer({ min: 1, max: 10000 }).filter((id) => !excludeIds.includes(id)),
          { minLength: 0, maxLength: 5 },
        )
        .chain((ids) => fc.tuple(...ids.map((id) => identityArb(id))));

    it('should use exactly the player IDs from the roster in order', async () => {
      await fc.assert(
        fc.asyncProperty(
          threePlayersArb.chain((players) =>
            spectatorsArb(players.map((p) => p.userId)).map((spectators) => ({
              players,
              spectators,
            })),
          ),
          async ({ players, spectators }) => {
            // Fresh service per iteration to avoid "room already has active session"
            const freshService = new GameService(
              mockSessionRepo as unknown as GameSessionRepository,
              roomService as unknown as RoomService,
            );

            const roomId = 1;
            const creatorId = players[0].userId;

            // Join all users to the room manager so isUserInRoom passes
            for (const p of players) {
              roomService.manager.joinRoom(String(roomId), `conn-${p.userId}`, p);
            }
            for (const s of spectators) {
              roomService.manager.joinRoom(String(roomId), `conn-${s.userId}`, s);
            }

            roomService.getRoster.mockResolvedValue(buildRoster(players, spectators));
            mockSessionRepo.create.mockResolvedValue({ id: 1 } as any);

            await freshService.createSession(roomId, 'sheepshead', validConfig, creatorId);
            const result = await freshService.startSession(1, creatorId);

            // playerViews should contain exactly the player IDs, in roster order
            const viewIds = result.playerViews.map(([id]) => id);
            expect(viewIds).toEqual(players.map((p) => p.userId));

            // No spectator IDs should appear
            for (const s of spectators) {
              expect(viewIds).not.toContain(s.userId);
            }

            // Cleanup for next iteration
            freshService.onModuleDestroy();
            for (const p of players) {
              roomService.manager.leaveRoom(String(roomId), `conn-${p.userId}`);
            }
            for (const s of spectators) {
              roomService.manager.leaveRoom(String(roomId), `conn-${s.userId}`);
            }
          },
        ),
        { numRuns: 100 },
      );
    });

    it('should reject when player count does not match config', async () => {
      // Generate player lists with length != 3 (the sheepshead playerCount)
      const wrongCountPlayersArb = fc
        .uniqueArray(fc.integer({ min: 1, max: 10000 }), { minLength: 0, maxLength: 10 })
        .filter((ids) => ids.length !== 3)
        .chain((ids) => fc.tuple(...(ids.length > 0 ? ids.map((id) => identityArb(id)) : [])));

      await fc.assert(
        fc.asyncProperty(wrongCountPlayersArb, async (players) => {
          const freshService = new GameService(
            mockSessionRepo as unknown as GameSessionRepository,
            roomService as unknown as RoomService,
          );

          const roomId = 1;
          // Use a fixed creator that's always in the room
          const creatorIdentity = { userId: 99999, username: 'creator', displayName: 'Creator' };
          roomService.manager.joinRoom(String(roomId), 'conn-creator', creatorIdentity);

          // Join generated players to the room too
          for (const p of players) {
            roomService.manager.joinRoom(String(roomId), `conn-${p.userId}`, p);
          }

          roomService.getRoster.mockResolvedValue(buildRoster(players));
          mockSessionRepo.create.mockResolvedValue({ id: 1 } as any);

          await freshService.createSession(
            roomId,
            'sheepshead',
            validConfig,
            creatorIdentity.userId,
          );

          await expect(freshService.startSession(1, creatorIdentity.userId)).rejects.toThrow(
            `Expected 3 players, but Players list has ${players.length}`,
          );

          freshService.onModuleDestroy();
          roomService.manager.leaveRoom(String(roomId), 'conn-creator');
          for (const p of players) {
            roomService.manager.leaveRoom(String(roomId), `conn-${p.userId}`);
          }
        }),
        { numRuns: 100 },
      );
    });
  });
});
