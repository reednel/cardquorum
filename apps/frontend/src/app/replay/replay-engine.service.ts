import { Injectable, signal } from '@angular/core';
import type { GamePlugin } from '@cardquorum/engine';
import type { ReplayEventDto, ReplayParticipantDto } from '@cardquorum/shared';
import { SheepsheadPlugin } from '@cardquorum/sheepshead';

/** Registry of game engine plugins keyed by game type. */
const GAME_ENGINE_PLUGINS: Record<string, GamePlugin> = {
  sheepshead: SheepsheadPlugin,
};

/** Synthetic event types that are not processed by applyEvent. */
const SYNTHETIC_EVENT_TYPES = new Set(['game_started', 'game_finished', 'game_cancelled']);

@Injectable()
export class ReplayEngineService {
  /** Total number of replayable events (after filtering synthetic events). */
  readonly totalEvents = signal(0);

  /** Current position (0 = initial state, N = after N events applied). */
  readonly currentPosition = signal(0);

  /** Current player view state for the viewer. */
  readonly playerView = signal<unknown>(null);

  /** Human-readable description of the current event. "Initial state" at position 0. */
  readonly currentEventMessage = signal<string | null>(null);

  /** Error state if applyEvent fails. */
  readonly error = signal<{ eventIndex: number; message: string } | null>(null);

  private plugin: GamePlugin | null = null;
  private config: unknown = null;
  private userIDs: number[] = [];
  private viewerUserId = 0;
  private events: ReplayEventDto[] = [];

  /**
   * Initialize the replay engine with session data.
   * Filters synthetic events, computes initial state, and positions at 0.
   */
  initialize(
    gameType: string,
    config: unknown,
    participants: ReplayParticipantDto[],
    events: ReplayEventDto[],
    viewerUserId: number,
  ): void {
    const plugin = GAME_ENGINE_PLUGINS[gameType];
    if (!plugin) {
      this.error.set({ eventIndex: -1, message: `Unknown game type: ${gameType}` });
      return;
    }

    this.plugin = plugin;
    this.config = config;
    this.viewerUserId = viewerUserId;

    // Order participants by seatIndex ascending for createInitialState
    const sorted = [...participants].sort((a, b) => a.seatIndex - b.seatIndex);
    this.userIDs = sorted.map((p) => p.userId);

    // Filter out synthetic events
    this.events = events.filter((e) => !SYNTHETIC_EVENT_TYPES.has(e.eventType));

    this.totalEvents.set(this.events.length);
    this.error.set(null);

    // Position at 0 (initial state)
    this.goToPosition(0);
  }

  /**
   * Navigate to a specific position.
   * Position 0 = initial state (no events applied).
   * Position N = state after applying events 0..N-1.
   */
  goToPosition(position: number): void {
    if (!this.plugin) return;

    const clamped = Math.max(0, Math.min(position, this.events.length));

    // Start from initial state
    let state = this.plugin.createInitialState(this.config, this.userIDs);

    // Apply events 0..N-1
    for (let i = 0; i < clamped; i++) {
      const event = this.events[i];
      try {
        if (event.eventType === 'game_abandoned') {
          // Apply plugin's onPlayerAbandon instead of applyEvent
          const payload = event.payload as { userId?: number } | null;
          const abandonUserId = payload?.userId ?? event.userId ?? 0;
          if (this.plugin.onPlayerAbandon) {
            state = this.plugin.onPlayerAbandon(this.config, state, abandonUserId);
          }
        } else {
          const result = this.plugin.applyEvent(this.config, state, {
            type: event.eventType,
            userID: event.userId ?? undefined,
            payload: event.payload,
          });
          state = result.state;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.error.set({ eventIndex: i, message });
        this.currentPosition.set(i);
        this.playerView.set(this.plugin.getPlayerView(this.config, state, this.viewerUserId));
        this.currentEventMessage.set(
          i > 0 ? (this.events[i - 1].message ?? null) : 'Initial state',
        );
        return;
      }
    }

    // Derive player view
    const playerView = this.plugin.getPlayerView(this.config, state, this.viewerUserId);

    this.error.set(null);
    this.currentPosition.set(clamped);
    this.playerView.set(playerView);
    this.currentEventMessage.set(
      clamped === 0 ? 'Initial state' : (this.events[clamped - 1].message ?? null),
    );
  }

  /** Step forward by one event. No-op if at end. */
  stepForward(): void {
    if (this.currentPosition() < this.totalEvents()) {
      this.goToPosition(this.currentPosition() + 1);
    }
  }

  /** Step backward by one event. No-op if at start. */
  stepBackward(): void {
    if (this.currentPosition() > 0) {
      this.goToPosition(this.currentPosition() - 1);
    }
  }

  /** Jump to start (position 0). */
  jumpToStart(): void {
    this.goToPosition(0);
  }

  /** Jump to end (position = totalEvents). */
  jumpToEnd(): void {
    this.goToPosition(this.totalEvents());
  }
}
