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
export function gotSchneidered(pickerTeamPts: number, pickerWon: boolean): boolean {
  if (pickerWon) return TOTAL_POINTS - pickerTeamPts < 30;
  return pickerTeamPts < 30;
}

/** Whether losing team took 0 tricks (schwarz). */
export function gotSchwarzed(state: SheepsheadState): boolean {
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
 * Multipliers stack multiplicatively:
 *   base (1) × schneider (×2) × schwarz (×3) × crack/re-crack
 */
export function scoreMultiplier(state: SheepsheadState, config: SheepsheadConfig): number {
  const pickerPts = pickingTeamPoints(state);
  const pickerWon = pickerPts >= 61;

  let multiplier = 1;

  if (gotSchwarzed(state)) {
    multiplier *= 3;
  } else if (gotSchneidered(pickerPts, pickerWon)) {
    multiplier *= 2;
  }

  if (config.cracking && state.crack) {
    if (state.crack.reCrackedBy !== null) {
      multiplier *= 4; // re-crack
    } else {
      multiplier *= 2; // crack
    }
  }

  if (config.blitzing && state.blitz) {
    multiplier *= 2;
  }

  if (config.doubleOnTheBump && !pickerWon) {
    multiplier *= 2;
  }

  if (config.multiplicityLimit !== null && multiplier > config.multiplicityLimit) {
    multiplier = config.multiplicityLimit;
  }

  return multiplier;
}
