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

/**
 * Arbitrary for a random Sheepshead state with 3 players and a randomly chosen player.
 */
function arbStateAndPlayer(): fc.Arbitrary<{
  config: SheepsheadConfig;
  state: SheepsheadState;
  userId: number;
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
      abandonerIdx: fc.constantFrom(0, 1, 2),
    })
    .map(({ phase, roles, activePlayerIdx, shuffledDeck, trickNumber, abandonerIdx }) => {
      const hand1 = shuffledDeck.slice(0, Math.min(4, shuffledDeck.length));
      const hand2 = shuffledDeck.slice(4, Math.min(8, shuffledDeck.length));
      const hand3 = shuffledDeck.slice(8, Math.min(12, shuffledDeck.length));

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
        blind: shuffledDeck.slice(12, Math.min(14, shuffledDeck.length)),
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

      return { config: makeConfig(), state, userId: userIDs[abandonerIdx] };
    });
}

describe('onPlayerAbandon produces a terminal game state', () => {
  it('isGameOver returns true for any game state and any abandoning player', () => {
    fc.assert(
      fc.property(arbStateAndPlayer(), ({ config, state, userId }) => {
        const result = SheepsheadPlugin.onPlayerAbandon!(config, state, userId);
        expect(SheepsheadPlugin.isGameOver(result)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('all players have a non-null scoreDelta after abandon', () => {
    fc.assert(
      fc.property(arbStateAndPlayer(), ({ config, state, userId }) => {
        const result = SheepsheadPlugin.onPlayerAbandon!(config, state, userId);
        for (const player of result.players) {
          expect(player.scoreDelta).not.toBeNull();
        }
      }),
      { numRuns: 100 },
    );
  });

  it('sets phase to score after abandon', () => {
    fc.assert(
      fc.property(arbStateAndPlayer(), ({ config, state, userId }) => {
        const result = SheepsheadPlugin.onPlayerAbandon!(config, state, userId);
        expect(result.phase).toBe('score');
      }),
      { numRuns: 100 },
    );
  });
});
