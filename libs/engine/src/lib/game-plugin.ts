export interface PlayerStatRow {
  userId: number;
  won: boolean | null;
  scoreDelta: number | null;
}

export interface ScheduledEvent {
  event: { type: string; payload?: unknown };
  delayMs: number;
}

export type WithScheduledEvents = {
  scheduledEvents?: ScheduledEvent[];
};

export interface GameEventBase {
  type: string;
  userID?: number;
  payload?: unknown;
}

export interface ApplyEventResult<TState> {
  state: TState;
  /** Side effects to persist (e.g., deal card assignments). Stored alongside the event. */
  sideEffects?: unknown;
}

/**
 * Contract that every game plugin implements.
 * The engine orchestrates games through this interface without
 * knowing game-specific rules.
 */
export interface GamePlugin<
  TConfig = unknown,
  TState = unknown,
  TStore = unknown,
  TEvent extends GameEventBase = GameEventBase,
> {
  /** Unique identifier, matches game_sessions.game_type. */
  readonly gameType: string;

  /** Validate config before a session is created. */
  validateConfig(config: unknown): config is TConfig;

  /** Build the initial state for a new game. */
  createInitialState(config: TConfig, userIDs: number[]): TState;

  /** Return which actions are valid for a given player in the current state. */
  getValidActions(config: TConfig, state: TState, userID: number): TEvent['type'][];

  /**
   * Apply an event to the state, returning the new state and optional side effects.
   * Must be a pure function — same inputs always produce same outputs.
   * Must not mutate state or event arguments.
   *
   * During live play: if the event payload is empty/partial (e.g., a bare 'deal' event),
   * the function generates randomness and returns it in sideEffects for storage.
   * During replay: the event payload already contains the stored sideEffects from the
   * original game, so the function uses those deterministically.
   */
  applyEvent(config: TConfig, state: TState, event: TEvent): ApplyEventResult<TState>;

  /** Derive the state visible to a specific player (hides other hands, etc.). */
  getPlayerView(config: TConfig, state: TState, userID: number): Partial<TState>;

  /** Check whether the game is over. */
  isGameOver(state: TState): boolean;

  /** Construct the permanent store record from a state snapshot. */
  buildStore(config: TConfig, state: TState): TStore;

  /**
   * Return valid target stack IDs for a card selection. Optional.
   * Read-only query — must not modify state.
   */
  getValidTargets?(
    config: TConfig,
    state: TState,
    userID: number,
    sourceStackId: string,
    selectedCards: string[],
  ): string[];

  /**
   * Handle a player abandoning the game. Returns the new state
   * which must be a terminal (game-over) state.
   * If not implemented, GameService falls back to cancelling with status 'abandoned'.
   */
  onPlayerAbandon?(config: TConfig, state: TState, userId: number): TState;

  /**
   * Produce a human-readable description of a game event.
   * Returns null to suppress the event from the visible log.
   *
   * @param event - The raw game event
   * @param state - The post-event state (after applyEvent)
   * @param playerNames - Map of userID → display name
   * @returns A spectator-safe description string, or null
   */
  describeEvent?(event: TEvent, state: TState, playerNames: Map<number, string>): string | null;

  /**
   * Derive per-player stats from a terminal game state.
   * Called when the game finishes (including plugin-handled abandonment).
   */
  buildStats(config: TConfig, state: TState): PlayerStatRow[];
}
