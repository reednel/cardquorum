import { Card, TrickState } from './types';
import { cardPower, isTrump, failSuit } from './cards';

/**
 * Determine the winner of a completed trick.
 * The lead card establishes the suit to follow; trump always beats fail.
 */
export function evaluateTrick(trick: TrickState): number {
  if (trick.plays.length === 0) {
    throw new Error('Cannot evaluate an empty trick');
  }

  const leadCard = trick.plays[0].card;
  const leadFailSuit = failSuit(leadCard);
  /* If lead is trump, comparison suit is null (all trump compared by power) */
  const comparisonSuit = isTrump(leadCard) ? null : leadFailSuit;

  let bestIndex = 0;
  let bestPower = cardPower(trick.plays[0].card, comparisonSuit);

  for (let i = 1; i < trick.plays.length; i++) {
    const power = cardPower(trick.plays[i].card, comparisonSuit);
    /* -1 means the card doesn't compete (wrong fail suit, not trump) */
    if (power === -1) continue;
    if (bestPower === -1 || power < bestPower) {
      bestPower = power;
      bestIndex = i;
    }
  }

  return trick.plays[bestIndex].seatIndex;
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
