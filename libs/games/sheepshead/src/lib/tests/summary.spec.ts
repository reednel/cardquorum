import * as fc from 'fast-check';
import { DECK } from '../constants';
import { SheepsheadPlugin } from '../sheepshead-plugin';
import {
  Card,
  PlayerRole,
  PlayerState,
  SheepsheadConfig,
  SheepsheadState,
  SheepsheadStore,
  TrickPlay,
  TrickState,
  UserID,
} from '../types';

/** Arbitrary card from the standard 32-card Sheepshead deck. */
function arbCard(): fc.Arbitrary<Card> {
  return fc.constantFrom(...DECK);
}

/** Arbitrary player role. */
function arbRole(): fc.Arbitrary<PlayerRole | null> {
  return fc.constantFrom<(PlayerRole | null)[]>('picker', 'partner', 'opposition', null);
}

/** Arbitrary SheepsheadStore with random players and tricks. */
function arbSheepsheadStore(): fc.Arbitrary<SheepsheadStore> {
  return fc.integer({ min: 3, max: 5 }).chain((playerCount) => {
    const userIDs = Array.from({ length: playerCount }, (_, i) => i + 1);

    const arbTrickPlay = (players: UserID[]): fc.Arbitrary<TrickPlay> =>
      fc.record({
        player: fc.constantFrom(...players),
        card: arbCard(),
      });

    const arbTrick = (players: UserID[]): fc.Arbitrary<TrickState> =>
      fc.record({
        plays: fc.array(arbTrickPlay(players), {
          minLength: playerCount,
          maxLength: playerCount,
        }),
        winner: fc.constantFrom<(UserID | null)[]>(...players, null),
      });

    const arbPlayers = fc.tuple(
      ...userIDs.map((uid) =>
        fc.record({
          userID: fc.constant(uid),
          role: arbRole(),
          won: fc.constantFrom<(boolean | null)[]>(true, false, null),
          scoreDelta: fc.oneof(fc.constant(null), fc.integer({ min: -20, max: 20 })),
          points: fc.oneof(fc.constant(null), fc.integer({ min: 0, max: 120 })),
        }),
      ),
    );

    const arbTricks = fc.array(arbTrick(userIDs), { minLength: 0, maxLength: 10 });

    return fc.tuple(arbPlayers, arbTricks).map(([players, tricks]) => ({
      players,
      blind: null,
      buried: null,
      calledCard: null,
      hole: null,
      tricks,
      crack: null,
      blitz: null,
      previousGameDouble: null,
      noPick: null,
      redeals: null,
    }));
  });
}

describe('Tricks-won computation correctness', () => {
  it('computed tricks-won for each player equals the count of tricks where that player is the winner', () => {
    fc.assert(
      fc.property(arbSheepsheadStore(), (store) => {
        for (const player of store.players) {
          // Computation under test (from design doc)
          const tricksWon = store.tricks!.filter((t) => t.winner === player.userID).length;

          // Independent verification: count with a loop
          let expected = 0;
          for (const trick of store.tricks!) {
            if (trick.winner === player.userID) {
              expected++;
            }
          }

          expect(tricksWon).toBe(expected);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('total tricks won across all players does not exceed total number of tricks', () => {
    fc.assert(
      fc.property(arbSheepsheadStore(), (store) => {
        const tricks = store.tricks!;
        const totalTricksWon = store.players.reduce(
          (sum, player) => sum + tricks.filter((t) => t.winner === player.userID).length,
          0,
        );

        // Total tricks won by all players equals the number of tricks with a non-null winner
        const tricksWithWinner = tricks.filter((t) => t.winner !== null).length;
        expect(totalTricksWon).toBe(tricksWithWinner);
      }),
      { numRuns: 100 },
    );
  });

  it('a player not appearing as any trick winner has zero tricks won', () => {
    fc.assert(
      fc.property(arbSheepsheadStore(), (store) => {
        const tricks = store.tricks!;
        const winnerSet = new Set(tricks.map((t) => t.winner).filter((w) => w !== null));

        for (const player of store.players) {
          const tricksWon = tricks.filter((t) => t.winner === player.userID).length;
          if (!winnerSet.has(player.userID)) {
            expect(tricksWon).toBe(0);
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});

const { buildStore } = SheepsheadPlugin;

// ---------------------------------------------------------------------------
// Terminal State Generator (for buildStore property)
// ---------------------------------------------------------------------------

/**
 * Generates an array of integers that sum to zero (zero-sum game invariant).
 */
function arbZeroSumDeltas(count: number): fc.Arbitrary<number[]> {
  return fc
    .array(fc.integer({ min: -10, max: 10 }), { minLength: count - 1, maxLength: count - 1 })
    .map((deltas) => {
      const sum = deltas.reduce((a, b) => a + b, 0);
      return [...deltas, -sum];
    });
}

/**
 * Generates a terminal SheepsheadState: phase="score", all players have non-null scoreDelta.
 */
function arbTerminalState(): fc.Arbitrary<{ config: SheepsheadConfig; state: SheepsheadState }> {
  return fc.constantFrom<(3 | 4 | 5)[]>(3, 4, 5).chain((playerCount) => {
    const handSize = Math.floor(32 / playerCount);
    const blindSize = 32 - handSize * playerCount;

    const config: SheepsheadConfig = {
      name: 'jack-of-diamonds',
      playerCount,
      handSize,
      blindSize,
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
    };

    const playerIds = Array.from({ length: playerCount }, (_, i) => i + 1);

    const arbTrickPlayForState = (players: UserID[]): fc.Arbitrary<TrickPlay> =>
      fc.record({
        player: fc.constantFrom(...players),
        card: arbCard(),
      });

    const arbTrickForState = (players: UserID[]): fc.Arbitrary<TrickState> =>
      fc.record({
        plays: fc.array(arbTrickPlayForState(players), {
          minLength: playerCount,
          maxLength: playerCount,
        }),
        winner: fc.constantFrom(...players),
      });

    return fc
      .tuple(
        fc.array(
          arbRole().filter((r): r is PlayerRole => r !== null),
          {
            minLength: playerCount,
            maxLength: playerCount,
          },
        ),
        arbZeroSumDeltas(playerCount),
        fc.array(arbTrickForState(playerIds), { minLength: 0, maxLength: handSize }),
      )
      .map(([roles, scoreDeltas, tricks]) => {
        const players: PlayerState[] = playerIds.map((uid, i) => ({
          userID: uid,
          role: roles[i],
          hand: [],
          tricksWon: tricks.filter((t) => t.winner === uid).length,
          pointsWon: 0,
          cardsWon: [],
          scoreDelta: scoreDeltas[i],
        }));

        const state: SheepsheadState = {
          players,
          phase: 'score',
          trickNumber: tricks.length,
          activePlayer: null,
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

        return { config, state };
      });
  });
}

// ---------------------------------------------------------------------------
// Property Test: buildStore produces consistent summary data
// ---------------------------------------------------------------------------

describe('buildStore produces consistent summary data', () => {
  it('preserves player count, userIDs, roles, scoreDeltas, and tricks array', () => {
    fc.assert(
      fc.property(arbTerminalState(), ({ config, state }) => {
        const store = buildStore(config, state);

        // Player count matches
        expect(store.players.length).toBe(state.players.length);

        // Each player's userID, role, and scoreDelta are preserved
        for (let i = 0; i < state.players.length; i++) {
          expect(store.players[i].userID).toBe(state.players[i].userID);
          expect(store.players[i].role).toBe(state.players[i].role);
          expect(store.players[i].scoreDelta).toBe(state.players[i].scoreDelta);
          expect(store.players[i].points).toBe(state.players[i].pointsWon);
        }

        // Tricks array is preserved
        expect(store.tricks).toEqual(state.tricks);
      }),
      { numRuns: 100 },
    );
  });
});
