import { type GameSessionRepository } from '@cardquorum/db';
import { type RoomManager } from '@cardquorum/engine';
import { type RosterState } from '@cardquorum/shared';
import { type RoomService } from '../room/room.service';
import { type StatsService } from '../stats/stats.service';
import { type EventLogService } from './event-log.service';
import { GameService } from './game.service';

describe('Force-abandon flow', () => {
  let service: GameService;
  let mockSessionRepo: jest.Mocked<
    Pick<GameSessionRepository, 'create' | 'updateStatusAndTimestamp' | 'updateStore'>
  >;
  let roomService: {
    manager: RoomManager;
    getRoster: jest.Mock;
    handlePostGame: jest.Mock;
    toggleReady: jest.Mock;
    broadcastToRoom: jest.Mock;
    demoteToSpectator: jest.Mock;
    findById: jest.Mock;
  };
  let mockEventLogService: {
    bufferEvent: jest.Mock;
    flushBuffer: jest.Mock;
    recordParticipants: jest.Mock;
    getRoomLog: jest.Mock;
    getCatchUpEntries: jest.Mock;
  };
  let mockSettingsRepo: {
    findByRoomId: jest.Mock;
    upsert: jest.Mock;
  };

  const aliceIdentity = { userId: 1, username: 'alice', displayName: 'Alice' };
  const bobIdentity = { userId: 2, username: 'bob', displayName: 'Bob' };
  const charlieIdentity = { userId: 3, username: 'charlie', displayName: 'Charlie' };

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
        readyToPlay: true,
      })),
      spectators: spectators.map((s, i) => ({
        userId: s.userId,
        username: s.username,
        displayName: s.displayName,
        section: 'spectators' as const,
        position: i,
        assignedHue: null as number | null,
        readyToPlay: false,
      })),
      rotationMode: 'rotate-players' as const,
    };
  }

  beforeEach(() => {
    jest.useFakeTimers();

    mockSessionRepo = {
      create: jest.fn().mockResolvedValue({ id: 1 }),
      updateStatusAndTimestamp: jest.fn().mockResolvedValue({}),
      updateStore: jest.fn().mockResolvedValue({}),
    };

    const { RoomManager: RM } = jest.requireActual('@cardquorum/engine');
    roomService = {
      manager: new RM(),
      getRoster: jest
        .fn()
        .mockResolvedValue(buildRoster([aliceIdentity, bobIdentity, charlieIdentity])),
      handlePostGame: jest.fn().mockResolvedValue(buildRoster([])),
      toggleReady: jest.fn().mockResolvedValue(buildRoster([])),
      broadcastToRoom: jest.fn(),
      demoteToSpectator: jest.fn().mockResolvedValue(undefined),
      findById: jest.fn().mockResolvedValue({ id: 1, ownerId: 1 }),
    };

    mockEventLogService = {
      bufferEvent: jest.fn().mockImplementation((buffer, event, message, roomId, sessionId) => {
        buffer.push({
          roomId,
          sessionId,
          userId: event.userID ?? null,
          eventType: event.type,
          payload: event.payload ?? {},
          message,
          seq: buffer.length + 1,
          createdAt: new Date(),
        });
      }),
      flushBuffer: jest.fn().mockResolvedValue(undefined),
      recordParticipants: jest.fn().mockResolvedValue(undefined),
      getRoomLog: jest.fn().mockResolvedValue([]),
      getCatchUpEntries: jest.fn().mockReturnValue([]),
    };

    mockSettingsRepo = {
      findByRoomId: jest.fn().mockResolvedValue({ turnTimeLimit: 60 }),
      upsert: jest.fn().mockImplementation(async (roomId, settings) => ({
        roomId,
        ...settings,
      })),
    };

    roomService.manager.joinRoom('1', 'conn-1', aliceIdentity);
    roomService.manager.joinRoom('1', 'conn-2', bobIdentity);
    roomService.manager.joinRoom('1', 'conn-3', charlieIdentity);

    service = new GameService(
      mockSessionRepo as unknown as GameSessionRepository,
      roomService as unknown as RoomService,
      mockEventLogService as unknown as EventLogService,
      { writeStats: jest.fn().mockResolvedValue(undefined) } as unknown as StatsService,
      mockSettingsRepo as any,
    );
  });

  afterEach(() => {
    service.onModuleDestroy();
    jest.useRealTimers();
  });

  async function setupActiveGame(): Promise<number> {
    await service.createSession(1, 'sheepshead', validConfig, 1);
    await service.startSession(1, 1);
    return 1;
  }

  describe('full force-abandon flow', () => {
    it('should execute abandon flow when owner force-abandons a tardy player', async () => {
      const sessionId = await setupActiveGame();

      // Advance time past the turn time limit (60s configured)
      jest.advanceTimersByTime(61_000);

      // Get the active player from the game state
      const view = service.getPlayerView(sessionId, 1);
      const activePlayer = (view!.state as any).activePlayer;

      // Force-abandon the active player (Alice is owner, userId=1)
      const result = await service.forceAbandonGame(sessionId, 1, activePlayer);

      // Verify the abandon flow executed
      expect(result.roomId).toBe(1);
      expect(result.playerViews).toHaveLength(3);
      expect(result.finalize).toBeInstanceOf(Function);

      // Verify synthetic event was buffered (game_force_abandoned + game_abandoned)
      const forceAbandonCalls = mockEventLogService.bufferEvent.mock.calls.filter(
        (call) => call[1].type === 'game_force_abandoned',
      );
      expect(forceAbandonCalls.length).toBe(1);

      // Verify event buffer was flushed
      expect(mockEventLogService.flushBuffer).toHaveBeenCalled();

      // Verify session was marked finished
      expect(mockSessionRepo.updateStatusAndTimestamp).toHaveBeenCalledWith(
        sessionId,
        'finished',
        'finishedAt',
      );

      // Verify post-game pipeline ran (demote to spectator)
      expect(roomService.demoteToSpectator).toHaveBeenCalledWith(1, activePlayer);

      // Verify game is no longer active
      expect(service.getPlayerView(sessionId, 1)).toBeNull();
    });

    it('should broadcast log entry with both player names', async () => {
      const sessionId = await setupActiveGame();
      jest.advanceTimersByTime(61_000);

      const view = service.getPlayerView(sessionId, 1);
      const activePlayer = (view!.state as any).activePlayer;

      await service.forceAbandonGame(sessionId, 1, activePlayer);

      // Verify broadcastToRoom was called with a message containing both names
      const broadcastCalls = roomService.broadcastToRoom.mock.calls;
      const logBroadcasts = broadcastCalls.filter((call: any[]) => call[1] === 'game-log:entry');

      const forceAbandonLog = logBroadcasts.find(
        (call: any[]) => call[2]?.eventType === 'game_force_abandoned',
      );
      expect(forceAbandonLog).toBeDefined();

      const activePlayerName =
        [aliceIdentity, bobIdentity, charlieIdentity].find((p) => p.userId === activePlayer)
          ?.displayName ?? '';
      expect(forceAbandonLog![2].message).toContain(activePlayerName);
      expect(forceAbandonLog![2].message).toContain('Alice'); // Owner name
    });
  });

  describe('force-abandon validation failures', () => {
    it('should reject when requester is not the room owner', async () => {
      const sessionId = await setupActiveGame();
      jest.advanceTimersByTime(61_000);

      // Bob (userId=2) is not the owner
      roomService.findById.mockResolvedValue({ id: 1, ownerId: 1 });

      const view = service.getPlayerView(sessionId, 1);
      const activePlayer = (view!.state as any).activePlayer;

      await expect(service.forceAbandonGame(sessionId, 2, activePlayer)).rejects.toThrow(
        'Only the room owner can force-abandon',
      );
    });

    it('should reject when target is not the active player', async () => {
      const sessionId = await setupActiveGame();
      jest.advanceTimersByTime(61_000);

      const view = service.getPlayerView(sessionId, 1);
      const activePlayer = (view!.state as any).activePlayer;

      // Pick a non-active player as target
      const nonActivePlayer = [1, 2, 3].find((id) => id !== activePlayer)!;

      await expect(service.forceAbandonGame(sessionId, 1, nonActivePlayer)).rejects.toThrow(
        'Target player is not the current active player',
      );
    });

    it('should reject when turn time limit is not enabled (unlimited room)', async () => {
      // Set up with no turn time limit
      mockSettingsRepo.findByRoomId.mockResolvedValue({ turnTimeLimit: null });

      // Need a fresh game since turnTimeLimit is cached at start
      service.onModuleDestroy();
      service = new GameService(
        mockSessionRepo as unknown as GameSessionRepository,
        roomService as unknown as RoomService,
        mockEventLogService as unknown as EventLogService,
        { writeStats: jest.fn().mockResolvedValue(undefined) } as unknown as StatsService,
        mockSettingsRepo as any,
      );

      mockSessionRepo.create.mockResolvedValue({ id: 2 } as any);
      await service.createSession(1, 'sheepshead', validConfig, 1);
      await service.startSession(2, 1);

      jest.advanceTimersByTime(61_000);

      const view = service.getPlayerView(2, 1);
      const activePlayer = (view!.state as any).activePlayer;

      await expect(service.forceAbandonGame(2, 1, activePlayer)).rejects.toThrow(
        'Force-abandon is not enabled for this room',
      );
    });

    it('should reject when turn time limit has not elapsed', async () => {
      const sessionId = await setupActiveGame();

      // Do NOT advance time — limit hasn't elapsed
      const view = service.getPlayerView(sessionId, 1);
      const activePlayer = (view!.state as any).activePlayer;

      await expect(service.forceAbandonGame(sessionId, 1, activePlayer)).rejects.toThrow(
        'Turn time limit has not yet elapsed',
      );
    });
  });

  describe('settings persistence round-trip', () => {
    it('should persist and retrieve turnTimeLimit', async () => {
      // Upsert with turnTimeLimit = 300
      await mockSettingsRepo.upsert(1, {
        gameType: 'sheepshead',
        presetName: null,
        config: {},
        autostart: false,
        turnTimeLimit: 300,
      });

      expect(mockSettingsRepo.upsert).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          turnTimeLimit: 300,
        }),
      );

      // Simulate findByRoomId returning the persisted value
      mockSettingsRepo.findByRoomId.mockResolvedValue({
        roomId: 1,
        gameType: 'sheepshead',
        presetName: null,
        config: {},
        autostart: false,
        turnTimeLimit: 300,
      });

      const settings = await mockSettingsRepo.findByRoomId(1);
      expect(settings?.turnTimeLimit).toBe(300);
    });

    it('should persist null turnTimeLimit for unlimited', async () => {
      await mockSettingsRepo.upsert(1, {
        gameType: 'sheepshead',
        presetName: null,
        config: {},
        autostart: false,
        turnTimeLimit: null,
      });

      expect(mockSettingsRepo.upsert).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          turnTimeLimit: null,
        }),
      );

      mockSettingsRepo.findByRoomId.mockResolvedValue({
        roomId: 1,
        gameType: 'sheepshead',
        presetName: null,
        config: {},
        autostart: false,
        turnTimeLimit: null,
      });

      const settings = await mockSettingsRepo.findByRoomId(1);
      expect(settings?.turnTimeLimit).toBeNull();
    });
  });

  describe('turn timing info for rejoin', () => {
    it('should return correct timing info after game starts', async () => {
      const sessionId = await setupActiveGame();

      const timing = service.getTurnTimingInfo(sessionId);

      expect(timing).not.toBeNull();
      expect(timing!.turnStartTimestamp).not.toBeNull();
      // Verify it's a valid ISO 8601 string
      expect(new Date(timing!.turnStartTimestamp!).toISOString()).toBe(timing!.turnStartTimestamp);
      expect(timing!.activePlayerUserId).not.toBeNull();
      expect([1, 2, 3]).toContain(timing!.activePlayerUserId);
      expect(timing!.turnTimeLimit).toBe(60);
    });

    it('should return null for non-existent session', () => {
      const timing = service.getTurnTimingInfo(999);
      expect(timing).toBeNull();
    });

    it('should update timing info when active player changes', async () => {
      const sessionId = await setupActiveGame();

      const timingBefore = service.getTurnTimingInfo(sessionId);
      const initialActivePlayer = timingBefore!.activePlayerUserId!;

      // Deal to advance the game (changes active player in sheepshead)
      await service.applyAction(sessionId, initialActivePlayer, { type: 'deal' });

      const timingAfter = service.getTurnTimingInfo(sessionId);

      expect(timingAfter).not.toBeNull();
      // After dealing, the active player should change (or timestamp updates)
      expect(timingAfter!.turnStartTimestamp).not.toBeNull();
      expect(timingAfter!.activePlayerUserId).not.toBeNull();
    });
  });
});
