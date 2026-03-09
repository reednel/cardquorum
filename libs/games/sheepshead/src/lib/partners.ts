import { SheepsheadState, UserID, Suit } from './types';

/**
 * Determine the partner by Jack of Diamonds rule.
 * The player holding the JD is the partner.
 * Returns null if no one holds it (e.g., it's in the blind).
 */
export function determinePartnerJD(state: SheepsheadState): UserID | null {
  for (const player of state.players) {
    if (player.hand.some((c) => c.name === 'jd')) {
      return player.userID;
    }
  }
  return null;
}

/**
 * Determine the partner by called-ace rule.
 * The player holding the ace of the called suit is the partner.
 * Returns null if no one holds it (shouldn't happen if call is valid).
 */
export function determinePartnerCalledAce(state: SheepsheadState, suit: Suit): UserID | null {
  const aceName = `a${suit[0]}` as const; // 'ac', 'as', 'ah' — never 'ad' (diamonds is trump)
  for (const player of state.players) {
    if (player.hand.some((c) => c.name === aceName)) {
      return player.userID;
    }
  }
  return null;
}

/**
 * Assign partner based on a non-called-ace rule.
 * For rules that can be determined at bury time (jd, jc-qs, qc-7d),
 * assigns roles immediately. For 'first-trick', partner is revealed later.
 *
 * TODO: implement jc-qs, first-trick, qc-7d partner rules.
 */
export function assignPartnerByRule(state: SheepsheadState, rule: string): SheepsheadState {
  let partnerID: UserID | null = null;

  switch (rule) {
    case 'jd':
      partnerID = determinePartnerJD(state);
      break;
    case 'jc-qs':
    case 'first-trick':
    case 'qc-7d':
      // TODO: implement these partner rules
      return state;
    default:
      return state;
  }

  if (partnerID === null) return state;

  const players = state.players.map((p) => {
    if (p.role === 'picker') return p;
    if (p.userID === partnerID) return { ...p, role: 'partner' as const };
    return { ...p, role: 'opposition' as const };
  });

  return { ...state, players };
}
