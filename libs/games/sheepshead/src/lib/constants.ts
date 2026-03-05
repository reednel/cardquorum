import { Card, Suit, Rank } from './types';

export const SUITS: readonly Suit[] = ['clubs', 'spades', 'hearts', 'diamonds'];

export const RANKS: readonly Rank[] = ['7', '8', '9', '10', 'jack', 'queen', 'king', 'ace'];

/** Point values by rank. */
export const POINT_VALUES: Readonly<Record<Rank, number>> = {
  '7': 0,
  '8': 0,
  '9': 0,
  '10': 10,
  jack: 2,
  queen: 3,
  king: 4,
  ace: 11,
};

/** The full 32-card Sheepshead deck. */
export const DECK: readonly Card[] = SUITS.flatMap((suit) => RANKS.map((rank) => ({ suit, rank })));

/** Total points in the deck. */
export const TOTAL_POINTS = 120;

/**
 * Trump cards in order from highest to lowest.
 * Queens (C, S, H, D), Jacks (C, S, H, D), then remaining diamonds (A, 10, K, 9, 8, 7).
 */
export const TRUMP_ORDER: readonly Card[] = [
  { suit: 'clubs', rank: 'queen' },
  { suit: 'spades', rank: 'queen' },
  { suit: 'hearts', rank: 'queen' },
  { suit: 'diamonds', rank: 'queen' },
  { suit: 'clubs', rank: 'jack' },
  { suit: 'spades', rank: 'jack' },
  { suit: 'hearts', rank: 'jack' },
  { suit: 'diamonds', rank: 'jack' },
  { suit: 'diamonds', rank: 'ace' },
  { suit: 'diamonds', rank: '10' },
  { suit: 'diamonds', rank: 'king' },
  { suit: 'diamonds', rank: '9' },
  { suit: 'diamonds', rank: '8' },
  { suit: 'diamonds', rank: '7' },
];

/** Non-trump rank order within a fail suit, highest to lowest. */
export const FAIL_RANK_ORDER: readonly Rank[] = ['ace', '10', 'king', '9', '8', '7'];
