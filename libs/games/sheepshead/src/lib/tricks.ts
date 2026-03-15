import {
  Card,
  CardName,
  CalledCard,
  Suit,
  TrickState,
  SheepsheadState,
  SheepsheadConfig,
  UserID,
} from './types';
import { cardPower, cardsEqual, isTrump } from './cards';
import { DECK, FAIL_TENS } from './constants';

export interface LegalPlaysResult {
  cards: Card[];
  playHoleCard: boolean;
}

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

  // Find the first non-hole-card play as initial best
  let bestIndex = 0;
  let bestPower = trick.plays[0].isHoleCard ? Infinity : cardPower(leadCard, leadSuit);

  for (let i = 1; i < trick.plays.length; i++) {
    // Hole cards have no trick-taking power
    if (trick.plays[i].isHoleCard) continue;
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

/** Get the suit of a called card. */
function calledCardSuit(calledCard: CalledCard): Suit | null {
  if (calledCard === 'alone') return null;
  const c = DECK.find((d) => d.name === calledCard);
  return c ? c.suit : null;
}

/** Whether the called suit has been led in any completed trick. */
function calledSuitHasBeenLed(state: SheepsheadState): boolean {
  if (!state.calledCard || state.calledCard === 'alone') return false;
  const suit = calledCardSuit(state.calledCard);
  if (!suit) return false;
  return state.tricks.some(
    (t) =>
      t.plays.length > 0 &&
      !isTrump(t.plays[0].card) &&
      t.plays[0].card.suit === suit &&
      t.winner !== null,
  );
}

/** Whether the current trick is being led with the called suit. */
function currentTrickLeadsCalledSuit(state: SheepsheadState, currentTrick: TrickState): boolean {
  if (!state.calledCard || state.calledCard === 'alone') return false;
  if (currentTrick.plays.length === 0) return false;
  const suit = calledCardSuit(state.calledCard);
  if (!suit) return false;
  const leadCard = currentTrick.plays[0].card;
  return !isTrump(leadCard) && leadCard.suit === suit;
}

/**
 * Get the cards a player can legally play given the current game state.
 * Handles basic follow-suit rules and called-ace constraints.
 */
export function legalPlays(
  state: SheepsheadState,
  config: SheepsheadConfig,
  userID: UserID,
): LegalPlaysResult {
  const playerIdx = state.players.findIndex((p) => p.userID === userID);
  const hand = state.players[playerIdx].hand;
  const currentTrick = state.tricks[state.tricks.length - 1];
  const playerRole = state.players[playerIdx].role;

  // --- Basic follow-suit ---

  let baseLegal: Card[];

  if (currentTrick.plays.length === 0) {
    baseLegal = hand;
  } else {
    const leadCard = currentTrick.plays[0].card;
    if (isTrump(leadCard)) {
      const trumpInHand = hand.filter(isTrump);
      baseLegal = trumpInHand.length > 0 ? trumpInHand : hand;
    } else {
      const leadSuit = leadCard.suit;
      const suitInHand = hand.filter((c) => !isTrump(c) && c.suit === leadSuit);
      baseLegal = suitInHand.length > 0 ? suitInHand : hand;
    }
  }

  // --- Called-ace constraints ---

  if (config.partnerRule !== 'called-ace' || !state.calledCard || state.calledCard === 'alone') {
    return { cards: baseLegal, playHoleCard: false };
  }

  const suit = calledCardSuit(state.calledCard);
  if (!suit) return { cards: baseLegal, playHoleCard: false };

  const isFirstLead =
    !calledSuitHasBeenLed(state) && currentTrickLeadsCalledSuit(state, currentTrick);

  if (isFirstLead) {
    // Partner must play the called card
    if (playerRole === 'partner') {
      const calledCardInHand = baseLegal.find((c) => c.name === state.calledCard);
      if (calledCardInHand) {
        return { cards: [calledCardInHand], playHoleCard: false };
      }
    }

    // Picker with hole card: must play the hole card
    if (playerRole === 'picker' && state.hole) {
      return { cards: [], playHoleCard: true };
    }

    // Picker calling a 10: must play the ace of the called suit
    if (playerRole === 'picker' && FAIL_TENS.includes(state.calledCard)) {
      const aceOfSuit = ('a' + suit[0]) as CardName;
      const aceInHand = baseLegal.find((c) => c.name === aceOfSuit);
      if (aceInHand) {
        return { cards: [aceInHand], playHoleCard: false };
      }
    }
  }

  // Picker can't slough their last card of the called suit before it's been led
  if (playerRole === 'picker' && !calledSuitHasBeenLed(state) && !isFirstLead && !state.hole) {
    const calledSuitCards = hand.filter((c) => !isTrump(c) && c.suit === suit);
    if (calledSuitCards.length === 1) {
      const lastCard = calledSuitCards[0];
      const isFollowingSuit =
        currentTrick.plays.length > 0 &&
        !isTrump(currentTrick.plays[0].card) &&
        currentTrick.plays[0].card.suit === suit;
      if (!isFollowingSuit && baseLegal.length > 1) {
        return { cards: baseLegal.filter((c) => !cardsEqual(c, lastCard)), playHoleCard: false };
      }
    }
  }

  return { cards: baseLegal, playHoleCard: false };
}
