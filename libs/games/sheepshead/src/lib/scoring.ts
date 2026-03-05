import { HandState, SheepsheadConfig, CrackState } from './types';
import { sumPoints } from './cards';
import { TOTAL_POINTS } from './constants';

/**
 * Calculate the points captured by the picking team (picker + partner).
 * Buried cards count toward the picker's team.
 */
export function pickingTeamPoints(hand: HandState): number {
  const pickerSeats = new Set<number>();
  if (hand.picker !== null) pickerSeats.add(hand.picker);
  if (hand.partner !== null) pickerSeats.add(hand.partner);

  let points = sumPoints(hand.buried);

  for (const trick of hand.tricks) {
    if (trick.winner !== null && pickerSeats.has(trick.winner)) {
      const trickCards = trick.plays.map((p) => p.card);
      points += sumPoints(trickCards);
    }
  }

  return points;
}

/** Whether schneider applies (losing team took <30 points). */
export function isSchneider(pickerTeamPts: number, pickerWon: boolean): boolean {
  if (pickerWon) return TOTAL_POINTS - pickerTeamPts < 30;
  return pickerTeamPts < 30;
}

/** Whether schwarz applies (losing team took 0 tricks). */
export function isSchwarz(hand: HandState): boolean {
  const pickerSeats = new Set<number>();
  if (hand.picker !== null) pickerSeats.add(hand.picker);
  if (hand.partner !== null) pickerSeats.add(hand.partner);

  const pickerTrickCount = hand.tricks.filter(
    (t) => t.winner !== null && pickerSeats.has(t.winner),
  ).length;

  return pickerTrickCount === 0 || pickerTrickCount === hand.tricks.length;
}

/**
 * Compute the score multiplier for a hand.
 *
 * TODO: finalize multiplier stacking rules (schneider, schwarz, crack, doublers).
 */
export function scoreMultiplier(
  _hand: HandState,
  _config: SheepsheadConfig,
  _crackState: CrackState,
): number {
  /* Placeholder: base multiplier only */
  return 1;
}
