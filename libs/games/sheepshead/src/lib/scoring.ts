import { SheepsheadConfig, SheepsheadState, UserID } from './types';
import { sumPoints } from './cards';
import { TOTAL_POINTS } from './constants';

/**
 * Calculate the points captured by the picking team (picker + partner/s).
 * Buried cards count toward the picker's team.
 */
export function pickingTeamPoints(state: SheepsheadState): number {
  const pickingTeam = new Set<UserID>();
  for (const player of state.players) {
    if (player.role === 'picker' || player.role === 'partner') {
      pickingTeam.add(player.userID);
    }
  }

  let points = sumPoints(state.buried);

  for (const trick of state.tricks) {
    if (trick.winner !== null && pickingTeam.has(trick.winner)) {
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
export function isSchwarz(state: SheepsheadState): boolean {
  const pickingTeam = new Set<UserID>();
  for (const player of state.players) {
    if (player.role === 'picker' || player.role === 'partner') {
      pickingTeam.add(player.userID);
    }
  }

  const pickingTeamTricks = state.tricks.filter(
    (t) => t.winner !== null && pickingTeam.has(t.winner),
  ).length;

  return pickingTeamTricks === 0 || pickingTeamTricks === state.tricks.length;
}

/**
 * Compute the score multiplier for a hand.
 *
 * TODO: finalize multiplier stacking rules (schneider, schwarz, crack, doublers).
 */
export function scoreMultiplier(_state: SheepsheadState, _config: SheepsheadConfig): number {
  /* Placeholder: base multiplier only */
  return 1;
}
