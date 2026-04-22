import * as fc from 'fast-check';
import { DECK } from '../constants';
import { SheepsheadPlugin } from '../sheepshead-plugin';
import {
  Card,
  GamePhase,
  PlayerRole,
  SheepsheadConfig,
  SheepsheadState,
  TrickState,
} from '../types';

/** Build a config with sensible defaults. */
function makeConfig(overrides: Partial<SheepsheadConfig> = {}): SheepsheadConfig {
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
    cardsRemoved: [],
    ...overrides,
  };
}

const PHASES: GamePhase[] = ['deal', 'pick', 'bury', 'call', 'play', 'score'];
const ROLES: (PlayerRole | null)[] = [null, 'picker', 'partner', 'opposition'];
const SOURCE_STACKS = ['hand', 'trick-pile', 'buried', 'blind', 'unknown-stack'];

/**
 * Arbitrary for a random Sheepshead state with 3 players.
 * Shuffles the deck and distributes cards to hands, blind, and buried.
 */
function arbSheepsheadState(): fc.Arbitrary<{
  config: SheepsheadConfig;
  state: SheepsheadState;
  userID: number;
  sourceStackId: string;
  selectedCards: string[];
}> {
  return fc
    .record({
      phase: fc.constantFrom(...PHASES),
      roles: fc.tuple(
        fc.constantFrom(...ROLES),
        fc.constantFrom(...ROLES),
        fc.constantFrom(...ROLES),
      ),
      activePlayerIdx: fc.constantFrom(0, 1, 2, -1),
      shuffledDeck: fc.shuffledSubarray([...DECK], { minLength: 6, maxLength: 32 }),
      trickNumber: fc.integer({ min: 0, max: 10 }),
      sourceStackId: fc.constantFrom(...SOURCE_STACKS),
      selectedCardCount: fc.integer({ min: 0, max: 4 }),
      callerIdx: fc.constantFrom(0, 1, 2),
    })
    .map(
      ({
        phase,
        roles,
        activePlayerIdx,
        shuffledDeck,
        trickNumber,
        sourceStackId,
        selectedCardCount,
        callerIdx,
      }) => {
        // Distribute shuffled cards: first 3 chunks for hands, then blind, then buried
        const hand1 = shuffledDeck.slice(0, Math.min(2, shuffledDeck.length));
        const hand2 = shuffledDeck.slice(2, Math.min(4, shuffledDeck.length));
        const hand3 = shuffledDeck.slice(4, Math.min(6, shuffledDeck.length));
        const blind = shuffledDeck.slice(6, Math.min(8, shuffledDeck.length));
        const buried = shuffledDeck.slice(8, Math.min(10, shuffledDeck.length));

        const userIDs = [1, 2, 3];
        const activePlayer = activePlayerIdx === -1 ? null : userIDs[activePlayerIdx];

        const tricks: TrickState[] = phase === 'play' ? [{ plays: [], winner: null }] : [];

        const state: SheepsheadState = {
          players: userIDs.map((id, i) => ({
            userID: id,
            role: roles[i],
            hand: [hand1, hand2, hand3][i],
            tricksWon: 0,
            pointsWon: 0,
            cardsWon: [],
            scoreDelta: null,
          })),
          phase,
          trickNumber,
          activePlayer,
          blind,
          buried,
          calledCard: null,
          hole: null,
          tricks,
          crack: null,
          blitz: null,
          previousGameDouble: null,
          noPick: null,
          redeals: null,
        };

        const userID = userIDs[callerIdx];

        // Pick selected cards from the caller's hand
        const callerHand = state.players[callerIdx].hand;
        const selected = callerHand
          .slice(0, Math.min(selectedCardCount, callerHand.length))
          .map((c) => c.name);

        const config = makeConfig();

        return { config, state, userID, sourceStackId, selectedCards: selected };
      },
    );
}

describe('getValidTargets is a pure query', () => {
  it('does not mutate the game state when called', () => {
    fc.assert(
      fc.property(
        arbSheepsheadState(),
        ({ config, state, userID, sourceStackId, selectedCards }) => {
          const stateBefore = JSON.parse(JSON.stringify(state));

          SheepsheadPlugin.getValidTargets!(config, state, userID, sourceStackId, selectedCards);

          expect(state).toEqual(stateBefore);
        },
      ),
      { numRuns: 100 },
    );
  });
});
