import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { GameSessionRepository } from '@cardquorum/db';
import { GamePlugin } from '@cardquorum/engine';
import { SheepsheadPlugin } from '@cardquorum/sheepshead';
import { RoomService } from '../room/room.service';
import { resolveCancellationStatus } from './game-status';

interface ActiveGame {
  sessionId: number;
  roomId: number;
  gameType: string;
  config: unknown;
  state: unknown | null;
  playerIDs: number[];
  createdBy: number;
  status: 'waiting' | 'active';
  createdAt: number;
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

  private sweepTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly sessionRepo: GameSessionRepository,
    private readonly roomService: RoomService,
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

    let row: { id: number };
    try {
      row = await this.sessionRepo.create({ roomId, gameType, config });
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
      createdBy,
      status: 'waiting',
      createdAt: Date.now(),
    };

    this.activeGames.set(row.id, game);
    this.roomToSession.set(roomId, row.id);

    this.logger.log(`Game session ${row.id} created in room ${roomId} (${gameType})`);

    return { sessionId: row.id, gameType, config };
  }

  async startSession(
    sessionId: number,
    requestedBy: number,
  ): Promise<{ playerViews: Array<[number, { state: unknown; validActions: string[] }]> }> {
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

    await this.sessionRepo.updateStatusAndTimestamp(sessionId, 'active', 'startedAt');

    const playerViews = this.buildPlayerViews(game, plugin);

    this.logger.log(`Game session ${sessionId} started with ${playerIDs.length} players`);

    return { playerViews };
  }

  async applyAction(
    sessionId: number,
    userID: number,
    action: { type: string; payload?: unknown },
  ): Promise<{
    gameOver: boolean;
    playerViews: Array<[number, { state: unknown; validActions: string[] }]>;
    store?: unknown;
  }> {
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
    const newState = plugin.applyEvent(game.config as any, game.state as any, event);
    game.state = newState;

    const gameOver = plugin.isGameOver(newState);

    if (gameOver) {
      const store = plugin.buildStore(game.config as any, newState);
      const playerViews = this.buildPlayerViews(game, plugin);

      await this.sessionRepo.updateStore(sessionId, store);
      await this.sessionRepo.updateStatusAndTimestamp(sessionId, 'finished', 'finishedAt');

      this.activeGames.delete(sessionId);
      this.roomToSession.delete(game.roomId);

      this.logger.log(`Game session ${sessionId} finished`);

      // Rotate seats after game-over cleanup so clients see game-over before roster change
      await this.roomService.rotateSeat(game.roomId);

      return { gameOver: true, playerViews, store };
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

    const finalStatus = resolveCancellationStatus(game.status, 'owner-cancel');
    await this.sessionRepo.updateStatusAndTimestamp(sessionId, finalStatus, 'finishedAt');

    this.activeGames.delete(sessionId);
    this.roomToSession.delete(game.roomId);

    this.logger.log(`Game session ${sessionId} ${finalStatus} by user ${requestedBy}`);

    return { roomId: game.roomId };
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

  /** Return session info for rejoin, covering both waiting and active games. */
  getSessionInfoByRoom(
    roomId: number,
    userID: number,
  ): {
    sessionId: number;
    status: 'waiting' | 'active';
    gameType: string;
    config: unknown;
    state?: unknown;
    validActions?: string[];
  } | null {
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

    return {
      sessionId,
      status: 'active',
      gameType: game.gameType,
      config: game.config,
      ...view,
    };
  }

  private isUserInRoom(roomId: number, userId: number): boolean {
    const members = this.roomService.manager.getRoomMembers(String(roomId));
    return members.some((m) => m.userId === userId);
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
