import { DECK } from '../constants';
import { Card, PickPhaseResult, SheepsheadConfig, SheepsheadState } from '../types';

/** Look up a card by short name (e.g. 'ac', 'qc'). Throws if not found. */
export function card(name: string): Card {
  const c = DECK.find((d) => d.name === name);
  if (!c) throw new Error(`Card not found: ${name}`);
  return c;
}

/** Build a SheepsheadConfig with sensible defaults, overrideable. */
export function makeConfig(overrides: Partial<SheepsheadConfig> = {}): SheepsheadConfig {
  return {
    name: 'jack-of-diamonds',
    playerCount: 3,
    handSize: 10,
    blindSize: 2,
    pickerRule: 'autonomous',
    partnerRule: 'jd',
    noPick: 'leaster',
    cracking: false,
    blitzing: false,
    doubleOnTheBump: false,
    partnerOffTheHook: false,
    noAceFaceTrump: false,
    multiplicityLimit: null,
    callOwnAce: null,
    ...overrides,
  };
}

/** Build a blank SheepsheadState for the given player count. */
export function makeState(playerCount = 3): SheepsheadState {
  return {
    players: Array.from({ length: playerCount }, (_, i) => ({
      userID: i + 1,
      role: null,
      hand: [],
      tricksWon: 0,
      pointsWon: 0,
      cardsWon: [],
      scoreDelta: null,
    })),
    phase: 'deal' as const,
    trickNumber: 0,
    activePlayer: null,
    blind: [],
    buried: [],
    calledCard: null,
    hole: null,
    tricks: [],
    crack: null,
    blitz: null,
    previousGameDouble: null,
    noPick: null,
    redeals: null,
  };
}

/** Extract state from a PickPhaseResult, failing if outcome is not 'continue'. */
export function pickContinue(result: PickPhaseResult): SheepsheadState {
  if (result.outcome !== 'continue') {
    throw new Error(`Expected pick outcome 'continue', got '${result.outcome}'`);
  }
  return result.state;
}

/** Build a noPick score-phase state with given points and tricks. */
export function makeNoPickScoreState(
  pointsWon: number[],
  tricksWon: number[],
  noPick: SheepsheadConfig['noPick'],
): SheepsheadState {
  return {
    players: pointsWon.map((pts, i) => ({
      userID: i + 1,
      role: 'opposition' as const,
      hand: [],
      tricksWon: tricksWon[i],
      pointsWon: pts,
      cardsWon: [],
      scoreDelta: null,
    })),
    phase: 'score',
    trickNumber: 0,
    activePlayer: null,
    blind: [],
    buried: [],
    calledCard: null,
    hole: null,
    tricks: [],
    crack: null,
    blitz: null,
    previousGameDouble: null,
    noPick,
    redeals: null,
  };
}
