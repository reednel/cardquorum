import * as fc from 'fast-check';
import { SheepsheadPlugin } from '../sheepshead-plugin';
import { type PlayerRole, type SheepsheadConfig, type SheepsheadState } from '../types';
import { makeConfig } from './test-helpers';

/**
 * Validates: Requirements 8.4, 8.5
 *
 * For any terminal Sheepshead game state (phase === 'score' with all scoreDelta values set),
 * buildStats(config, state) should return exactly one PlayerStatRow per player, where each
 * row's userId matches the player's userID, won equals scoreDelta > 0 (or null if scoreDelta
 * is null), and scoreDelta matches the player's scoreDelta value. This includes abandonment
 * states where all players have scoreDelta of 0.
 */

const ROLES: (PlayerRole | null)[] = [null, 'picker', 'partner', 'opposition'];

/**
 * Arbitrary for a terminal Sheepshead state (phase === 'score', all scoreDelta set).
 * Generates states with 3-5 players, each having a non-null scoreDelta.
 */
function arbTerminalState(): fc.Arbitrary<{ config: SheepsheadConfig; state: SheepsheadState }> {
  return fc
    .record({
      playerCount: fc.constantFrom(3, 4, 5) as fc.Arbitrary<3 | 4 | 5>,
      scoreDeltas: fc.array(fc.integer({ min: -10, max: 10 }), { minLength: 3, maxLength: 5 }),
    })
    .chain(({ playerCount, scoreDeltas }) => {
      const deltas = scoreDeltas.slice(0, playerCount);
      return fc
        .record({
          roles: fc.array(fc.constantFrom(...ROLES), {
            minLength: playerCount,
            maxLength: playerCount,
          }),
          userIDs: fc.uniqueArray(fc.integer({ min: 1, max: 10000 }), {
            minLength: playerCount,
            maxLength: playerCount,
          }),
        })
        .map(({ roles, userIDs }) => {
          const config = makeConfig({ playerCount });
          const state: SheepsheadState = {
            players: userIDs.map((id, i) => ({
              userID: id,
              role: roles[i],
              hand: [],
              tricksWon: 0,
              pointsWon: 0,
              cardsWon: [],
              scoreDelta: deltas[i],
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
            noPick: null,
            redeals: null,
          };
          return { config, state };
        });
    });
}

/**
 * Arbitrary for an abandonment state where all players have scoreDelta of 0.
 */
function arbAbandonmentState(): fc.Arbitrary<{
  config: SheepsheadConfig;
  state: SheepsheadState;
}> {
  return (fc.constantFrom(3, 4, 5) as fc.Arbitrary<3 | 4 | 5>).chain((playerCount) =>
    fc
      .uniqueArray(fc.integer({ min: 1, max: 10000 }), {
        minLength: playerCount,
        maxLength: playerCount,
      })
      .map((userIDs) => {
        const config = makeConfig({ playerCount });
        const state: SheepsheadState = {
          players: userIDs.map((id) => ({
            userID: id,
            role: null,
            hand: [],
            tricksWon: 0,
            pointsWon: 0,
            cardsWon: [],
            scoreDelta: 0,
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
          noPick: null,
          redeals: null,
        };
        return { config, state };
      }),
  );
}

/**
 * Arbitrary for a terminal state where some players have null scoreDelta
 * (e.g., schwanzer/no-pick edge cases).
 */
function arbTerminalStateWithNulls(): fc.Arbitrary<{
  config: SheepsheadConfig;
  state: SheepsheadState;
}> {
  return (fc.constantFrom(3, 4, 5) as fc.Arbitrary<3 | 4 | 5>).chain((playerCount) =>
    fc
      .record({
        userIDs: fc.uniqueArray(fc.integer({ min: 1, max: 10000 }), {
          minLength: playerCount,
          maxLength: playerCount,
        }),
        scoreDeltas: fc.array(fc.oneof(fc.constant(null), fc.integer({ min: -10, max: 10 })), {
          minLength: playerCount,
          maxLength: playerCount,
        }),
      })
      .map(({ userIDs, scoreDeltas }) => {
        const config = makeConfig({ playerCount });
        const state: SheepsheadState = {
          players: userIDs.map((id, i) => ({
            userID: id,
            role: null,
            hand: [],
            tricksWon: 0,
            pointsWon: 0,
            cardsWon: [],
            scoreDelta: scoreDeltas[i],
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
          noPick: null,
          redeals: null,
        };
        return { config, state };
      }),
  );
}

describe('Sheepshead buildStats correctness', () => {
  it('returns exactly one PlayerStatRow per player in a terminal state', () => {
    fc.assert(
      fc.property(arbTerminalState(), ({ config, state }) => {
        const result = SheepsheadPlugin.buildStats(config, state);
        expect(result).toHaveLength(state.players.length);
      }),
      { numRuns: 100 },
    );
  });

  it('each row userId matches the corresponding player userID', () => {
    fc.assert(
      fc.property(arbTerminalState(), ({ config, state }) => {
        const result = SheepsheadPlugin.buildStats(config, state);
        for (let i = 0; i < state.players.length; i++) {
          expect(result[i].userId).toBe(state.players[i].userID);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('won equals scoreDelta > 0 when scoreDelta is non-null', () => {
    fc.assert(
      fc.property(arbTerminalState(), ({ config, state }) => {
        const result = SheepsheadPlugin.buildStats(config, state);
        for (let i = 0; i < state.players.length; i++) {
          const player = state.players[i];
          if (player.scoreDelta !== null) {
            expect(result[i].won).toBe(player.scoreDelta > 0);
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  it('won is null when scoreDelta is null', () => {
    fc.assert(
      fc.property(arbTerminalStateWithNulls(), ({ config, state }) => {
        const result = SheepsheadPlugin.buildStats(config, state);
        for (let i = 0; i < state.players.length; i++) {
          const player = state.players[i];
          if (player.scoreDelta === null) {
            expect(result[i].won).toBeNull();
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  it('scoreDelta in each row matches the player scoreDelta value', () => {
    fc.assert(
      fc.property(arbTerminalState(), ({ config, state }) => {
        const result = SheepsheadPlugin.buildStats(config, state);
        for (let i = 0; i < state.players.length; i++) {
          expect(result[i].scoreDelta).toBe(state.players[i].scoreDelta);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('handles abandonment states where all scoreDelta values are 0', () => {
    fc.assert(
      fc.property(arbAbandonmentState(), ({ config, state }) => {
        const result = SheepsheadPlugin.buildStats(config, state);
        expect(result).toHaveLength(state.players.length);
        for (let i = 0; i < state.players.length; i++) {
          expect(result[i].userId).toBe(state.players[i].userID);
          expect(result[i].won).toBe(false);
          expect(result[i].scoreDelta).toBe(0);
        }
      }),
      { numRuns: 100 },
    );
  });
});
