/**
 * Integration test: drives a full Sheepshead game lifecycle through GameService
 * with the real SheepsheadPlugin (no mocks on the plugin side).
 *
 * Exercises: createSession → startSession → deal → pick → bury → play all tricks → score → game over
 */
import { GameSessionRepository } from '@cardquorum/db';
import { RoomManager } from '@cardquorum/engine';
import { RosterState } from '@cardquorum/shared';
import { RoomService } from '../room/room.service';
import { GameService } from './game.service';

describe('GameService integration (full Sheepshead game)', () => {
  let service: GameService;
  let mockSessionRepo: jest.Mocked<
    Pick<GameSessionRepository, 'create' | 'updateStatusAndTimestamp' | 'updateStore'>
  >;
  let roomService: { manager: RoomManager; getRoster: jest.Mock; rotateSeat: jest.Mock };

  const userIDs = [1, 2, 3];
  const players = [
    { userId: 1, username: 'alice', displayName: 'Alice' },
    { userId: 2, username: 'bob', displayName: 'Bob' },
    { userId: 3, username: 'charlie', displayName: 'Charlie' },
  ];

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
    roomService = {
      manager: new RM(),
      getRoster: jest.fn().mockResolvedValue({
        players: players.map((p, i) => ({
          userId: p.userId,
          username: p.username,
          displayName: p.displayName,
          section: 'players' as const,
          position: i,
        })),
        spectators: [],
        rotatePlayers: false,
      } satisfies RosterState),
      rotateSeat: jest.fn().mockResolvedValue({
        players: [],
        spectators: [],
        rotatePlayers: false,
      } satisfies RosterState),
    };

    players.forEach((p, i) => {
      roomService.manager.joinRoom('1', `conn-${i + 1}`, p);
    });

    service = new GameService(
      mockSessionRepo as unknown as GameSessionRepository,
      roomService as unknown as RoomService,
    );
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  function getView(
    playerViews: Array<[number, { state: unknown; validActions: string[] }]>,
    userId: number,
  ): any {
    return playerViews.find(([id]) => id === userId)?.[1]?.state;
  }

  /**
   * Find the active player from the player views. All views share the same
   * activePlayer value (it's not fog-of-war'd).
   */
  function getActivePlayer(
    playerViews: Array<[number, { state: unknown; validActions: string[] }]>,
  ): number {
    const view = playerViews[0][1].state as any;
    return view.activePlayer;
  }

  function getPhase(
    playerViews: Array<[number, { state: unknown; validActions: string[] }]>,
  ): string {
    return (playerViews[0][1].state as any).phase;
  }

  /**
   * Drive a game from deal through to game over.
   * Always picks with the first eligible player, plays the first legal card.
   */
  async function driveFullGame(sessionId: number): Promise<{
    gameOver: boolean;
    playerViews: Array<[number, { state: unknown; validActions: string[] }]>;
    store?: unknown;
  }> {
    // Deal
    let result = await service.applyAction(sessionId, getActiveFromService(sessionId), {
      type: 'deal',
    });

    let phase = getPhase(result.playerViews);
    let safety = 0;

    // Pick phase
    while (phase === 'pick' && safety++ < 20) {
      const active = getActivePlayer(result.playerViews);
      // Try to pick first; if it fails (e.g., not valid), pass
      try {
        result = await service.applyAction(sessionId, active, { type: 'pick' });
      } catch {
        result = await service.applyAction(sessionId, active, { type: 'pass' });
      }
      phase = getPhase(result.playerViews);
    }

    // Bury phase
    if (phase === 'bury') {
      const active = getActivePlayer(result.playerViews);
      const view = getView(result.playerViews, active);
      const hand = view.players.find((p: any) => p.userID === active).hand;
      result = await service.applyAction(sessionId, active, {
        type: 'bury',
        payload: { cards: hand.slice(0, validConfig.blindSize) },
      });
      phase = getPhase(result.playerViews);
    }

    // Play phase — play all tricks
    safety = 0;
    while (phase === 'play' && safety++ < 100) {
      const active = getActivePlayer(result.playerViews);
      const view = getView(result.playerViews, active);
      const hand = view.players.find((p: any) => p.userID === active).hand;

      let played = false;
      for (const card of hand) {
        try {
          result = await service.applyAction(sessionId, active, {
            type: 'play_card',
            payload: { card },
          });
          played = true;
          break;
        } catch {
          continue;
        }
      }
      if (!played) throw new Error(`No legal play found for user ${active}`);

      phase = getPhase(result.playerViews);
    }

    // Score phase
    expect(phase).toBe('score');
    expect(result.gameOver).toBe(false);

    result = await service.applyAction(sessionId, userIDs[0], {
      type: 'game_scored',
    });

    return result;
  }

  /**
   * Get the activePlayer from the service's internal view for a session.
   */
  function getActiveFromService(sessionId: number): number {
    for (const userId of userIDs) {
      const result = service.getPlayerView(sessionId, userId);
      if (result) return (result.state as any).activePlayer;
    }
    throw new Error('No active game');
  }

  it('should play a full game from create to game over', async () => {
    // Create + start
    const created = await service.createSession(1, 'sheepshead', validConfig, 1);
    expect(created.sessionId).toBe(1);

    const started = await service.startSession(1, 1);
    expect(started.playerViews).toHaveLength(3);

    // Drive the full game
    const finalResult = await driveFullGame(1);

    expect(finalResult.gameOver).toBe(true);
    expect(finalResult.store).toBeDefined();

    // Verify DB persistence
    expect(mockSessionRepo.updateStatusAndTimestamp).toHaveBeenCalledWith(1, 'active', 'startedAt');
    expect(mockSessionRepo.updateStore).toHaveBeenCalledWith(1, finalResult.store);
    expect(mockSessionRepo.updateStatusAndTimestamp).toHaveBeenCalledWith(
      1,
      'finished',
      'finishedAt',
    );

    // Verify cleanup — session removed from in-memory maps
    expect(service.getPlayerView(1, 1)).toBeNull();
    expect(service.getPlayerViewByRoom(1, 1)).toBeNull();

    // Verify store structure
    const store = finalResult.store as any;
    expect(store.players).toHaveLength(3);
    for (const p of store.players) {
      expect(typeof p.userID).toBe('number');
      expect(typeof p.scoreDelta).toBe('number');
    }

    // Score deltas sum to zero (zero-sum game)
    const totalScore = store.players.reduce((sum: number, p: any) => sum + p.scoreDelta, 0);
    expect(totalScore).toBe(0);
  });

  it('should allow creating a new game in the same room after completion', async () => {
    await service.createSession(1, 'sheepshead', validConfig, 1);
    await service.startSession(1, 1);
    const result = await driveFullGame(1);
    expect(result.gameOver).toBe(true);

    // Create a new session in the same room
    mockSessionRepo.create.mockResolvedValue({ id: 2 } as any);
    const newSession = await service.createSession(1, 'sheepshead', validConfig, 1);
    expect(newSession.sessionId).toBe(2);
  });

  it('should use only roster players for game session', async () => {
    await service.createSession(1, 'sheepshead', validConfig, 1);
    const started = await service.startSession(1, 1);

    // playerViews should contain exactly the roster's players list IDs
    const viewUserIds = started.playerViews.map(([id]) => id);
    expect(viewUserIds).toEqual(userIDs);

    // Verify getRoster was called to source the player list
    expect(roomService.getRoster).toHaveBeenCalledWith(1);
  });

  it('should call rotateSeat after game-over', async () => {
    await service.createSession(1, 'sheepshead', validConfig, 1);
    await service.startSession(1, 1);

    const result = await driveFullGame(1);
    expect(result.gameOver).toBe(true);

    // rotateSeat should have been called with the room ID
    expect(roomService.rotateSeat).toHaveBeenCalledWith(1);
  });

  it('should not call rotateSeat during non-game-over actions', async () => {
    await service.createSession(1, 'sheepshead', validConfig, 1);
    await service.startSession(1, 1);

    // Apply a single non-finishing action (deal)
    const active = getActiveFromService(1);
    await service.applyAction(1, active, { type: 'deal' });

    expect(roomService.rotateSeat).not.toHaveBeenCalled();
  });

  it('should call rotateSeat even when spectators list is empty', async () => {
    // Roster already has empty spectators in the default mock setup
    expect(roomService.getRoster).not.toHaveBeenCalled();

    await service.createSession(1, 'sheepshead', validConfig, 1);
    await service.startSession(1, 1);

    const result = await driveFullGame(1);
    expect(result.gameOver).toBe(true);

    // rotateSeat is still called — it handles the empty spectators case internally
    expect(roomService.rotateSeat).toHaveBeenCalledWith(1);
  });

  it('should produce correct per-player fog-of-war views throughout', async () => {
    await service.createSession(1, 'sheepshead', validConfig, 1);
    await service.startSession(1, 1);

    // Deal
    const active = getActiveFromService(1);
    const dealResult = await service.applyAction(1, active, { type: 'deal' });

    // After dealing with left-of-dealer, the picker auto-picks and goes to bury.
    // The picker has handSize + blindSize cards; non-pickers have handSize.
    const picker = getActivePlayer(dealResult.playerViews);

    for (const userId of userIDs) {
      const view = getView(dealResult.playerViews, userId);
      const self = view.players.find((p: any) => p.userID === userId);
      const others = view.players.filter((p: any) => p.userID !== userId);

      if (userId === picker) {
        expect(self.hand.length).toBe(validConfig.handSize + validConfig.blindSize);
      } else {
        expect(self.hand.length).toBe(validConfig.handSize);
      }

      // Other players' hands are hidden
      for (const other of others) {
        expect(other.hand).toEqual([]);
        expect(other.role).toBeNull();
      }
    }

    // Different players see different hands
    const nonPickers = userIDs.filter((id) => id !== picker);
    const hand1 = getView(dealResult.playerViews, nonPickers[0]).players.find(
      (p: any) => p.userID === nonPickers[0],
    ).hand;
    const hand2 = getView(dealResult.playerViews, nonPickers[1]).players.find(
      (p: any) => p.userID === nonPickers[1],
    ).hand;
    const names1 = hand1.map((c: any) => c.name).sort();
    const names2 = hand2.map((c: any) => c.name).sort();
    expect(names1).not.toEqual(names2);
  });
});
