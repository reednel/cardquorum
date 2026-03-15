import { Card, CardName, ConfigPreset, Rank, SheepsheadConfig, Suit } from './types';

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

const HOUSE_RULE_DEFAULTS: Pick<
  SheepsheadConfig,
  | 'cracking'
  | 'blitzing'
  | 'partnerOffTheHook'
  | 'noAceFaceTrump'
  | 'multiplicityLimit'
  | 'callOwnAce'
> = {
  cracking: false,
  blitzing: false,
  partnerOffTheHook: false,
  noAceFaceTrump: false,
  multiplicityLimit: null,
  callOwnAce: null,
};

export const CONFIG_PRESETS: readonly ConfigPreset[] = [
  // 2 players
  {
    label: 'Two-Handed',
    description: 'No teams, no picking.',
    fixed: {
      name: 'two-handed',
      playerCount: 2,
      handSize: 14,
      blindSize: 4,
      pickerRule: null,
      partnerRule: null,
      noPick: null,
      doubleOnTheBump: false,
    },
    defaults: { ...HOUSE_RULE_DEFAULTS },
  },
  // 3 players
  {
    label: 'Three-Handed',
    description: 'Picker plays alone against two opponents.',
    fixed: {
      name: 'three-handed',
      playerCount: 3,
      handSize: 10,
      blindSize: 2,
      pickerRule: 'autonomous',
      partnerRule: null,
    },
    defaults: { noPick: 'leaster', doubleOnTheBump: false, ...HOUSE_RULE_DEFAULTS },
  },
  // 4 players
  {
    label: 'Black Queens',
    description: 'Holders of the two black Queens are partners. Player with both goes alone.',
    fixed: {
      name: 'black-queens',
      playerCount: 4,
      handSize: 8,
      blindSize: 0,
      pickerRule: null,
      partnerRule: 'qc-qs',
      noPick: null,
      doubleOnTheBump: true,
    },
    defaults: { ...HOUSE_RULE_DEFAULTS },
  },
  {
    label: 'Queen & 7',
    description:
      'Queen of Clubs and 7 of Diamonds holders are partners. Player with both goes alone.',
    fixed: {
      name: 'queen-and-7',
      playerCount: 4,
      handSize: 8,
      blindSize: 0,
      pickerRule: null,
      partnerRule: 'qc-7d',
      noPick: null,
      doubleOnTheBump: false,
    },
    defaults: { ...HOUSE_RULE_DEFAULTS },
  },
  {
    label: 'Picker Alone',
    description: 'Picker plays alone against three opponents.',
    fixed: {
      name: 'picker-alone',
      playerCount: 4,
      handSize: 7,
      blindSize: 4,
      pickerRule: 'autonomous',
      partnerRule: null,
      doubleOnTheBump: true,
    },
    defaults: { noPick: 'leaster', ...HOUSE_RULE_DEFAULTS },
  },
  {
    label: 'Called Ace',
    description: 'Black 7s removed. Picker calls a fail ace for partner.',
    fixed: {
      name: 'called-ace',
      playerCount: 4,
      handSize: 7,
      blindSize: 2,
      pickerRule: 'autonomous',
      partnerRule: 'called-ace',
      doubleOnTheBump: true,
      cardsRemoved: ['7c', '7s'],
    },
    defaults: { noPick: 'leaster', ...HOUSE_RULE_DEFAULTS, callOwnAce: false },
  },
  // 5 players
  {
    label: 'Called Ace',
    description: 'Picker calls a fail ace for partner.',
    fixed: {
      name: 'called-ace',
      playerCount: 5,
      handSize: 6,
      blindSize: 2,
      pickerRule: 'autonomous',
      partnerRule: 'called-ace',
    },
    defaults: {
      noPick: 'leaster',
      doubleOnTheBump: false,
      ...HOUSE_RULE_DEFAULTS,
      callOwnAce: false,
    },
  },
  {
    label: 'Jack of Diamonds',
    description: 'Holder of the Jack of Diamonds is the partner.',
    fixed: {
      name: 'jack-of-diamonds',
      playerCount: 5,
      handSize: 6,
      blindSize: 2,
      pickerRule: 'autonomous',
      partnerRule: 'jd',
    },
    defaults: { noPick: 'leaster', doubleOnTheBump: false, ...HOUSE_RULE_DEFAULTS },
  },
  {
    label: 'Queen & Jack',
    description:
      'Black 7s removed. Queen of Spades and Jack of Clubs holders are partners. No blind.',
    fixed: {
      name: 'queen-and-jack',
      playerCount: 5,
      handSize: 6,
      blindSize: 0,
      pickerRule: null,
      partnerRule: 'qs-jc',
      noPick: null,
      cardsRemoved: ['7c', '7s'],
    },
    defaults: { doubleOnTheBump: false, ...HOUSE_RULE_DEFAULTS },
  },
  {
    label: 'First Trick',
    description: 'Winner of the first trick is the partner.',
    fixed: {
      name: 'first-trick',
      playerCount: 5,
      handSize: 6,
      blindSize: 2,
      pickerRule: 'autonomous',
      partnerRule: 'first-trick',
    },
    defaults: { noPick: 'leaster', doubleOnTheBump: false, ...HOUSE_RULE_DEFAULTS },
  },
  {
    label: 'Schiller',
    description: 'Player left of dealer must pick. Called ace for partner.',
    fixed: {
      name: 'schiller',
      playerCount: 5,
      handSize: 6,
      blindSize: 2,
      pickerRule: 'left-of-dealer',
      partnerRule: 'called-ace',
      noPick: null,
    },
    defaults: { doubleOnTheBump: false, ...HOUSE_RULE_DEFAULTS, callOwnAce: false },
  },
  // 6 players
  {
    label: 'Jack of Clubs',
    description:
      'Partner is the Jack of Clubs. If picker has it, they can call another Jack or play alone.',
    fixed: {
      name: 'jack-of-clubs',
      playerCount: 6,
      handSize: 5,
      blindSize: 2,
      pickerRule: 'autonomous',
      partnerRule: 'jc',
      doubleOnTheBump: false,
    },
    defaults: { noPick: 'leaster', ...HOUSE_RULE_DEFAULTS },
  },
  // 7 players
  {
    label: 'Jack of Diamonds',
    description:
      'Partner is the Jack of Diamonds. If picker has it, they can call another Jack or play alone.',
    fixed: {
      name: 'jack-of-diamonds',
      playerCount: 7,
      handSize: 4,
      blindSize: 4,
      pickerRule: 'autonomous',
      partnerRule: 'jd',
    },
    defaults: { noPick: 'leaster', doubleOnTheBump: false, ...HOUSE_RULE_DEFAULTS },
  },
  {
    label: 'Partner Draft',
    description:
      'Picker draws 2 from blind. Player to their left is partner and draws the other 2.',
    fixed: {
      name: 'partner-draft',
      playerCount: 7,
      handSize: 4,
      blindSize: 4,
      pickerRule: 'autonomous',
      partnerRule: 'left-of-picker',
    },
    defaults: { noPick: 'leaster', doubleOnTheBump: false, ...HOUSE_RULE_DEFAULTS },
  },
  // 8 players
  {
    label: 'Black Queens',
    description: 'Black Queen holders are partners. Player with both goes alone. No blind.',
    fixed: {
      name: 'black-queens',
      playerCount: 8,
      handSize: 4,
      blindSize: 0,
      pickerRule: null,
      partnerRule: 'qc-qs',
      noPick: null,
    },
    defaults: { doubleOnTheBump: false, ...HOUSE_RULE_DEFAULTS },
  },
];
