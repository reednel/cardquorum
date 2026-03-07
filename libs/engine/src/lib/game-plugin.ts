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

  /** Build the initial store for a new game. */
  createInitialStore(config: TConfig, userIDs: number[]): TStore;

  /** Return which actions are valid for a given player in the current state. */
  getValidActions(state: TState, userID: number): TEvent['type'][];

  /** Apply an event to the state, returning the new state. Update the store as well. Throws if invalid. */
  applyEvent(state: TState, store: TStore, event: TEvent): [TState, TStore];

  /** Derive the state visible to a specific player (hides other hands, etc.). */
  getPlayerView(state: TState, userID: number): Partial<TState>;

  /** Check whether the game is over. */
  isGameOver(state: TState): boolean;
}
