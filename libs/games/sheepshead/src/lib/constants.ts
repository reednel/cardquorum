import { Card, CardName, Rank, Suit } from './types';

export const TOTAL_POINTS = 120;

export const SUITS: readonly Suit[] = ['clubs', 'spades', 'hearts', 'diamonds'];

export const RANKS: readonly Rank[] = ['7', '8', '9', '10', 'jack', 'queen', 'king', 'ace'];

/** The full 32-card Sheepshead deck. */
export const DECK: readonly Card[] = [
  { name: '7c', suit: 'clubs', rank: '7', points: 0 },
  { name: '8c', suit: 'clubs', rank: '8', points: 0 },
  { name: '9c', suit: 'clubs', rank: '9', points: 0 },
  { name: 'xc', suit: 'clubs', rank: '10', points: 10 },
  { name: 'jc', suit: 'clubs', rank: 'jack', points: 2 },
  { name: 'qc', suit: 'clubs', rank: 'queen', points: 3 },
  { name: 'kc', suit: 'clubs', rank: 'king', points: 4 },
  { name: 'ac', suit: 'clubs', rank: 'ace', points: 11 },
  { name: '7s', suit: 'spades', rank: '7', points: 0 },
  { name: '8s', suit: 'spades', rank: '8', points: 0 },
  { name: '9s', suit: 'spades', rank: '9', points: 0 },
  { name: 'xs', suit: 'spades', rank: '10', points: 10 },
  { name: 'js', suit: 'spades', rank: 'jack', points: 2 },
  { name: 'qs', suit: 'spades', rank: 'queen', points: 3 },
  { name: 'ks', suit: 'spades', rank: 'king', points: 4 },
  { name: 'as', suit: 'spades', rank: 'ace', points: 11 },
  { name: '7h', suit: 'hearts', rank: '7', points: 0 },
  { name: '8h', suit: 'hearts', rank: '8', points: 0 },
  { name: '9h', suit: 'hearts', rank: '9', points: 0 },
  { name: 'xh', suit: 'hearts', rank: '10', points: 10 },
  { name: 'jh', suit: 'hearts', rank: 'jack', points: 2 },
  { name: 'qh', suit: 'hearts', rank: 'queen', points: 3 },
  { name: 'kh', suit: 'hearts', rank: 'king', points: 4 },
  { name: 'ah', suit: 'hearts', rank: 'ace', points: 11 },
  { name: '7d', suit: 'diamonds', rank: '7', points: 0 },
  { name: '8d', suit: 'diamonds', rank: '8', points: 0 },
  { name: '9d', suit: 'diamonds', rank: '9', points: 0 },
  { name: 'xd', suit: 'diamonds', rank: '10', points: 10 },
  { name: 'jd', suit: 'diamonds', rank: 'jack', points: 2 },
  { name: 'qd', suit: 'diamonds', rank: 'queen', points: 3 },
  { name: 'kd', suit: 'diamonds', rank: 'king', points: 4 },
  { name: 'ad', suit: 'diamonds', rank: 'ace', points: 11 },
];

/**
 * Trump card names in order from highest to lowest.
 */
export const TRUMP_ORDER: readonly CardName[] = [
  'qc',
  'qs',
  'qh',
  'qd',
  'jc',
  'js',
  'jh',
  'jd',
  'ad',
  'xd',
  'kd',
  '9d',
  '8d',
  '7d',
];

/** Non-trump rank order within a fail suit, highest to lowest. */
export const FAIL_RANK_ORDER: readonly Rank[] = ['ace', '10', 'king', '9', '8', '7'];

/** The three fail aces. */
export const FAIL_ACES: readonly CardName[] = ['ac', 'as', 'ah'];

/** The three fail 10s. */
export const FAIL_TENS: readonly CardName[] = ['xc', 'xs', 'xh'];
