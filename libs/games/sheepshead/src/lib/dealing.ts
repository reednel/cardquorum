import { Card } from './types';
import { DECK } from './constants';

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
 * Determine blind size and cards-per-player for a given player count.
 * Standard Sheepshead dealing for 2–8 players.
 *
 * TODO: finalize dealing rules per player count.
 */
export function dealingLayout(playerCount: number): { cardsPerPlayer: number; blindSize: number } {
  switch (playerCount) {
    case 2:
      return { cardsPerPlayer: 14, blindSize: 4 };
    case 3:
      return { cardsPerPlayer: 10, blindSize: 2 };
    case 4:
      return { cardsPerPlayer: 7, blindSize: 4 };
    case 5:
      return { cardsPerPlayer: 6, blindSize: 2 };
    case 6:
      return { cardsPerPlayer: 5, blindSize: 2 };
    case 7:
      return { cardsPerPlayer: 4, blindSize: 4 };
    case 8:
      return { cardsPerPlayer: 4, blindSize: 0 };
    default:
      throw new Error(`Unsupported player count: ${playerCount}`);
  }
}

/**
 * Deal cards from a shuffled deck into player hands and a blind.
 * Returns the hands (indexed by seat) and the blind.
 */
export function deal(deck: Card[], playerCount: number): { hands: Card[][]; blind: Card[] } {
  const { cardsPerPlayer, blindSize } = dealingLayout(playerCount);

  const hands: Card[][] = Array.from({ length: playerCount }, () => []);
  let cursor = 0;

  /* Deal blind first */
  const blind = deck.slice(cursor, cursor + blindSize);
  cursor += blindSize;

  /* Deal to each player */
  for (let i = 0; i < playerCount; i++) {
    hands[i] = deck.slice(cursor, cursor + cardsPerPlayer);
    cursor += cardsPerPlayer;
  }

  return { hands, blind };
}
