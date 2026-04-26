/**
 * Types for the game table UI layer.
 *
 * GameTablePlugin is the contract between the generic table shell
 * and a game-specific adapter. The shell never imports game-specific
 * types — it works entirely through this interface.
 */

/** Asset path + alt text for rendering a single card. */
export interface CardAsset {
  src: string;
  alt: string;
}

/** Info for rendering one player seat around the table. */
export interface SeatInfo {
  userID: number;
  handSize: number;
  isDealer: boolean;
  isActive: boolean;
}

/** A single card play within a trick (for center-area rendering). */
export interface TrickPlayView {
  userID: number;
  cardName: string;
}

/** A single item rendered in the game status bar. */
export type StatusItem =
  | { type: 'text'; key: string; label: string; variant?: 'default' | 'muted' }
  | {
      type: 'badge';
      key: string;
      label: string;
      color: 'red' | 'yellow' | 'green' | 'blue' | 'purple' | 'pink' | 'dark';
    }
  | { type: 'separator' };

/** Configuration returned by a plugin to drive the status bar. */
export interface StatusBarConfig {
  items: StatusItem[];
  barVariant?: 'default' | 'active-turn' | 'urgent';
}

/**
 * The contract between the generic GameTableShell and a game-specific adapter.
 *
 * TState is the player view type (Partial<SheepsheadState> for Sheepshead).
 * TEvent is the event type sent to the server.
 */
export interface GameTablePlugin<TState = unknown, TEvent = unknown> {
  /** Map a card name to its sprite asset path and alt text. */
  getCardAsset(cardName: string): CardAsset;

  /** Return which card names in the player's hand are legal to play right now. */
  getLegalCards(state: TState, validActions: string[]): string[];

  /** Return which overlay to show (if any) for the current state. */
  getActiveOverlay(state: TState, validActions: string[]): string | null;

  /** Build the event payload when the player plays a card. Needs state to look up full Card object. */
  buildPlayCardEvent(state: TState, cardName: string): TEvent;

  /** Build the event payload when the player buries cards. Needs state to look up full Card objects. */
  buildBuryEvent(state: TState, cardNames: string[]): TEvent;

  /** Extract the current trick's plays from the state. */
  getCurrentTrick(state: TState): TrickPlayView[] | null;

  /** Extract seat info for all OTHER players (not the local player). */
  getPlayerSeats(state: TState, myUserID: number): SeatInfo[];

  /** Get status bar configuration for the current state. */
  getStatusInfo(state: TState, myUserID: number, config: unknown): StatusBarConfig;

  /** Get the local player's hand as card name strings. */
  getMyHand(state: TState, myUserID: number): string[];

  /** Return card entries for the blind (null = face-down). Empty array if no blind to show. */
  getBlindCards(state: TState): (string | null)[];

  /** Return the number of cards the player must bury. 0 if not applicable. */
  getBuryCount(state: TState, config: unknown): number;

  /** Build a move event from selected cards and target stack ID. */
  buildMoveEvent(state: TState, selectedCards: string[], targetStackId: string): TEvent;

  /** Return the default target stack ID for simple interactions, or null if a query is needed. */
  getDefaultTarget(state: TState, validActions: string[]): string | null;
}
