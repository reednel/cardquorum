import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import type { GameStartedPayload, GameStateUpdatePayload } from '@cardquorum/shared';
import { WS_EMIT, WS_EVENT } from '@cardquorum/shared';
import { WebSocketService } from '../websocket.service';

@Injectable({ providedIn: 'root' })
export class ForceAbandonService {
  private readonly ws = inject(WebSocketService);
  private readonly destroyRef = inject(DestroyRef);

  /** ISO 8601 timestamp of when the current active player's turn started. */
  private readonly _turnStartTimestamp = signal<string | null>(null);
  /** userId of the current active player. */
  private readonly _activePlayerUserId = signal<number | null>(null);
  /** Turn time limit in seconds (null = unlimited). */
  private readonly _turnTimeLimit = signal<number | null>(null);
  /** Elapsed seconds since turn started, updated every second. */
  private readonly _elapsedSeconds = signal<number>(0);
  /** Whether the modal is currently shown. */
  private readonly _showModal = signal<boolean>(false);
  /** Whether the button should be shown (modal was dismissed but time still expired). */
  private readonly _showButton = signal<boolean>(false);
  /** Tracks the activePlayerUserId that triggered the current modal (for one-shot behavior). */
  private _modalShownForPlayer: number | null = null;

  private _intervalId: ReturnType<typeof setInterval> | null = null;

  readonly turnStartTimestamp = this._turnStartTimestamp.asReadonly();
  readonly activePlayerUserId = this._activePlayerUserId.asReadonly();
  readonly turnTimeLimit = this._turnTimeLimit.asReadonly();
  readonly elapsedSeconds = this._elapsedSeconds.asReadonly();
  readonly showModal = this._showModal.asReadonly();
  readonly showButton = this._showButton.asReadonly();

  /** Whether the turn time limit has expired based on local clock. */
  readonly timeExpired = computed(() => {
    const timestamp = this._turnStartTimestamp();
    const limit = this._turnTimeLimit();
    if (timestamp === null || timestamp === undefined || limit === null || limit === undefined) {
      return false;
    }
    const elapsed = this._elapsedSeconds();
    return elapsed >= limit;
  });

  constructor() {
    this.ws.on<GameStartedPayload>(WS_EMIT.GAME_STARTED, (data) => {
      this.updateTimingState(data.turnStartTimestamp, data.activePlayerUserId, data.turnTimeLimit);
    });

    this.ws.on<GameStateUpdatePayload>(WS_EMIT.GAME_STATE_UPDATE, (data) => {
      this.updateTimingState(data.turnStartTimestamp, data.activePlayerUserId, data.turnTimeLimit);
    });

    this.startInterval();

    this.destroyRef.onDestroy(() => {
      this.clearInterval();
    });
  }

  /** Send force-abandon event to the server and dismiss the modal. */
  confirmForceAbandon(sessionId: number, targetUserId: number): void {
    this.ws.send(WS_EVENT.GAME_FORCE_ABANDON, { sessionId, targetUserId });
    this._showModal.set(false);
    this._showButton.set(false);
  }

  /** Dismiss the modal without sending an event; show the button instead. */
  dismissModal(): void {
    this._showModal.set(false);
    this._showButton.set(true);
  }

  /** Reset all state (called on game end or room leave). */
  reset(): void {
    this._turnStartTimestamp.set(null);
    this._activePlayerUserId.set(null);
    this._turnTimeLimit.set(null);
    this._elapsedSeconds.set(0);
    this._showModal.set(false);
    this._showButton.set(false);
    this._modalShownForPlayer = null;
  }

  private updateTimingState(
    turnStartTimestamp: string | null | undefined,
    activePlayerUserId: number | null | undefined,
    turnTimeLimit: number | null | undefined,
  ): void {
    const prevActivePlayer = this._activePlayerUserId();
    const newActivePlayer = activePlayerUserId ?? null;
    const newTimestamp = turnStartTimestamp ?? null;
    const newLimit = turnTimeLimit ?? null;

    // Detect active player change → reset modal/button state
    if (newActivePlayer !== prevActivePlayer) {
      this._showModal.set(false);
      this._showButton.set(false);
      this._modalShownForPlayer = null;
    }

    this._turnStartTimestamp.set(newTimestamp);
    this._activePlayerUserId.set(newActivePlayer);
    this._turnTimeLimit.set(newLimit);

    // Recompute elapsed immediately
    this.updateElapsed();
  }

  private startInterval(): void {
    this._intervalId = setInterval(() => {
      this.updateElapsed();
      this.checkExpiration();
    }, 1000);
  }

  private clearInterval(): void {
    if (this._intervalId !== null) {
      clearInterval(this._intervalId);
      this._intervalId = null;
    }
  }

  private updateElapsed(): void {
    const timestamp = this._turnStartTimestamp();
    if (timestamp === null) {
      this._elapsedSeconds.set(0);
      return;
    }
    const startMs = Date.parse(timestamp);
    if (isNaN(startMs)) {
      this._elapsedSeconds.set(0);
      return;
    }
    const elapsed = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
    this._elapsedSeconds.set(elapsed);
  }

  private checkExpiration(): void {
    const limit = this._turnTimeLimit();
    const activePlayer = this._activePlayerUserId();
    if (limit === null || activePlayer === null) {
      return;
    }

    const elapsed = this._elapsedSeconds();
    const expired = elapsed >= limit;

    // One-shot modal: show modal when time first expires for this player
    if (expired && this._modalShownForPlayer !== activePlayer) {
      this._modalShownForPlayer = activePlayer;
      this._showModal.set(true);
      this._showButton.set(false);
    }
  }
}
