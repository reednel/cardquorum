import * as fc from 'fast-check';
import { DECK } from '../constants';
import { SheepsheadPlugin } from '../sheepshead-plugin';
import { legalPlays } from '../tricks';
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
const NON_HAND_STACKS = ['trick-pile', 'buried', 'blind', 'unknown-stack'];

/**
 * Arbitrary for a play-phase state where the active player has legal cards selected from hand.
 */
function arbPlayPhaseWithLegalCards(): fc.Arbitrary<{
  config: SheepsheadConfig;
  state: SheepsheadState;
  userID: number;
  selectedCards: string[];
}> {
  return fc
    .record({
      activePlayerIdx: fc.constantFrom(0, 1, 2),
      shuffledDeck: fc.shuffledSubarray([...DECK], { minLength: 6, maxLength: 32 }),
    })
    .chain(({ activePlayerIdx, shuffledDeck }) => {
      const userIDs = [1, 2, 3];
      const hand1 = shuffledDeck.slice(0, Math.min(4, shuffledDeck.length));
      const hand2 = shuffledDeck.slice(4, Math.min(8, shuffledDeck.length));
      const hand3 = shuffledDeck.slice(8, Math.min(12, shuffledDeck.length));
      const hands = [hand1, hand2, hand3];

      const state: SheepsheadState = {
        players: userIDs.map((id, i) => ({
          userID: id,
          role: i === activePlayerIdx ? 'picker' : 'opposition',
          hand: hands[i],
          tricksWon: 0,
          pointsWon: 0,
          cardsWon: [],
          scoreDelta: null,
        })),
        phase: 'play',
        trickNumber: 1,
        activePlayer: userIDs[activePlayerIdx],
        blind: [],
        buried: [],
        calledCard: null,
        hole: null,
        tricks: [{ plays: [], winner: null }],
        crack: null,
        blitz: null,
        previousGameDouble: null,
        noPick: null,
        redeals: null,
      };

      const config = makeConfig();
      const userID = userIDs[activePlayerIdx];
      const { cards: legalCards } = legalPlays(state, config, userID);

      if (legalCards.length === 0) {
        // Fallback: select nothing (will be filtered by fc.pre)
        return fc.constant({ config, state, userID, selectedCards: [] as string[] });
      }

      return fc.integer({ min: 1, max: Math.min(legalCards.length, 3) }).map((count) => {
        const selected = legalCards.slice(0, count).map((c) => c.name);
        return { config, state, userID, selectedCards: selected };
      });
    })
    .filter(({ selectedCards }) => selectedCards.length > 0);
}

/**
 * Arbitrary for a bury-phase state where the picker selects the correct number of cards.
 */
function arbBuryPhaseWithCorrectCount(): fc.Arbitrary<{
  config: SheepsheadConfig;
  state: SheepsheadState;
  userID: number;
  selectedCards: string[];
}> {
  return fc
    .record({
      pickerIdx: fc.constantFrom(0, 1, 2),
      shuffledDeck: fc.shuffledSubarray([...DECK], { minLength: 10, maxLength: 32 }),
      configName: fc.constantFrom('jack-of-diamonds', 'partner-draft'),
      blindSize: fc.constantFrom(2, 4),
    })
    .map(({ pickerIdx, shuffledDeck, configName, blindSize }) => {
      const userIDs = [1, 2, 3];
      const buryCount = configName === 'partner-draft' ? Math.floor(blindSize / 2) : blindSize;
      // Give the picker enough cards to bury
      const pickerHand = shuffledDeck.slice(0, Math.max(buryCount + 2, 4));
      const hand2 = shuffledDeck.slice(pickerHand.length, pickerHand.length + 3);
      const hand3 = shuffledDeck.slice(pickerHand.length + 3, pickerHand.length + 6);
      const hands = [[], [], []] as Card[][];
      hands[pickerIdx] = pickerHand;
      hands[(pickerIdx + 1) % 3] = hand2;
      hands[(pickerIdx + 2) % 3] = hand3;

      const state: SheepsheadState = {
        players: userIDs.map((id, i) => ({
          userID: id,
          role: i === pickerIdx ? 'picker' : 'opposition',
          hand: hands[i],
          tricksWon: 0,
          pointsWon: 0,
          cardsWon: [],
          scoreDelta: null,
        })),
        phase: 'bury',
        trickNumber: 0,
        activePlayer: userIDs[pickerIdx],
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

      const config = makeConfig({ name: configName, blindSize });
      const userID = userIDs[pickerIdx];
      const selectedCards = pickerHand.slice(0, buryCount).map((c) => c.name);

      return { config, state, userID, selectedCards };
    })
    .filter(({ selectedCards }) => selectedCards.length > 0);
}

/**
 * Arbitrary for a random state across all phases (reuses the purity test pattern).
 */
function arbRandomState(): fc.Arbitrary<{
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
        selectedCardCount,
        callerIdx,
      }) => {
        const hand1 = shuffledDeck.slice(0, Math.min(2, shuffledDeck.length));
        const hand2 = shuffledDeck.slice(2, Math.min(4, shuffledDeck.length));
        const hand3 = shuffledDeck.slice(4, Math.min(6, shuffledDeck.length));

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
          blind: [],
          buried: [],
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
        const callerHand = state.players[callerIdx].hand;
        const selected = callerHand
          .slice(0, Math.min(selectedCardCount, callerHand.length))
          .map((c) => c.name);

        const config = makeConfig();

        return { config, state, userID, sourceStackId: 'hand', selectedCards: selected };
      },
    );
}

describe('getValidTargets returns correct targets per game phase', () => {
  it('returns ["trick-pile"] during play phase when active player selects legal cards from hand', () => {
    fc.assert(
      fc.property(arbPlayPhaseWithLegalCards(), ({ config, state, userID, selectedCards }) => {
        const result = SheepsheadPlugin.getValidTargets!(
          config,
          state,
          userID,
          'hand',
          selectedCards,
        );
        expect(result).toEqual(['trick-pile']);
      }),
      { numRuns: 100 },
    );
  });

  it('returns ["buried"] during bury phase when picker selects correct card count from hand', () => {
    fc.assert(
      fc.property(arbBuryPhaseWithCorrectCount(), ({ config, state, userID, selectedCards }) => {
        const result = SheepsheadPlugin.getValidTargets!(
          config,
          state,
          userID,
          'hand',
          selectedCards,
        );
        expect(result).toEqual(['buried']);
      }),
      { numRuns: 100 },
    );
  });

  it('returns [] for non-play, non-bury phases', () => {
    const nonTargetPhases: GamePhase[] = ['deal', 'pick', 'call', 'score'];
    fc.assert(
      fc.property(
        arbRandomState().filter(({ state }) => nonTargetPhases.includes(state.phase)),
        ({ config, state, userID, selectedCards }) => {
          const result = SheepsheadPlugin.getValidTargets!(
            config,
            state,
            userID,
            'hand',
            selectedCards,
          );
          expect(result).toEqual([]);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('returns [] when source stack is not "hand"', () => {
    fc.assert(
      fc.property(
        arbRandomState(),
        fc.constantFrom(...NON_HAND_STACKS),
        ({ config, state, userID, selectedCards }, sourceStackId) => {
          const result = SheepsheadPlugin.getValidTargets!(
            config,
            state,
            userID,
            sourceStackId,
            selectedCards,
          );
          expect(result).toEqual([]);
        },
      ),
      { numRuns: 100 },
    );
  });
});
