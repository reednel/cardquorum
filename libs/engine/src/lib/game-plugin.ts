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

  /** Apply an event to the state, returning the new state. Throws if invalid. */
  applyEvent(config: TConfig, state: TState, event: TEvent): TState;

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
}
