import { forwardRef, Inject, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { type GameSessionRepository, type RoomGameSettingsRepository } from '@cardquorum/db';
import { type GamePlugin, type WithScheduledEvents } from '@cardquorum/engine';
import { WS_EMIT, type ColorAssignmentMap } from '@cardquorum/shared';
import { SheepsheadPlugin } from '@cardquorum/sheepshead';
import { RoomService } from '../room/room.service';
import { type StatsService } from '../stats/stats.service';
import { type EventBufferEntry, type EventLogService } from './event-log.service';
import { resolveCancellationStatus } from './game-status';

type BroadcastFn = (result: {
  gameOver: boolean;
  playerViews: Array<[number, { state: unknown; validActions: string[] }]>;
  store?: unknown;
}) => void;

interface ActiveGame {
  sessionId: number;
  roomId: number;
  gameType: string;
  config: unknown;
  state: unknown | null;
  playerIDs: number[];
  playerNames: Map<number, string>;
  createdBy: number;
  status: 'waiting' | 'active';
  createdAt: number;
  eventBuffer: EventBufferEntry[];
  turnStartTimestamp: Date | null;
  activePlayerUserId: number | null;
  turnTimeLimit: number | null;
}

/** How long a waiting session can sit before being auto-cancelled (30 minutes). */
export const WAITING_SESSION_TTL_MS = 30 * 60 * 1000;

/** How often to sweep for abandoned sessions (5 minutes). */
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

@Injectable()
export class GameService implements OnModuleDestroy {
  private readonly logger = new Logger(GameService.name);

  private readonly plugins = new Map<string, GamePlugin>([['sheepshead', SheepsheadPlugin]]);

  /** sessionId → ActiveGame */
  private readonly activeGames = new Map<number, ActiveGame>();

  /** roomId → sessionId (reverse lookup for reconnection) */
  private readonly roomToSession = new Map<number, number>();

  /** sessionId → array of pending scheduled-event timer handles */
  private readonly pendingTimers = new Map<number, ReturnType<typeof setTimeout>[]>();

  private sweepTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly sessionRepo: GameSessionRepository,
    @Inject(forwardRef(() => RoomService))
    private readonly roomService: RoomService,
    private readonly eventLogService: EventLogService,
    private readonly statsService: StatsService,
    private readonly roomGameSettingsRepo: RoomGameSettingsRepository,
  ) {
    this.sweepTimer = setInterval(() => this.sweepAbandoned(), SWEEP_INTERVAL_MS);
  }

  onModuleDestroy() {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
  }

  private async sweepAbandoned(): Promise<void> {
    const now = Date.now();
    for (const game of this.activeGames.values()) {
      if (game.status === 'waiting' && now - game.createdAt > WAITING_SESSION_TTL_MS) {
        await this.sessionRepo.updateStatusAndTimestamp(game.sessionId, 'cancelled', 'finishedAt');
        this.activeGames.delete(game.sessionId);
        this.roomToSession.delete(game.roomId);
        this.logger.log(`Game session ${game.sessionId} cancelled (abandoned in waiting state)`);
      }
    }
  }

  async createSession(
    roomId: number,
    gameType: string,
    config: unknown,
    createdBy: number,
  ): Promise<{ sessionId: number; gameType: string; config: unknown }> {
    const plugin = this.plugins.get(gameType);
    if (!plugin) {
      throw new Error(`Unknown game type: ${gameType}`);
    }

    if (this.roomToSession.has(roomId)) {
      throw new Error(`Room ${roomId} already has an active game session`);
    }

    if (!plugin.validateConfig(config)) {
      throw new Error('Invalid game configuration');
    }

    // Reserve the room slot before the async DB call to prevent races
    this.roomToSession.set(roomId, -1);

    // Extract variant (preset name) from config and strip it before persisting
    let variant: string | undefined;
    let persistConfig = config;
    if (config && typeof config === 'object' && 'name' in config) {
      const { name, ...rest } = config as Record<string, unknown>;
      if (typeof name === 'string') {
        variant = name;
      }
      persistConfig = rest;
    }

    let row: { id: number };
    try {
      row = await this.sessionRepo.create({ roomId, gameType, config: persistConfig, variant });
    } catch (err) {
      this.roomToSession.delete(roomId);
      throw err;
    }

    const game: ActiveGame = {
      sessionId: row.id,
      roomId,
      gameType,
      config,
      state: null,
      playerIDs: [],
      playerNames: new Map(),
      createdBy,
      status: 'waiting',
      createdAt: Date.now(),
      eventBuffer: [],
      turnStartTimestamp: null,
      activePlayerUserId: null,
      turnTimeLimit: null,
    };

    this.activeGames.set(row.id, game);
    this.roomToSession.set(roomId, row.id);

    this.logger.log(`Game session ${row.id} created in room ${roomId} (${gameType})`);

    return { sessionId: row.id, gameType, config };
  }

  async startSession(
    sessionId: number,
    requestedBy: number,
  ): Promise<{
    playerViews: Array<[number, { state: unknown; validActions: string[] }]>;
    colorMap: ColorAssignmentMap;
  }> {
    const game = this.activeGames.get(sessionId);
    if (!game) {
      throw new Error(`Game session ${sessionId} not found`);
    }
    if (game.status !== 'waiting') {
      throw new Error(`Game session ${sessionId} is not in waiting status`);
    }
    if (game.createdBy !== requestedBy) {
      throw new Error('Only the session creator can start the game');
    }
    if (!this.isUserInRoom(game.roomId, requestedBy)) {
      throw new Error('User is no longer in the room');
    }

    const plugin = this.plugins.get(game.gameType)!;

    // Read players from the persisted roster
    const roster = await this.roomService.getRoster(game.roomId);
    const playerIDs = roster.players.map((p) => p.userId);

    const configPlayerCount = (game.config as { playerCount: number }).playerCount;
    if (playerIDs.length !== configPlayerCount) {
      throw new Error(
        `Expected ${configPlayerCount} players, but Players list has ${playerIDs.length}`,
      );
    }

    game.playerIDs = playerIDs;
    game.state = plugin.createInitialState(game.config as any, playerIDs);
    game.status = 'active';

    // Build player names map from roster
    const playerNames = new Map<number, string>();
    for (const player of roster.players) {
      playerNames.set(player.userId, player.displayName || player.username);
    }
    game.playerNames = playerNames;

    await this.sessionRepo.updateStatusAndTimestamp(sessionId, 'active', 'startedAt');

    // Record participants in the event log
    await this.eventLogService.recordParticipants(sessionId, playerIDs);

    // Build color assignment map from roster assigned hues
    const colorMap: ColorAssignmentMap = {};
    for (const player of roster.players) {
      if (player.assignedHue !== null) {
        colorMap[player.userId] = player.assignedHue;
      }
    }

    // Append synthetic "game_started" event with colorMap in payload
    const gameStartedMessage = `${game.gameType.charAt(0).toUpperCase() + game.gameType.slice(1)} game started`;
    this.bufferSyntheticEvent(game, 'game_started', gameStartedMessage, { colorMap });
    this.broadcastLogEntry(game, null, 'game_started', gameStartedMessage);

    // Set initial turn tracking from the game_started event and plugin state
    const gameStartedEntry = game.eventBuffer[game.eventBuffer.length - 1];
    game.turnStartTimestamp = gameStartedEntry.createdAt;
    game.activePlayerUserId = (game.state as { activePlayer: number | null })?.activePlayer ?? null;

    // Cache the room's turnTimeLimit for this session
    const roomSettings = await this.roomGameSettingsRepo.findByRoomId(game.roomId);
    game.turnTimeLimit = roomSettings?.turnTimeLimit ?? null;

    const playerViews = this.buildPlayerViews(game, plugin);

    this.logger.log(`Game session ${sessionId} started with ${playerIDs.length} players`);

    return { playerViews, colorMap };
  }

  async applyAction(
    sessionId: number,
    userID: number,
    action: { type: string; payload?: unknown },
    broadcastFn?: BroadcastFn,
  ): Promise<{
    gameOver: boolean;
    playerViews: Array<[number, { state: unknown; validActions: string[] }]>;
    store?: unknown;
    roomId?: number;
  }> {
    if (this.isActionBlocked(sessionId)) {
      throw new Error('A transition is in progress');
    }

    const game = this.activeGames.get(sessionId);
    if (!game) {
      throw new Error(`Game session ${sessionId} not found`);
    }
    if (game.status !== 'active') {
      throw new Error(`Game session ${sessionId} is not active`);
    }
    if (!game.playerIDs.includes(userID)) {
      throw new Error(`User ${userID} is not a player in session ${sessionId}`);
    }

    const plugin = this.plugins.get(game.gameType)!;
    const validActions = plugin.getValidActions(game.config as any, game.state as any, userID);

    if (!validActions.includes(action.type)) {
      throw new Error(`Action '${action.type}' is not valid for user ${userID}`);
    }

    const event = { type: action.type, userID, payload: action.payload };
    const { state: newState, sideEffects } = plugin.applyEvent(
      game.config as any,
      game.state as any,
      event,
    );
    game.state = newState;

    // If the plugin returned sideEffects, store them as the event payload (overrides client payload)
    if (sideEffects !== undefined) {
      event.payload = sideEffects;
    }

    // Buffer the event with a human-readable description
    let message: string | null = null;
    if (plugin.describeEvent) {
      try {
        message = plugin.describeEvent(event as any, newState, game.playerNames);
      } catch (err) {
        this.logger.warn(`describeEvent failed for ${event.type}: ${err}`);
        message = null;
      }
    }
    this.eventLogService.bufferEvent(game.eventBuffer, event, message, game.roomId, game.sessionId);

    // Track turn timing: update turnStartTimestamp if active player changed
    const newActivePlayer = (newState as { activePlayer: number | null })?.activePlayer ?? null;
    if (newActivePlayer !== game.activePlayerUserId) {
      const latestEntry = game.eventBuffer[game.eventBuffer.length - 1];
      game.turnStartTimestamp = latestEntry.createdAt;
      game.activePlayerUserId = newActivePlayer;
    }

    // Broadcast log entry in real time if message is non-null
    if (message !== null) {
      this.broadcastLogEntry(game, event.userID ?? null, event.type, message);
    }

    // Check for scheduled events and set up timers
    const stateWithScheduled = newState as WithScheduledEvents;
    if (
      broadcastFn &&
      stateWithScheduled.scheduledEvents &&
      stateWithScheduled.scheduledEvents.length > 0
    ) {
      const timers: ReturnType<typeof setTimeout>[] = [];
      for (const scheduledEvent of stateWithScheduled.scheduledEvents) {
        const handle = setTimeout(
          () => this.processScheduledEvent(sessionId, scheduledEvent.event, broadcastFn),
          scheduledEvent.delayMs,
        );
        timers.push(handle);
      }
      this.pendingTimers.set(sessionId, timers);
    }

    const gameOver = plugin.isGameOver(newState);

    if (gameOver) {
      const store = plugin.buildStore(game.config as any, newState);
      const playerViews = this.buildPlayerViews(game, plugin);

      // Append synthetic "game_finished" event and flush buffer
      this.bufferSyntheticEvent(game, 'game_finished', 'Game finished');
      this.broadcastLogEntry(game, null, 'game_finished', 'Game finished');
      await this.eventLogService.flushBuffer(game.eventBuffer);

      await this.sessionRepo.updateStore(sessionId, store);
      await this.sessionRepo.updateStatusAndTimestamp(sessionId, 'finished', 'finishedAt');

      // Write stats for the finished game
      try {
        const statRows = plugin.buildStats(game.config as any, newState);
        await this.statsService.writeStats(sessionId, game.roomId, game.gameType, statRows);
      } catch (err) {
        this.logger.error(`Failed to write stats for session ${sessionId}: ${err}`);
      }

      this.activeGames.delete(sessionId);

      this.logger.log(`Game session ${sessionId} finished`);

      // Post-game pipeline (demote not-ready + rotate) before freeing the room
      // slot, so autostart sees the correct roster.
      const requiredPlayerCount = (game.config as { playerCount: number }).playerCount;
      await this.roomService.handlePostGame(game.roomId, requiredPlayerCount);

      this.finalizeGameEnd(game.roomId, sessionId);

      return { gameOver: true, playerViews, store, roomId: game.roomId };
    }

    const playerViews = this.buildPlayerViews(game, plugin);
    return { gameOver: false, playerViews };
  }

  async cancelSession(sessionId: number, requestedBy: number): Promise<{ roomId: number }> {
    const game = this.activeGames.get(sessionId);
    if (!game) {
      throw new Error(`Game session ${sessionId} not found`);
    }
    if (game.createdBy !== requestedBy) {
      throw new Error('Only the session creator can cancel the game');
    }

    if (!this.isUserInRoom(game.roomId, requestedBy)) {
      throw new Error('User is no longer in the room');
    }

    // Append synthetic "game_cancelled" event and flush buffer if there are events
    this.bufferSyntheticEvent(game, 'game_cancelled', 'Game cancelled');
    this.broadcastLogEntry(game, null, 'game_cancelled', 'Game cancelled');
    if (game.eventBuffer.length > 0) {
      await this.eventLogService.flushBuffer(game.eventBuffer);
    }

    const finalStatus = resolveCancellationStatus(game.status, 'owner-cancel');
    await this.sessionRepo.updateStatusAndTimestamp(sessionId, finalStatus, 'finishedAt');

    this.clearPendingTimers(sessionId);
    this.activeGames.delete(sessionId);
    this.roomToSession.delete(game.roomId);

    this.logger.log(`Game session ${sessionId} ${finalStatus} by user ${requestedBy}`);

    return { roomId: game.roomId };
  }

  /**
   * Handle a player abandoning an active game.
   * Invokes the plugin's onPlayerAbandon if available, otherwise falls back to 'abandoned' status.
   * Triggers post-game pipeline and demotes the abandoning player.
   */
  async abandonGame(
    sessionId: number,
    userId: number,
  ): Promise<{
    roomId: number;
    playerViews: Array<[number, { state: unknown; validActions: string[] }]>;
    store?: unknown;
    finalize: () => void;
  }> {
    const game = this.activeGames.get(sessionId);
    if (!game) {
      throw new Error('Game session not found');
    }
    if (game.status !== 'active') {
      throw new Error('Game session is not active');
    }
    if (!game.playerIDs.includes(userId)) {
      throw new Error('User is not a player in this session');
    }

    const plugin = this.plugins.get(game.gameType)!;
    const requiredPlayerCount = (game.config as { playerCount: number }).playerCount;

    // Append synthetic "game_abandoned" event and flush buffer
    const abandonerName = game.playerNames.get(userId) ?? `User ${userId}`;
    this.bufferSyntheticEvent(game, 'game_abandoned', `Game abandoned by ${abandonerName}`, {
      userId,
    });
    this.broadcastLogEntry(game, userId, 'game_abandoned', `Game abandoned by ${abandonerName}`);
    await this.eventLogService.flushBuffer(game.eventBuffer);

    let store: unknown | undefined;

    if (plugin.onPlayerAbandon) {
      const newState = plugin.onPlayerAbandon(game.config as any, game.state as any, userId);
      game.state = newState;
      store = plugin.buildStore(game.config as any, newState);
      await this.sessionRepo.updateStore(sessionId, store);
      await this.sessionRepo.updateStatusAndTimestamp(sessionId, 'finished', 'finishedAt');

      // Write stats for the finished game (plugin-handled abandonment)
      try {
        const statRows = plugin.buildStats(game.config as any, newState);
        await this.statsService.writeStats(sessionId, game.roomId, game.gameType, statRows);
      } catch (err) {
        this.logger.error(`Failed to write stats for session ${sessionId}: ${err}`);
      }
    } else {
      await this.sessionRepo.updateStatusAndTimestamp(sessionId, 'abandoned', 'finishedAt');
    }

    // Remove from activeGames so concurrent actions are rejected, but keep
    // roomToSession until post-game pipeline completes to prevent premature
    // new game creation.
    this.clearPendingTimers(sessionId);
    this.activeGames.delete(sessionId);

    this.logger.log(`Game session ${sessionId} abandoned by user ${userId}`);

    // Post-game pipeline: demote not-ready players, rotate, then demote abandoner
    await this.roomService.handlePostGame(game.roomId, requiredPlayerCount);
    await this.roomService.demoteToSpectator(game.roomId, userId);

    // Build player views from the (now-finished) game state
    const playerViews = this.buildPlayerViews(game, plugin);

    return {
      roomId: game.roomId,
      playerViews,
      store,
      finalize: () => this.finalizeGameEnd(game.roomId, sessionId),
    };
  }

  /**
   * Force-abandon a game on behalf of a tardy player.
   * Called by the room owner when the target player's turn has exceeded the turn time limit.
   */
  async forceAbandonGame(
    sessionId: number,
    requestedBy: number,
    targetUserId: number,
  ): Promise<{
    roomId: number;
    playerViews: Array<[number, { state: unknown; validActions: string[] }]>;
    store?: unknown;
    finalize: () => void;
  }> {
    const game = this.activeGames.get(sessionId);
    if (!game) {
      throw new Error('Game session not found');
    }
    if (game.status !== 'active') {
      throw new Error('Game session is not active');
    }

    // Validate: requester must be the room owner
    const room = await this.roomService.findById(game.roomId);
    if (!room || room.ownerId !== requestedBy) {
      throw new Error('Only the room owner can force-abandon');
    }

    // Validate: target must be the current active player
    if (game.activePlayerUserId !== targetUserId) {
      throw new Error('Target player is not the current active player');
    }

    // Validate: turn time limit must be enabled
    if (game.turnTimeLimit == null) {
      throw new Error('Force-abandon is not enabled for this room');
    }

    // Validate: elapsed time must exceed the turn time limit
    if (!game.turnStartTimestamp) {
      throw new Error('Turn time limit has not yet elapsed');
    }
    const elapsedSeconds = (Date.now() - game.turnStartTimestamp.getTime()) / 1000;
    if (elapsedSeconds <= game.turnTimeLimit) {
      throw new Error('Turn time limit has not yet elapsed');
    }

    // Buffer synthetic game_force_abandoned event
    const tardyPlayerName = game.playerNames.get(targetUserId) ?? `User ${targetUserId}`;
    const ownerName = game.playerNames.get(requestedBy) ?? `User ${requestedBy}`;
    const message = `${ownerName} forced ${tardyPlayerName} to abandon the game`;

    this.bufferSyntheticEvent(game, 'game_force_abandoned', message, {
      userId: targetUserId,
      requestedBy,
    });

    // Broadcast the game log entry
    this.broadcastLogEntry(game, targetUserId, 'game_force_abandoned', message);

    // Delegate to the existing abandonGame flow for the target player
    return this.abandonGame(sessionId, targetUserId);
  }

  /**
   * Clean up any waiting sessions created by a disconnecting user.
   * Returns the roomIds of cancelled sessions (for broadcasting).
   */
  async cleanupDisconnectedCreator(
    userId: number,
  ): Promise<Array<{ sessionId: number; roomId: number }>> {
    const cancelled: Array<{ sessionId: number; roomId: number }> = [];

    for (const game of this.activeGames.values()) {
      if (game.createdBy === userId && game.status === 'waiting') {
        await this.sessionRepo.updateStatusAndTimestamp(game.sessionId, 'cancelled', 'finishedAt');
        this.activeGames.delete(game.sessionId);
        this.roomToSession.delete(game.roomId);
        cancelled.push({ sessionId: game.sessionId, roomId: game.roomId });
        this.logger.log(
          `Game session ${game.sessionId} cancelled (creator ${userId} disconnected)`,
        );
      }
    }

    return cancelled;
  }

  /**
   * Force-cancel any active game session in a room (e.g. when the room is deleted).
   * Skips ownership checks. Returns the cancelled sessionId, if any.
   */
  isGameActive(roomId: number): boolean {
    return this.roomToSession.has(roomId);
  }

  async forceCleanupRoom(roomId: number): Promise<number | null> {
    const sessionId = this.roomToSession.get(roomId);
    if (sessionId === undefined || sessionId === -1) return null;

    const game = this.activeGames.get(sessionId);
    if (!game) return null;

    const finalStatus = resolveCancellationStatus(game.status, 'room-delete');
    await this.sessionRepo.updateStatusAndTimestamp(sessionId, finalStatus, 'finishedAt');

    this.clearPendingTimers(sessionId);
    this.activeGames.delete(sessionId);
    this.roomToSession.delete(roomId);

    this.logger.log(`Game session ${sessionId} ${finalStatus} (room ${roomId} deleted)`);
    return sessionId;
  }

  getPlayerView(
    sessionId: number,
    userID: number,
  ): { state: unknown; validActions: string[] } | null {
    const game = this.activeGames.get(sessionId);
    if (!game || game.status !== 'active') return null;
    if (!game.playerIDs.includes(userID)) return null;

    const plugin = this.plugins.get(game.gameType)!;
    return {
      state: plugin.getPlayerView(game.config as any, game.state as any, userID),
      validActions: plugin.getValidActions(game.config as any, game.state as any, userID),
    };
  }

  getValidTargets(
    sessionId: number,
    userID: number,
    sourceStackId: string,
    selectedCards: string[],
  ): string[] {
    const game = this.activeGames.get(sessionId);
    if (!game || game.status !== 'active') return [];
    if (!game.playerIDs.includes(userID)) return [];

    const plugin = this.plugins.get(game.gameType)!;
    if (!plugin.getValidTargets) return [];

    return plugin.getValidTargets(
      game.config as any,
      game.state as any,
      userID,
      sourceStackId,
      selectedCards,
    );
  }

  getPlayerViewByRoom(
    roomId: number,
    userID: number,
  ): { sessionId: number; state: unknown; validActions: string[] } | null {
    const sessionId = this.roomToSession.get(roomId);
    if (sessionId === undefined) return null;

    const view = this.getPlayerView(sessionId, userID);
    if (view === null) return null;

    return { sessionId, ...view };
  }

  /** Get the event buffer for the active game in a room (for catch-up on rejoin). */
  getEventBufferByRoom(roomId: number): EventBufferEntry[] | null {
    const sessionId = this.roomToSession.get(roomId);
    if (sessionId === undefined) return null;

    const game = this.activeGames.get(sessionId);
    if (!game || game.status !== 'active') return null;

    return game.eventBuffer;
  }

  /** Return turn timing info for a given session (used by gateway broadcasts). */
  getTurnTimingInfo(sessionId: number): {
    turnStartTimestamp: string | null;
    activePlayerUserId: number | null;
    turnTimeLimit: number | null;
  } | null {
    const game = this.activeGames.get(sessionId);
    if (!game || game.status !== 'active') return null;

    return {
      turnStartTimestamp: game.turnStartTimestamp?.toISOString() ?? null,
      activePlayerUserId: game.activePlayerUserId,
      turnTimeLimit: game.turnTimeLimit,
    };
  }

  /** Return session info for rejoin, covering both waiting and active games. */
  async getSessionInfoByRoom(
    roomId: number,
    userID: number,
  ): Promise<{
    sessionId: number;
    status: 'waiting' | 'active';
    gameType: string;
    config: unknown;
    state?: unknown;
    validActions?: string[];
    colorMap?: ColorAssignmentMap;
  } | null> {
    const sessionId = this.roomToSession.get(roomId);
    if (sessionId === undefined) return null;

    const game = this.activeGames.get(sessionId);
    if (!game) return null;

    if (game.status === 'waiting') {
      return {
        sessionId,
        status: 'waiting',
        gameType: game.gameType,
        config: game.config,
      };
    }

    const view = this.getPlayerView(sessionId, userID);
    if (!view) return null;

    // Build color assignment map from roster assigned hues
    const roster = await this.roomService.getRoster(roomId);
    const colorMap: ColorAssignmentMap = {};
    for (const player of roster.players) {
      if (player.assignedHue !== null) {
        colorMap[player.userId] = player.assignedHue;
      }
    }

    return {
      sessionId,
      status: 'active',
      gameType: game.gameType,
      config: game.config,
      colorMap,
      ...view,
    };
  }

  private processScheduledEvent(
    sessionId: number,
    event: { type: string; payload?: unknown },
    broadcastFn: BroadcastFn,
  ): void {
    const game = this.activeGames.get(sessionId);
    if (!game) return; // stale session — silently bail

    const plugin = this.plugins.get(game.gameType)!;

    const { state: newState, sideEffects } = plugin.applyEvent(
      game.config as any,
      game.state as any,
      event,
    );
    game.state = newState;

    // If the plugin returned sideEffects, store them as the event payload (overrides client payload)
    if (sideEffects !== undefined) {
      (event as any).payload = sideEffects;
    }

    // Buffer the scheduled event (message may be null)
    let message: string | null = null;
    if (plugin.describeEvent) {
      try {
        message = plugin.describeEvent(event as any, newState, game.playerNames);
      } catch {
        message = null;
      }
    }
    this.eventLogService.bufferEvent(game.eventBuffer, event, message, game.roomId, sessionId);
    if (message !== null) {
      this.broadcastLogEntry(game, null, event.type, message);
    }

    // Remove the fired timer from pendingTimers
    const timers = this.pendingTimers.get(sessionId);
    if (timers) {
      timers.shift();
    }

    const gameOver = plugin.isGameOver(newState);

    if (gameOver) {
      const store = plugin.buildStore(game.config as any, newState);
      const playerViews = this.buildPlayerViews(game, plugin);

      // Buffer and broadcast the synthetic game_finished event
      this.bufferSyntheticEvent(game, 'game_finished', 'Game finished');
      this.broadcastLogEntry(game, null, 'game_finished', 'Game finished');

      // Flush event buffer and update session in DB
      this.eventLogService
        .flushBuffer(game.eventBuffer)
        .then(() => this.sessionRepo.updateStore(sessionId, store))
        .then(() => this.sessionRepo.updateStatusAndTimestamp(sessionId, 'finished', 'finishedAt'))
        .then(() => {
          // Write stats for the finished game (scheduled event path)
          const statRows = plugin.buildStats(game.config as any, newState);
          return this.statsService.writeStats(sessionId, game.roomId, game.gameType, statRows);
        })
        .catch((err) =>
          this.logger.error(
            `Scheduled game-over flush/stats failed for session ${sessionId}: ${err}`,
          ),
        );

      this.activeGames.delete(sessionId);
      this.pendingTimers.delete(sessionId);

      this.logger.log(`Game session ${sessionId} finished (scheduled event)`);

      const requiredPlayerCount = (game.config as { playerCount: number }).playerCount;
      this.roomService.handlePostGame(game.roomId, requiredPlayerCount).then(() => {
        this.finalizeGameEnd(game.roomId, sessionId);
      });

      broadcastFn({ gameOver: true, playerViews, store });
      return;
    }

    const playerViews = this.buildPlayerViews(game, plugin);
    broadcastFn({ gameOver: false, playerViews });

    // Check for chained scheduledEvents
    const stateWithScheduled = newState as WithScheduledEvents;
    if (stateWithScheduled.scheduledEvents && stateWithScheduled.scheduledEvents.length > 0) {
      const chainedTimers = this.pendingTimers.get(sessionId) ?? [];
      for (const scheduledEvent of stateWithScheduled.scheduledEvents) {
        const handle = setTimeout(
          () => this.processScheduledEvent(sessionId, scheduledEvent.event, broadcastFn),
          scheduledEvent.delayMs,
        );
        chainedTimers.push(handle);
      }
      this.pendingTimers.set(sessionId, chainedTimers);
    }

    // If no more pending timers, clean up the entry
    const remaining = this.pendingTimers.get(sessionId);
    if (remaining && remaining.length === 0) {
      this.pendingTimers.delete(sessionId);
    }
  }

  private clearPendingTimers(sessionId: number): void {
    const timers = this.pendingTimers.get(sessionId);
    if (timers) {
      for (const handle of timers) {
        clearTimeout(handle);
      }
      this.pendingTimers.delete(sessionId);
    }
  }

  private isActionBlocked(sessionId: number): boolean {
    const timers = this.pendingTimers.get(sessionId);
    return timers !== undefined && timers.length > 0;
  }

  private isUserInRoom(roomId: number, userId: number): boolean {
    const members = this.roomService.manager.getRoomMembers(String(roomId));
    return members.some((m) => m.userId === userId);
  }

  /**
   * Free the room slot and notify all room members that the game session ended.
   * Players receive GAME_OVER separately; this GAME_CANCELLED ensures spectators
   * (who only received GAME_CREATED) also clear their stale session state.
   */
  private finalizeGameEnd(roomId: number, sessionId: number): void {
    this.roomToSession.delete(roomId);
    this.roomService.broadcastToRoom(String(roomId), WS_EMIT.GAME_CANCELLED, { sessionId });
  }

  /** Buffer a synthetic event (no userID) with a given type and message. */
  private bufferSyntheticEvent(
    game: ActiveGame,
    type: string,
    message: string,
    payload?: unknown,
  ): void {
    const syntheticEvent = { type, payload };
    this.eventLogService.bufferEvent(
      game.eventBuffer,
      syntheticEvent,
      message,
      game.roomId,
      game.sessionId,
    );
  }

  /** Broadcast a game log entry to all room members. */
  private broadcastLogEntry(
    game: ActiveGame,
    userId: number | null,
    eventType: string,
    message: string,
  ): void {
    this.roomService.broadcastToRoom(String(game.roomId), WS_EMIT.GAME_LOG_ENTRY, {
      sessionId: game.sessionId,
      userId,
      eventType,
      message,
      timestamp: new Date().toISOString(),
    });
  }

  private buildPlayerViews(
    game: ActiveGame,
    plugin: GamePlugin,
  ): Array<[number, { state: unknown; validActions: string[] }]> {
    return game.playerIDs.map((userID) => [
      userID,
      {
        state: plugin.getPlayerView(game.config as any, game.state as any, userID),
        validActions: plugin.getValidActions(game.config as any, game.state as any, userID),
      },
    ]);
  }
}
