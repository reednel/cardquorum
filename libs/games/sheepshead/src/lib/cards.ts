import { Card, Rank } from './types';
import { TRUMP_ORDER, FAIL_RANK_ORDER } from './constants';

/** Whether a card is trump (queens, jacks, or diamonds). */
export function isTrump(card: Card): boolean {
  return card.rank === 'queen' || card.rank === 'jack' || card.suit === 'diamonds';
}

/** Total points in a set of cards. */
export function sumPoints(cards: Card[]): number {
  return cards.reduce((sum, c) => sum + c.points, 0);
}

/**
 * Power rank of a card (lower index = stronger).
 * Trump cards are always stronger than fail cards.
 * Returns -1 if the card isn't relevant to the comparison (wrong fail suit).
 */
export function cardPower(card: Card, leadSuit: string | null): number {
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

/**
 * The effective "fail suit" of a card for follow-suit purposes.
 * Trump cards have no fail suit (they belong to the trump "suit").
 * Returns null for trump cards.
 */
export function failSuit(card: Card): string | null {
  if (isTrump(card)) return null;
  return card.suit;
}
