import { Card, TrickState } from './types';
import { cardPower, isTrump } from './cards';

/**
 * Determine the winner of a completed trick.
 * The lead card establishes the suit to follow; trump always beats fail.
 */
export function evaluateTrick(trick: TrickState): number {
  if (trick.plays.length === 0) {
    throw new Error('Cannot evaluate an empty trick');
  }

  const leadCard = trick.plays[0].card;
  const leadSuit = leadCard.suit;

  let bestIndex = 0;
  let bestPower = cardPower(leadCard, leadSuit);

  for (let i = 1; i < trick.plays.length; i++) {
    const power = cardPower(trick.plays[i].card, leadSuit);
    /* -1 means the card doesn't compete (wrong fail suit, not trump) */
    if (power === -1) continue;
    if (power < bestPower) {
      bestPower = power;
      bestIndex = i;
    }
  }

  return trick.plays[bestIndex].player;
}

/**
 * Get the cards a player can legally play given their hand and the current trick.
 *
 * TODO: implement full follow-suit rules.
 */
export function legalPlays(hand: Card[], currentTrick: TrickState): Card[] {
  /* If leading, any card is valid */
  if (currentTrick.plays.length === 0) return hand;

  const leadCard = currentTrick.plays[0].card;
  const leadIsTrump = isTrump(leadCard);

  if (leadIsTrump) {
    /* Must follow with trump if possible */
    const trumpInHand = hand.filter(isTrump);
    return trumpInHand.length > 0 ? trumpInHand : hand;
  }

  /* Must follow the fail suit if possible */
  const leadSuit = leadCard.suit;
  const suitInHand = hand.filter((c) => !isTrump(c) && c.suit === leadSuit);
  return suitInHand.length > 0 ? suitInHand : hand;
}
