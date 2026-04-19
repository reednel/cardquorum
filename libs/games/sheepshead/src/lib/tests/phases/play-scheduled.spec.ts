import * as fc from 'fast-check';
import { sumPoints } from '../../cards';
import { DECK } from '../../constants';
import { handlePlayCard, handleTrickAdvance } from '../../phases';
import { SheepsheadPlugin } from '../../sheepshead-plugin';
import { legalPlays } from '../../tricks';
import { Card, SheepsheadState, TrickState } from '../../types';
import { card, makeConfig } from '../test-helpers';

/**
 * Build a 3-player play-phase state where each player has exactly 1 card,
 * ready for a single trick. The first two players have already played,
 * and the third player is about to play the last card to complete the trick.
 */
function arbLastCardTrick() {
  return fc.shuffledSubarray([...DECK], { minLength: 3, maxLength: 3 }).map(([c1, c2, c3]) => {
    const state: SheepsheadState = {
      players: [
        {
          userID: 1,
          role: 'picker',
          hand: [c1],
          tricksWon: 0,
          pointsWon: 0,
          cardsWon: [],
          scoreDelta: null,
        },
        {
          userID: 2,
          role: 'opposition',
          hand: [c2],
          tricksWon: 0,
          pointsWon: 0,
          cardsWon: [],
          scoreDelta: null,
        },
        {
          userID: 3,
          role: 'opposition',
          hand: [c3],
          tricksWon: 0,
          pointsWon: 0,
          cardsWon: [],
          scoreDelta: null,
        },
      ],
      phase: 'play',
      trickNumber: 1,
      activePlayer: 1,
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
    return { state, cards: [c1, c2, c3] };
  });
}

/**
 * Build a state with a completed trick (winner set, scheduledEvents present)
 * and players who still have cards in hand — ready for trick_advance.
 */
function arbCompletedTrickWithCardsRemaining() {
  // 3 players, 3 cards for the trick + 3 more cards (1 per player for next trick)
  return fc.shuffledSubarray([...DECK], { minLength: 6, maxLength: 6 }).chain((sixCards) => {
    const trickCards = sixCards.slice(0, 3);
    const handCards = sixCards.slice(3, 6);

    // We need a valid winner — use player 1 as a simple deterministic winner
    return fc.constant({ trickCards, handCards }).map(({ trickCards, handCards }) => {
      const completedTrick: TrickState = {
        plays: [
          { player: 1, card: trickCards[0] },
          { player: 2, card: trickCards[1] },
          { player: 3, card: trickCards[2] },
        ],
        winner: 1, // Arbitrary winner for the generator
      };

      const state: SheepsheadState = {
        players: [
          {
            userID: 1,
            role: 'picker',
            hand: [handCards[0]],
            tricksWon: 1,
            pointsWon: sumPoints(trickCards),
            cardsWon: [...trickCards],
            scoreDelta: null,
          },
          {
            userID: 2,
            role: 'opposition',
            hand: [handCards[1]],
            tricksWon: 0,
            pointsWon: 0,
            cardsWon: [],
            scoreDelta: null,
          },
          {
            userID: 3,
            role: 'opposition',
            hand: [handCards[2]],
            tricksWon: 0,
            pointsWon: 0,
            cardsWon: [],
            scoreDelta: null,
          },
        ],
        phase: 'play',
        trickNumber: 1,
        activePlayer: null,
        blind: [],
        buried: [],
        calledCard: null,
        hole: null,
        tricks: [completedTrick],
        crack: null,
        blitz: null,
        previousGameDouble: null,
        noPick: null,
        redeals: null,
        scheduledEvents: [{ event: { type: 'trick_advance' }, delayMs: 2000 }],
      };

      return state;
    });
  });
}

/**
 * Build a state with a completed trick (winner set, scheduledEvents present)
 * and NO cards remaining in any player's hand — ready for trick_advance to score.
 */
function arbCompletedTrickNoCardsRemaining() {
  return fc.shuffledSubarray([...DECK], { minLength: 3, maxLength: 3 }).chain((trickCards) => {
    return fc.constantFrom(1, 2, 3).map((winnerId) => {
      const completedTrick: TrickState = {
        plays: [
          { player: 1, card: trickCards[0] },
          { player: 2, card: trickCards[1] },
          { player: 3, card: trickCards[2] },
        ],
        winner: winnerId,
      };

      const state: SheepsheadState = {
        players: [
          {
            userID: 1,
            role: 'picker',
            hand: [],
            tricksWon: winnerId === 1 ? 1 : 0,
            pointsWon: winnerId === 1 ? sumPoints(trickCards) : 0,
            cardsWon: winnerId === 1 ? [...trickCards] : [],
            scoreDelta: null,
          },
          {
            userID: 2,
            role: 'opposition',
            hand: [],
            tricksWon: winnerId === 2 ? 1 : 0,
            pointsWon: winnerId === 2 ? sumPoints(trickCards) : 0,
            cardsWon: winnerId === 2 ? [...trickCards] : [],
            scoreDelta: null,
          },
          {
            userID: 3,
            role: 'opposition',
            hand: [],
            tricksWon: winnerId === 3 ? 1 : 0,
            pointsWon: winnerId === 3 ? sumPoints(trickCards) : 0,
            cardsWon: winnerId === 3 ? [...trickCards] : [],
            scoreDelta: null,
          },
        ],
        phase: 'play',
        trickNumber: 1,
        activePlayer: null,
        blind: [],
        buried: [],
        calledCard: null,
        hole: null,
        tricks: [completedTrick],
        crack: null,
        blitz: null,
        previousGameDouble: null,
        noPick: null,
        redeals: null,
        scheduledEvents: [{ event: { type: 'trick_advance' }, delayMs: 2000 }],
      };

      return state;
    });
  });
}

/**
 * Build a leaster state where 3 players each have 1 card, blind is non-empty,
 * and playing the last card completes the final trick.
 */
function arbLeasterFinalTrick() {
  // Need 3 cards for hands + 2 cards for blind = 5 distinct cards
  return fc
    .shuffledSubarray([...DECK], { minLength: 5, maxLength: 5 })
    .map(([c1, c2, c3, b1, b2]) => {
      const state: SheepsheadState = {
        players: [
          {
            userID: 1,
            role: 'opposition',
            hand: [c1],
            tricksWon: 0,
            pointsWon: 0,
            cardsWon: [],
            scoreDelta: null,
          },
          {
            userID: 2,
            role: 'opposition',
            hand: [c2],
            tricksWon: 0,
            pointsWon: 0,
            cardsWon: [],
            scoreDelta: null,
          },
          {
            userID: 3,
            role: 'opposition',
            hand: [c3],
            tricksWon: 0,
            pointsWon: 0,
            cardsWon: [],
            scoreDelta: null,
          },
        ],
        phase: 'play',
        trickNumber: 1,
        activePlayer: 1,
        blind: [b1, b2],
        buried: [],
        calledCard: null,
        hole: null,
        tricks: [{ plays: [], winner: null }],
        crack: null,
        blitz: null,
        previousGameDouble: null,
        noPick: 'leaster',
        redeals: null,
      };
      return { state, cards: [c1, c2, c3], blind: [b1, b2] };
    });
}

describe('completeTrick produces a pending state with scheduledEvents', () => {
  const config = makeConfig();

  it('sets trick winner, updates stats, sets activePlayer to null, and schedules trick_advance', () => {
    fc.assert(
      fc.property(arbLastCardTrick(), ({ state, cards }) => {
        // Play all 3 cards through handlePlayCard
        let s = state;
        for (let i = 0; i < 3; i++) {
          const playerID = s.activePlayer!;
          const playerIdx = s.players.findIndex((p) => p.userID === playerID);
          const { cards: legal } = legalPlays(s, config, playerID);
          // Play the first legal card (the player only has 1 card)
          s = handlePlayCard(
            s,
            { type: 'play_card', userID: playerID, payload: { card: legal[0] } },
            config,
          );
        }

        // Trick winner is set to a valid player
        const lastTrick = s.tricks[s.tricks.length - 1];
        expect(lastTrick.winner).not.toBeNull();
        expect(s.players.some((p) => p.userID === lastTrick.winner)).toBe(true);

        // Winner's stats are updated
        const winner = s.players.find((p) => p.userID === lastTrick.winner)!;
        expect(winner.tricksWon).toBeGreaterThanOrEqual(1);
        expect(winner.pointsWon).toBeGreaterThanOrEqual(0);
        expect(winner.cardsWon.length).toBeGreaterThanOrEqual(3);

        // No new empty trick appended after the completed trick
        expect(s.tricks).toHaveLength(1);
        expect(s.tricks[s.tricks.length - 1].winner).not.toBeNull();

        // activePlayer is null
        expect(s.activePlayer).toBeNull();

        // scheduledEvents is exactly the expected value
        expect(s.scheduledEvents).toEqual([{ event: { type: 'trick_advance' }, delayMs: 2000 }]);
      }),
      { numRuns: 100 },
    );
  });
});

describe('trick_advance with cards remaining starts a new trick', () => {
  it('appends empty trick, increments trickNumber, sets activePlayer to winner, clears scheduledEvents', () => {
    fc.assert(
      fc.property(arbCompletedTrickWithCardsRemaining(), (state) => {
        const result = handleTrickAdvance(state);

        const lastTrick = result.tricks[result.tricks.length - 1];

        // New empty trick appended
        expect(result.tricks).toHaveLength(state.tricks.length + 1);
        expect(lastTrick.plays).toHaveLength(0);
        expect(lastTrick.winner).toBeNull();

        // trickNumber incremented
        expect(result.trickNumber).toBe(state.trickNumber + 1);

        // activePlayer set to the previous trick's winner
        const previousTrick = result.tricks[result.tricks.length - 2];
        expect(result.activePlayer).toBe(previousTrick.winner);

        // scheduledEvents cleared
        expect(result.scheduledEvents).toBeUndefined();
      }),
      { numRuns: 100 },
    );
  });
});

describe('trick_advance with no cards remaining transitions to score', () => {
  it('sets phase to score, activePlayer to null, chains game_scored event', () => {
    fc.assert(
      fc.property(arbCompletedTrickNoCardsRemaining(), (state) => {
        const result = handleTrickAdvance(state);

        expect(result.phase).toBe('score');
        expect(result.activePlayer).toBeNull();
        expect(result.scheduledEvents).toEqual([{ event: { type: 'game_scored' }, delayMs: 0 }]);
      }),
      { numRuns: 100 },
    );
  });
});

describe('leaster blind points awarded before scheduling', () => {
  const config = makeConfig({ noPick: 'leaster' });

  it('winner gets blind card points added to pointsWon and blind cards added to cardsWon, with scheduledEvents set', () => {
    fc.assert(
      fc.property(arbLeasterFinalTrick(), ({ state, cards, blind }) => {
        // Play all 3 cards through handlePlayCard
        let s = state;
        for (let i = 0; i < 3; i++) {
          const playerID = s.activePlayer!;
          const { cards: legal } = legalPlays(s, config, playerID);
          s = handlePlayCard(
            s,
            { type: 'play_card', userID: playerID, payload: { card: legal[0] } },
            config,
          );
        }

        // Find the trick winner
        const lastTrick = s.tricks[s.tricks.length - 1];
        expect(lastTrick.winner).not.toBeNull();

        const winner = s.players.find((p) => p.userID === lastTrick.winner)!;
        const trickCardPoints = sumPoints(lastTrick.plays.map((p) => p.card));
        const blindPoints = sumPoints(blind);

        // Winner's pointsWon includes both trick points and blind points
        expect(winner.pointsWon).toBe(trickCardPoints + blindPoints);

        // Winner's cardsWon includes both trick cards and blind cards
        expect(winner.cardsWon).toHaveLength(3 + blind.length);
        for (const bc of blind) {
          expect(winner.cardsWon.some((c) => c.name === bc.name)).toBe(true);
        }

        // scheduledEvents is set
        expect(s.scheduledEvents).toEqual([{ event: { type: 'trick_advance' }, delayMs: 2000 }]);
      }),
      { numRuns: 100 },
    );
  });
});

describe('getValidActions returns empty during trick-completion pause', () => {
  const config = makeConfig();

  it('returns empty array for every player when last trick has a winner and no empty trick follows', () => {
    fc.assert(
      fc.property(
        fc.oneof(arbCompletedTrickWithCardsRemaining(), arbCompletedTrickNoCardsRemaining()),
        (state) => {
          for (const player of state.players) {
            const actions = SheepsheadPlugin.getValidActions(config, state, player.userID);
            expect(actions).toEqual([]);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('player view during pause includes completed trick with null legal cards', () => {
  const config = makeConfig();

  it('includes the completed trick in tricks and sets legalCardNames to null for every player', () => {
    fc.assert(
      fc.property(
        fc.oneof(arbCompletedTrickWithCardsRemaining(), arbCompletedTrickNoCardsRemaining()),
        (state) => {
          const lastTrick = state.tricks[state.tricks.length - 1];

          for (const player of state.players) {
            const view = SheepsheadPlugin.getPlayerView(
              config,
              state,
              player.userID,
            ) as Partial<SheepsheadState> & { legalCardNames: string[] | null };

            // The completed trick should be included in the view
            expect(view.tricks).toHaveLength(1);
            expect(view.tricks![0].winner).toBe(lastTrick.winner);
            expect(view.tricks![0].plays).toEqual(lastTrick.plays);

            // legalCardNames should be null during the pause
            expect(view.legalCardNames).toBeNull();
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
