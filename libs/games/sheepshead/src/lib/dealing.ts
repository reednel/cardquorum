import { Card, SheepsheadConfig } from './types';
import { DECK } from './constants';
import { isTrump } from './cards';

/** Returns a new shuffled copy of the deck. */
export function createShuffledDeck(): Card[] {
  const deck = [...DECK];
  /* Fisher-Yates shuffle */
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

/**
 * Deal cards from a shuffled deck into player hands and a blind.
 * Uses handSize and blindSize from the game config.
 */
export function deal(
  deck: Card[],
  config: Pick<SheepsheadConfig, 'playerCount' | 'handSize' | 'blindSize'>,
): { hands: Card[][]; blind: Card[] } {
  const { playerCount, handSize, blindSize } = config;

  const hands: Card[][] = Array.from({ length: playerCount }, () => []);
  let cursor = 0;

  /* Deal blind first */
  const blind = deck.slice(cursor, cursor + blindSize);
  cursor += blindSize;

  /* Deal to each player */
  for (let i = 0; i < playerCount; i++) {
    hands[i] = deck.slice(cursor, cursor + handSize);
    cursor += handSize;
  }

  return { hands, blind };
}

/**
 * Check if any hand qualifies for a no-ace-no-face-no-trump redeal.
 * Returns true if at least one player has no aces, no face cards (jack/queen/king), and no trump.
 */
export function hasNoAceFaceTrump(hands: Card[][]): boolean {
  const faceRanks = new Set(['ace', 'jack', 'queen', 'king']);
  return hands.some((hand) => hand.every((c) => !faceRanks.has(c.rank) && !isTrump(c)));
}
