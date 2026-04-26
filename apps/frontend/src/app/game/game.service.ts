import { inject, Injectable, signal } from '@angular/core';
import type {
  ColorAssignmentMap,
  GameCancelledPayload,
  GameCreatedPayload,
  GameErrorPayload,
  GameOverPayload,
  GameStartedPayload,
  GameStateUpdatePayload,
} from '@cardquorum/shared';
import { WS_EMIT, WS_EVENT } from '@cardquorum/shared';
import { WebSocketService } from '../websocket.service';

@Injectable({ providedIn: 'root' })
export class GameService {
  private readonly ws = inject(WebSocketService);

  /** Current game session ID (null when no game is active). */
  private readonly _sessionId = signal<number | null>(null);
  /** Game type string (e.g., 'sheepshead'). */
  private readonly _gameType = signal<string | null>(null);
  /** Game config as passed during creation. */
  private readonly _config = signal<unknown>(null);
  /** Latest player view state from the server. */
  private readonly _state = signal<unknown>(null);
  /** Valid actions for the local player, from the server. */
  private readonly _validActions = signal<string[]>([]);
  /** Final game store (set on game over). */
  private readonly _store = signal<unknown>(null);
  /** Error message from the server. */
  private readonly _error = signal<string | null>(null);
  /** Color assignment map from the server. */
  private readonly _colorMap = signal<ColorAssignmentMap | undefined>(undefined);
  /** Valid targets response from the server (for target query flow). */
  private readonly _validTargets = signal<{ generation: number; targets: string[] } | null>(null);
  /** Room ID for reconnect-based rejoin. */
  private _activeRoomId: number | null = null;

  readonly sessionId = this._sessionId.asReadonly();
  readonly gameType = this._gameType.asReadonly();
  readonly config = this._config.asReadonly();
  readonly state = this._state.asReadonly();
  readonly validActions = this._validActions.asReadonly();
  readonly store = this._store.asReadonly();
  readonly error = this._error.asReadonly();
  readonly colorMap = this._colorMap.asReadonly();
  readonly validTargetsResponse = this._validTargets.asReadonly();

  constructor() {
    this.ws.on<GameCreatedPayload>(WS_EMIT.GAME_CREATED, (data) => {
      this._sessionId.set(data.sessionId);
      this._gameType.set(data.gameType);
      this._config.set(data.config);
      this._state.set(null);
      this._validActions.set([]);
      this._store.set(null);
      this._error.set(null);
    });

    this.ws.on<GameStartedPayload>(WS_EMIT.GAME_STARTED, (data) => {
      this._sessionId.set(data.sessionId);
      if (data.gameType) {
        this._gameType.set(data.gameType);
      }
      if (data.config !== undefined) {
        this._config.set(data.config);
      }
      this._state.set(data.state);
      this._validActions.set(data.validActions);
      this._colorMap.set(data.colorMap);
      this._store.set(null);
    });

    this.ws.on<GameStateUpdatePayload>(WS_EMIT.GAME_STATE_UPDATE, (data) => {
      if (data.sessionId === this._sessionId()) {
        this._state.set(data.state);
        this._validActions.set(data.validActions);
      }
    });

    this.ws.on<GameOverPayload>(WS_EMIT.GAME_OVER, (data) => {
      if (data.sessionId === this._sessionId()) {
        this._store.set(data.store);
        this._validActions.set([]);
        this._sessionId.set(null);
      }
    });

    this.ws.on<GameCancelledPayload>(WS_EMIT.GAME_CANCELLED, (data) => {
      // sessionId 0 is a sentinel from rejoin meaning "no game exists on the server"
      if (data.sessionId === 0 || data.sessionId === this._sessionId()) {
        this.reset();
      }
    });

    this.ws.on<GameErrorPayload>(WS_EMIT.GAME_ERROR, (data) => {
      this._error.set(data.message);
    });

    this.ws.on<{ generation: number; targets: string[] }>(WS_EMIT.GAME_VALID_TARGETS, (data) =>
      this._validTargets.set(data),
    );

    // Re-send rejoin on WS reconnect so game state is restored (or cleared)
    this.ws.onConnect(() => {
      if (this._activeRoomId !== null) {
        this.ws.send(WS_EVENT.GAME_REJOIN, { roomId: this._activeRoomId });
      }
    });
  }

  createGame(roomId: number, gameType: string, config: unknown): void {
    this.ws.send(WS_EVENT.GAME_CREATE, { roomId, gameType, config });
  }

  startGame(sessionId: number): void {
    this.ws.send(WS_EVENT.GAME_START, { sessionId });
  }

  sendAction(action: { type: string; payload?: unknown }): void {
    const sessionId = this._sessionId();
    if (sessionId !== null) {
      this.ws.send(WS_EVENT.GAME_ACTION, { sessionId, action });
    }
  }

  queryTargets(sourceStackId: string, selectedCards: string[], generation: number): void {
    const sessionId = this._sessionId();
    if (sessionId !== null) {
      this.ws.send(WS_EVENT.GAME_QUERY_TARGETS, {
        sessionId,
        sourceStackId,
        selectedCards,
        generation,
      });
    }
  }

  rejoinGame(roomId: number): void {
    this._activeRoomId = roomId;
    this.ws.send(WS_EVENT.GAME_REJOIN, { roomId });
  }

  cancelGame(): void {
    const sessionId = this._sessionId();
    if (sessionId !== null) {
      this.ws.send(WS_EVENT.GAME_CANCEL, { sessionId });
    }
  }

  leaveRoom(): void {
    this._activeRoomId = null;
    this.reset();
  }

  reset(): void {
    this._sessionId.set(null);
    this._gameType.set(null);
    this._config.set(null);
    this._state.set(null);
    this._validActions.set([]);
    this._store.set(null);
    this._error.set(null);
    this._colorMap.set(undefined);
    // Don't clear _activeRoomId — it's needed for future reconnects
    // while the user is still in the room
  }

  /** Clear the game display (state) after the score screen is dismissed. */
  clearDisplay(): void {
    this._state.set(null);
    this._store.set(null);
  }
}
