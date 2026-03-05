export type Suit = 'clubs' | 'spades' | 'hearts' | 'diamonds';

export type Rank = '7' | '8' | '9' | '10' | 'jack' | 'queen' | 'king' | 'ace';

export interface Card {
  suit: Suit;
  rank: Rank;
}

export type PartnerRule = 'jack-of-diamonds' | 'called-ace' | 'none';

/**
 * Stored as game_sessions.config (jsonb).
 */
export interface SheepsheadConfig {
  playerCount: number;
  /* How partner is determined. */
  partnerRule: PartnerRule;
  /* Optional house rules. */
  leasters: boolean;
  doublers: boolean;
  crack: boolean;
  blitzing: boolean;
}

/** Phases within a single hand. */
export type HandPhase = 'deal' | 'pick' | 'bury' | 'call' | 'play' | 'score';

/** A player's role in a hand. */
export type PlayerRole = 'picker' | 'partner' | 'opposition';

/**
 * Full game state. Stored as game_sessions.state (jsonb).
 * Mutated via applyEvent() on each game action.
 */
export interface SheepsheadState {
  /** Overall scores across hands, indexed by seat index. */
  scores: number[];
  /** Current hand number (1-indexed). */
  handNumber: number;
  /** Consecutive all-pass count (for doublers rule). */
  doublerCount: number;
  /** The current hand, or null between hands. */
  currentHand: HandState | null;
}

/** State within a single hand. */
export interface HandState {
  phase: HandPhase;
  /** Seat index of the dealer. */
  dealer: number;
  /** Seat index of whose turn it is (null during scoring). */
  activePlayer: number | null;
  /** Each player's cards, indexed by seat index. */
  hands: Card[][];
  /** Cards in the blind. */
  blind: Card[];
  /** Cards buried by the picker. */
  buried: Card[];
  /** Seat index of the picker, or null if not yet determined. */
  picker: number | null;
  /** Seat index of the partner, or null. */
  partner: number | null;
  /** Called suit (only used in called-ace variant). */
  calledSuit: string | null;
  /** Whether partner has been revealed (e.g., by playing the called ace). */
  partnerRevealed: boolean;
  /** Role assignment per seat index. */
  roles: (PlayerRole | null)[];
  /** Ordered record of picking decisions. */
  pickingRound: PickDecision[];
  /** Completed tricks. */
  tricks: TrickState[];
  /** The trick currently being played. */
  currentTrick: TrickState | null;
  /** Crack/re-crack multiplier state. */
  crackState: CrackState;
  /** Whether this hand is a leaster (everyone passed). */
  isLeaster: boolean;
}

export interface PickDecision {
  seatIndex: number;
  action: 'pick' | 'pass';
}

export interface TrickState {
  /** Seat index of who led. */
  leader: number;
  /** Cards played in order. */
  plays: TrickPlay[];
  /** Seat index of the winner (null until complete). */
  winner: number | null;
}

export interface TrickPlay {
  seatIndex: number;
  card: Card;
}

export interface CrackState {
  /** 1 = normal, 2 = cracked, 4 = re-cracked. */
  multiplier: 1 | 2 | 4;
  crackedBy: number | null;
  reCrackedBy: number | null;
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
  | HandScoredEvent
  | GameOverEvent;

export interface DealEvent {
  type: 'deal';
}

export interface PickEvent {
  type: 'pick';
  playerId: number;
}

export interface PassEvent {
  type: 'pass';
  playerId: number;
}

export interface BuryEvent {
  type: 'bury';
  playerId: number;
  payload: { cards: Card[] };
}

export interface CallAceEvent {
  type: 'call_ace';
  playerId: number;
  payload: { suit: string };
}

export interface CrackEvent {
  type: 'crack';
  playerId: number;
}

export interface ReCrackEvent {
  type: 're_crack';
  playerId: number;
}

export interface PlayCardEvent {
  type: 'play_card';
  playerId: number;
  payload: { card: Card };
}

export interface TrickWonEvent {
  type: 'trick_won';
  payload: { winner: number; points: number };
}

export interface HandScoredEvent {
  type: 'hand_scored';
  payload: {
    scoreDeltas: number[];
    schneider: boolean;
    schwarz: boolean;
  };
}

export interface GameOverEvent {
  type: 'game_over';
  payload: {
    finalScores: number[];
    winners: number[];
  };
}

/** String literal union of all event type names. */
export type SheepsheadEventType = SheepsheadEvent['type'];
