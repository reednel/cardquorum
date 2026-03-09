/**
 * The unique identifier for a player (userID).
 */
export type UserID = number;

/** Phases within a single game. */
export type GamePhase = 'deal' | 'pick' | 'bury' | 'call' | 'play' | 'score';

/** Decision made during the pick phase. */
export type PickDecision = 'pick' | 'pass';

/** How to proceed when nobody picks. */
export type NoPick =
  | 'forced-pick'
  | 'leaster'
  | 'moster'
  | 'mittler'
  | 'schneidster'
  | 'doubler'
  | 'schwanzer';

/** A player's role in a game. */
export type PlayerRole = 'picker' | 'partner' | 'opposition';

/** How the picking round works. */
export type PickerRule =
  | 'autonomous' // each player in turn order chooses to pick or pass
  | 'left-of-dealer' // one specific player must pick, no choice (Schiller)
  | null; // no picking round (e.g. 4-player black queens)

/** Rule for determining the partner/s. */
export type PartnerRule =
  | 'called-ace'
  | 'jd'
  | 'jc'
  | 'qc-qs'
  | 'qs-jc'
  | 'first-trick'
  | 'qc-7d'
  | 'left-of-picker'
  | null;

/**
 * Stored as game_sessions.config (jsonb).
 */
export interface SheepsheadConfig {
  playerCount: 2 | 3 | 4 | 5 | 6 | 7 | 8;
  handSize: number;
  blindSize: number;
  pickerRule: PickerRule;
  partnerRule: PartnerRule;
  noPick: NoPick | null;
  cracking: boolean;
  blitzing: boolean;
  doubleOnTheBump: boolean;
  partnerOffTheHook: boolean;
  noAceFaceTrump: boolean;
  multiplicityLimit: number | null;
}

export interface ConfigPreset {
  /** Display name for the frontend. */
  label: string;
  /** Short description, e.g. for a tooltip. */
  description: string;
  /** Values locked by this preset — not user-editable. */
  fixed: Partial<SheepsheadConfig>;
  /** Values with defaults that the user can change. */
  defaults: Partial<SheepsheadConfig>;
  /** Cards removed from the standard 32-card deck. */
  cardsRemoved?: CardName[];
}

/**
 * The ordered list of players (userIDs) in the game.
 * Dealer at index 0, then clockwise around the table.
 */
export type PlayerState = {
  userID: UserID;
  role: PlayerRole | null;
  hand: Card[];
  tricksWon: number;
  pointsWon: number;
  cardsWon: Card[];
  scoreDelta: number | null;
};

/**
 * Full game state. Stored as game_sessions.state (jsonb).
 * Mutated via applyEvent() on each game action.
 */
export interface SheepsheadState {
  /** Ordered list of players and their state. Dealer at index 0. */
  players: PlayerState[];
  /** Current phase of the game. */
  phase: GamePhase;
  /** Current trick number (1-indexed). */
  trickNumber: number | null;
  /** UserID of whose turn it is (null during scoring). */
  activePlayer: UserID | null;
  /** Cards in the blind. */
  blind: Card[] | null;
  /** Cards buried by the picker. */
  buried: Card[] | null;
  /** Called suit (only used in called-ace variant). */
  calledSuit: string | null;
  /** Completed tricks. */
  tricks: TrickState[];
  /** Crack/re-crack state. */
  crack: CrackState | null;
  /** Blitz state. */
  blitz: BlitzState | null;
  /** Whether the previous game was a doubler. */
  previousGameDouble: boolean | null;
  /** How to proceed when nobody picks.  */
  noPick: NoPick | null;
}

/**
 * The ordered list of players (userIDs) in the game.
 * Dealer at index 0, then clockwise around the table.
 */
export type PlayerStore = {
  userID: UserID;
  role: PlayerRole | null;
  won: boolean | null;
  scoreDelta: number | null;
};

/** State within a single game session. */
export interface SheepsheadStore {
  players: PlayerStore[];
  /** Original cards in the blind. */
  blind: Card[];
  /** Cards buried by the picker. */
  buried: Card[];
  /** Called suit (only used in called-ace variant). */
  calledSuit: Suit | null;
  /** Completed tricks. */
  tricks: TrickState[];
  /** Crack/re-crack state. */
  crack: CrackState | null;
  /** Blitz state. */
  blitz: BlitzState | null;
  /** Whether the previous game was a doubler. */
  previousGameDouble: boolean | null;
  /** How to proceed when nobody picks.  */
  noPick: NoPick | null;
}

export interface TrickState {
  /** Cards played in order. */
  plays: TrickPlay[];
  /** Player who won the trick. */
  winner: UserID | null;
}

export interface TrickPlay {
  player: UserID;
  card: Card;
}

export interface CrackState {
  crackedBy: UserID;
  reCrackedBy: UserID | null;
}

export interface BlitzState {
  type: 'black-blitz' | 'red-blitz';
  blitzedBy: UserID;
}

/**
 * All Sheepshead game events.
 * Each maps to a game_events row (eventType + payload).
 */
export type SheepsheadEvent =
  | DealEvent
  | PickEvent
  | PassEvent
  | BuryEvent
  | CallAceEvent
  | CrackEvent
  | ReCrackEvent
  | PlayCardEvent
  | TrickWonEvent
  | GameScoredEvent
  | GameOverEvent;

export interface DealEvent {
  type: 'deal';
}

export interface PickEvent {
  type: 'pick';
  userID: UserID;
}

export interface PassEvent {
  type: 'pass';
  userID: UserID;
}

export interface BuryEvent {
  type: 'bury';
  userID: UserID;
  payload: { cards: Card[] };
}

export interface CallAceEvent {
  type: 'call_ace';
  userID: UserID;
  payload: { suit: Suit };
}

export interface CrackEvent {
  type: 'crack';
  userID: UserID;
}

export interface ReCrackEvent {
  type: 're_crack';
  userID: UserID;
}

export interface PlayCardEvent {
  type: 'play_card';
  userID: UserID;
  payload: { card: Card };
}

export interface TrickWonEvent {
  type: 'trick_won';
  payload: { winner: UserID; points: number };
}

export interface GameScoredEvent {
  type: 'game_scored';
  payload: {
    scoreDeltas: number[];
    gotSchneidered: boolean;
    gotNoTricked: boolean;
  };
}

export interface GameOverEvent {
  type: 'game_over';
  payload: {
    finalScores: number[];
    winners: UserID[];
  };
}

/** String literal union of all event type names. */
export type SheepsheadEventType = SheepsheadEvent['type'];

export interface Card {
  name: CardName;
  suit: Suit;
  rank: Rank;
  points: Points;
}

export type Suit = 'clubs' | 'spades' | 'hearts' | 'diamonds';

export type Rank = '7' | '8' | '9' | '10' | 'jack' | 'queen' | 'king' | 'ace';

export type Points = 0 | 2 | 3 | 4 | 10 | 11;

export type CardName =
  | '7c'
  | '8c'
  | '9c'
  | 'xc'
  | 'jc'
  | 'qc'
  | 'kc'
  | 'ac'
  | '7s'
  | '8s'
  | '9s'
  | 'xs'
  | 'js'
  | 'qs'
  | 'ks'
  | 'as'
  | '7h'
  | '8h'
  | '9h'
  | 'xh'
  | 'jh'
  | 'qh'
  | 'kh'
  | 'ah'
  | '7d'
  | '8d'
  | '9d'
  | 'xd'
  | 'jd'
  | 'qd'
  | 'kd'
  | 'ad';
