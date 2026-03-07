import { Card, Rank, Suit, TrickState } from './types';
import { TRUMP_ORDER, FAIL_RANK_ORDER } from './constants';

/** Whether a card is trump (queens, jacks, or diamonds). */
export function isTrump(card: Card): boolean {
  return card.rank === 'queen' || card.rank === 'jack' || card.suit === 'diamonds';
}

/** Total points in a set of cards. */
export function sumPoints(tricks: TrickState[]): number;
export function sumPoints(cards: Card[] | null): number;
export function sumPoints(arg: TrickState[] | Card[] | null): number {
  if (arg === null || arg.length === 0) return 0;
  if ('plays' in arg[0]) {
    return (arg as TrickState[]).reduce((sum, t) => {
      return sum + t.plays.reduce((s, p) => s + p.card.points, 0);
    }, 0);
  }
  return (arg as Card[]).reduce((sum, c) => sum + c.points, 0);
}

/**
 * Power rank of a card (lower index = stronger).
 * Trump cards are always stronger than fail cards.
 * Returns -1 if the card isn't relevant to the comparison (wrong fail suit).
 */
export function cardPower(card: Card, leadSuit: Suit): number {
  const trumpIndex = TRUMP_ORDER.findIndex((t) => t === card.name);
  if (trumpIndex !== -1) return trumpIndex;

  if (leadSuit && card.suit === leadSuit && !isTrump(card)) {
    const failIndex = FAIL_RANK_ORDER.indexOf(card.rank as Rank);
    if (failIndex !== -1) return TRUMP_ORDER.length + failIndex;
  }

  return -1;
}

/** Whether two cards are the same. */
export function cardsEqual(a: Card, b: Card): boolean {
  return a.suit === b.suit && a.rank === b.rank;
}
