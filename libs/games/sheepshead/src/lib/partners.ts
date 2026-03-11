import { SheepsheadState, UserID, CardName } from './types';

/**
 * Determine the partner by Jack of Diamonds rule.
 * The player holding the JD is the partner.
 * Returns null if no one holds it (e.g., it's in the blind).
 */
export function determinePartnerJD(state: SheepsheadState): UserID | null {
  return determinePartnerByCard(state, 'jd');
}

/**
 * Determine the partner by called card.
 * The player holding the called card (ace or 10) is the partner.
 * Returns null if no one holds it.
 */
export function determinePartnerCalledAce(
  state: SheepsheadState,
  calledCard: CardName,
): UserID | null {
  return determinePartnerByCard(state, calledCard);
}

/**
 * Find the player holding a specific card.
 * Returns their userID, or null if no one holds it.
 */
export function determinePartnerByCard(state: SheepsheadState, cardName: CardName): UserID | null {
  for (const player of state.players) {
    if (player.hand.some((c) => c.name === cardName)) {
      return player.userID;
    }
  }
  return null;
}

/**
 * For card-pair partnership rules (qc-qs, qs-jc, qc-7d):
 * Find who holds each card. The first card's holder becomes 'picker',
 * the second card's holder becomes 'partner'. If one player holds both,
 * they play alone as 'picker'. Everyone else is opposition.
 */
export function assignCardPairPartners(
  state: SheepsheadState,
  card1: CardName,
  card2: CardName,
): SheepsheadState {
  const holder1 = determinePartnerByCard(state, card1);
  const holder2 = determinePartnerByCard(state, card2);

  const players = state.players.map((p) => {
    if (p.userID === holder1) return { ...p, role: 'picker' as const };
    if (holder1 !== holder2 && p.userID === holder2) return { ...p, role: 'partner' as const };
    return { ...p, role: 'opposition' as const };
  });

  return { ...state, players };
}

/**
 * Assign partner based on a rule.
 * For rules determined by card holdings (jd, jc, qc-qs, qs-jc, qc-7d),
 * assigns roles immediately. For 'left-of-picker', uses seat position.
 * For 'first-trick', partner is deferred until the first trick is won.
 */
export function assignPartnerByRule(state: SheepsheadState, rule: string): SheepsheadState {
  switch (rule) {
    case 'jd':
    case 'jc':
      return assignSingleCardPartner(state, rule as CardName);
    case 'qc-qs':
      return assignCardPairPartners(state, 'qc', 'qs');
    case 'qs-jc':
      return assignCardPairPartners(state, 'qs', 'jc');
    case 'qc-7d':
      return assignCardPairPartners(state, 'qc', '7d');
    case 'left-of-picker':
      return assignLeftOfPicker(state);
    case 'first-trick':
      // Deferred — partner is determined when the first trick is won
      return state;
    default:
      return state;
  }
}

/**
 * For single-card partner rules (jd, jc): the card holder is the partner
 * of the existing picker. If the picker holds the card, no partner.
 */
function assignSingleCardPartner(state: SheepsheadState, cardName: CardName): SheepsheadState {
  const partnerID = determinePartnerByCard(state, cardName);
  if (partnerID === null) return state;

  const players = state.players.map((p) => {
    if (p.role === 'picker') return p;
    if (p.userID === partnerID) return { ...p, role: 'partner' as const };
    return { ...p, role: 'opposition' as const };
  });

  return { ...state, players };
}

/**
 * Partner is the player to the picker's left (next in seat order).
 */
function assignLeftOfPicker(state: SheepsheadState): SheepsheadState {
  const pickerIdx = state.players.findIndex((p) => p.role === 'picker');
  if (pickerIdx === -1) return state;

  const partnerIdx = (pickerIdx + 1) % state.players.length;

  const players = state.players.map((p, i) => {
    if (p.role === 'picker') return p;
    if (i === partnerIdx) return { ...p, role: 'partner' as const };
    return { ...p, role: 'opposition' as const };
  });

  return { ...state, players };
}
