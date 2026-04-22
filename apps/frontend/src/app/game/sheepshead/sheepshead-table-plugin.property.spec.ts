import * as fc from 'fast-check';
import { SheepsheadTablePlugin } from './sheepshead-table-plugin';

const SUITS = ['c', 's', 'h', 'd'];
const RANKS = ['7', '8', '9', 'x', 'j', 'q', 'k', 'a'];
const ALL_CARD_NAMES = SUITS.flatMap((s) => RANKS.map((r) => `${r}${s}`));
const PHASES = ['deal', 'pick', 'bury', 'call', 'play', 'score'];

/**
 * Arbitrary for a random card name from the Sheepshead deck.
 */
const arbCardName = fc.constantFrom(...ALL_CARD_NAMES);

/**
 * Arbitrary for a non-empty array of unique card names (1–4 cards).
 */
const arbCardNames = fc.shuffledSubarray(ALL_CARD_NAMES, { minLength: 1, maxLength: 4 });

/**
 * Arbitrary for a minimal SheepsheadPlayerView with random cards in player hands.
 * The state has enough structure for buildPlayCardEvent and buildBuryEvent to work.
 */
function arbPlayerView() {
  return fc
    .record({
      phase: fc.constantFrom(...PHASES),
      handCards: fc.shuffledSubarray(ALL_CARD_NAMES, { minLength: 2, maxLength: 10 }),
      activePlayerIdx: fc.constantFrom(0, 1, 2),
      trickNumber: fc.integer({ min: 0, max: 10 }),
    })
    .map(({ phase, handCards, activePlayerIdx, trickNumber }) => {
      const userIDs = [1, 2, 3];
      // Split cards across players, giving most to the first player
      const hand1 = handCards.slice(0, Math.ceil(handCards.length / 2));
      const hand2 = handCards.slice(Math.ceil(handCards.length / 2));

      return {
        players: userIDs.map((id, i) => ({
          userID: id,
          role: i === activePlayerIdx ? 'picker' : null,
          hand: (i === 0 ? hand1 : i === 1 ? hand2 : []).map((name) => ({ name })),
          tricksWon: 0,
          pointsWon: 0,
          scoreDelta: null,
        })),
        phase,
        trickNumber,
        activePlayer: userIDs[activePlayerIdx],
        blind: null,
        buried: null,
        calledCard: null,
        hole: null,
        tricks: phase === 'play' ? [{ plays: [], winner: null }] : [],
        crack: null,
        blitz: null,
        previousGameDouble: null,
        noPick: null,
        redeals: null,
        legalCardNames: null,
        dealerUserID: userIDs[0],
      };
    });
}

describe('buildMoveEvent delegates equivalently to buildPlayCardEvent and buildBuryEvent', () => {
  it('produces the same event as buildPlayCardEvent when target is "trick-pile"', () => {
    fc.assert(
      fc.property(arbPlayerView(), arbCardName, (state, cardName) => {
        const moveResult = SheepsheadTablePlugin.buildMoveEvent(state, [cardName], 'trick-pile');
        const playResult = SheepsheadTablePlugin.buildPlayCardEvent(state, cardName);

        expect(moveResult).toEqual(playResult);
      }),
      { numRuns: 100 },
    );
  });

  it('produces the same event as buildBuryEvent when target is "buried"', () => {
    fc.assert(
      fc.property(arbPlayerView(), arbCardNames, (state, cardNames) => {
        const moveResult = SheepsheadTablePlugin.buildMoveEvent(state, cardNames, 'buried');
        const buryResult = SheepsheadTablePlugin.buildBuryEvent(state, cardNames);

        expect(moveResult).toEqual(buryResult);
      }),
      { numRuns: 100 },
    );
  });
});
