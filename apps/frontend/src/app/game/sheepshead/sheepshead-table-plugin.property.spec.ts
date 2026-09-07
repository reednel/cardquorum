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
        hasHoleCard: false,
        legalCallableCards: null,
        holeCardRequired: null,
        dealerUserID: userIDs[0],
      };
    });
}

/**
 * Extended arbitrary that generates game states exercising badge logic:
 * - Dealer badge (dealerUserID matches a player)
 * - Picker badge (role === 'picker')
 * - Leader badge (play phase with tricks)
 * - Tricks won badge (play phase with tricksWon > 0, capped at 9 for single-char label)
 */
function arbPlayerViewForBadges() {
  return fc
    .record({
      phase: fc.constantFrom(...PHASES),
      handCards: fc.shuffledSubarray(ALL_CARD_NAMES, { minLength: 2, maxLength: 10 }),
      activePlayerIdx: fc.constantFrom(0, 1, 2),
      trickNumber: fc.integer({ min: 0, max: 10 }),
      tricksWon: fc.tuple(
        fc.integer({ min: 0, max: 9 }),
        fc.integer({ min: 0, max: 9 }),
        fc.integer({ min: 0, max: 9 }),
      ),
      pickerIdx: fc.constantFrom(0, 1, 2, -1), // -1 means no picker
      dealerIdx: fc.constantFrom(0, 1, 2),
    })
    .map(({ phase, handCards, activePlayerIdx, trickNumber, tricksWon, pickerIdx, dealerIdx }) => {
      const userIDs = [1, 2, 3];
      const hand1 = handCards.slice(0, Math.ceil(handCards.length / 2));
      const hand2 = handCards.slice(Math.ceil(handCards.length / 2));

      return {
        players: userIDs.map((id, i) => ({
          userID: id,
          role: i === pickerIdx ? 'picker' : null,
          hand: (i === 0 ? hand1 : i === 1 ? hand2 : []).map((name) => ({ name })),
          tricksWon: tricksWon[i],
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
        tricks:
          phase === 'play'
            ? [
                {
                  plays: [{ player: userIDs[activePlayerIdx], card: { name: 'jc' } }],
                  winner: null,
                },
              ]
            : [],
        crack: null,
        blitz: null,
        previousGameDouble: null,
        noPick: null,
        redeals: null,
        legalCardNames: null,
        hasHoleCard: false,
        legalCallableCards: null,
        holeCardRequired: null,
        dealerUserID: userIDs[dealerIdx],
      };
    });
}

describe('getSeatBadges returns badges with single-character labels and valid colors', () => {
  const VALID_BADGE_COLORS = ['red', 'yellow', 'green', 'blue', 'purple', 'pink', 'dark'];

  it('every badge label is exactly one character and color is a valid BadgeColor', () => {
    fc.assert(
      fc.property(arbPlayerViewForBadges(), (state) => {
        for (const player of state.players) {
          const badges = SheepsheadTablePlugin.getSeatBadges!(state, player.userID);
          for (const badge of badges) {
            expect(badge.label).toHaveLength(1);
            expect(VALID_BADGE_COLORS).toContain(badge.color);
          }
        }
      }),
      { numRuns: 200 },
    );
  });
});

describe('picker badge appears if and only if the player role is picker', () => {
  it('players with role "picker" have a purple P badge on the left, others do not', () => {
    fc.assert(
      fc.property(arbPlayerView(), (state) => {
        for (const player of state.players) {
          const badges = SheepsheadTablePlugin.getSeatBadges!(state, player.userID);
          const pickerBadge = badges.find(
            (b) => b.label === 'P' && b.color === 'purple' && b.position === 'left',
          );

          if (player.role === 'picker') {
            expect(pickerBadge).toBeDefined();
          } else {
            const anyPBadge = badges.find((b) => b.label === 'P');
            expect(anyPBadge).toBeUndefined();
          }
        }
      }),
      { numRuns: 200 },
    );
  });
});

describe('dealer badge appears if and only if the player is the current dealer', () => {
  /**
   * Arbitrary that varies the dealerUserID across all players to exercise
   * both the "is dealer" and "is not dealer" paths.
   */
  function arbPlayerViewWithVariableDealer() {
    return fc
      .record({
        base: arbPlayerView(),
        dealerIdx: fc.constantFrom(0, 1, 2),
      })
      .map(({ base, dealerIdx }) => ({
        ...base,
        dealerUserID: base.players[dealerIdx].userID,
      }));
  }

  it('badges contain D/blue/left iff the player is the dealer', () => {
    fc.assert(
      fc.property(arbPlayerViewWithVariableDealer(), (state) => {
        for (const player of state.players) {
          const badges = SheepsheadTablePlugin.getSeatBadges!(state, player.userID);
          const dealerBadge = badges.find(
            (b) => b.label === 'D' && b.color === 'blue' && b.position === 'left',
          );

          if (state.dealerUserID === player.userID) {
            expect(dealerBadge).toBeDefined();
          } else {
            const anyDLabel = badges.find((b) => b.label === 'D');
            expect(anyDLabel).toBeUndefined();
          }
        }
      }),
      { numRuns: 200 },
    );
  });
});

describe('tricks-won badge appears with correct count if and only if phase is play and tricksWon > 0', () => {
  /**
   * Arbitrary that generates game states with varying tricksWon values per player.
   */
  function arbPlayerViewWithTricksWon() {
    return fc
      .record({
        phase: fc.constantFrom(...PHASES),
        handCards: fc.shuffledSubarray(ALL_CARD_NAMES, { minLength: 2, maxLength: 10 }),
        activePlayerIdx: fc.constantFrom(0, 1, 2),
        trickNumber: fc.integer({ min: 0, max: 10 }),
        tricksWon: fc.tuple(
          fc.integer({ min: 0, max: 6 }),
          fc.integer({ min: 0, max: 6 }),
          fc.integer({ min: 0, max: 6 }),
        ),
        dealerIdx: fc.constantFrom(0, 1, 2),
      })
      .map(({ phase, handCards, activePlayerIdx, trickNumber, tricksWon, dealerIdx }) => {
        const userIDs = [1, 2, 3];
        const hand1 = handCards.slice(0, Math.ceil(handCards.length / 2));
        const hand2 = handCards.slice(Math.ceil(handCards.length / 2));

        return {
          players: userIDs.map((id, i) => ({
            userID: id,
            role: null,
            hand: (i === 0 ? hand1 : i === 1 ? hand2 : []).map((name) => ({ name })),
            tricksWon: tricksWon[i],
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
          tricks:
            phase === 'play'
              ? [
                  {
                    plays: [{ player: userIDs[activePlayerIdx], card: { name: 'jc' } }],
                    winner: null,
                  },
                ]
              : [],
          crack: null,
          blitz: null,
          previousGameDouble: null,
          noPick: null,
          redeals: null,
          legalCardNames: null,
          hasHoleCard: false,
          legalCallableCards: null,
          holeCardRequired: null,
          dealerUserID: userIDs[dealerIdx],
        };
      });
  }

  it('badges contain green tricks-won badge iff phase is play and tricksWon > 0', () => {
    fc.assert(
      fc.property(arbPlayerViewWithTricksWon(), (state) => {
        for (const player of state.players) {
          const badges = SheepsheadTablePlugin.getSeatBadges!(state, player.userID);
          const greenBadge = badges.find((b) => b.color === 'green');

          if (state.phase === 'play' && player.tricksWon > 0) {
            // Must have a green badge with correct label and position
            expect(greenBadge).toBeDefined();
            expect(greenBadge!.label).toBe(String(player.tricksWon));
            expect(greenBadge!.position).toBe('right');
          } else {
            // Must NOT have any green badge
            expect(greenBadge).toBeUndefined();
          }
        }
      }),
      { numRuns: 200 },
    );
  });
});

describe('every badge returned by getSeatBadges has a non-empty description', () => {
  it('description is a non-empty string for all badges across all players', () => {
    fc.assert(
      fc.property(arbPlayerView(), (state) => {
        for (const player of state.players) {
          const badges = SheepsheadTablePlugin.getSeatBadges!(state, player.userID);
          for (const badge of badges) {
            expect(typeof badge.description).toBe('string');
            expect(badge.description.length).toBeGreaterThan(0);
          }
        }
      }),
      { numRuns: 200 },
    );
  });
});

describe('leader badge appears if and only if the phase is play and the player led the current trick', () => {
  /**
   * Arbitrary that generates states covering all leader badge scenarios:
   * - Non-play phases (no leader badge expected)
   * - Play phase with empty plays (leader = activePlayer)
   * - Play phase with plays (leader = first play's player)
   */
  function arbPlayerViewForLeader() {
    return fc
      .record({
        phase: fc.constantFrom(...PHASES),
        handCards: fc.shuffledSubarray(ALL_CARD_NAMES, { minLength: 2, maxLength: 10 }),
        activePlayerIdx: fc.constantFrom(0, 1, 2),
        trickNumber: fc.integer({ min: 0, max: 10 }),
        leadPlayerIdx: fc.constantFrom(0, 1, 2),
        hasPlays: fc.boolean(),
      })
      .map(({ phase, handCards, activePlayerIdx, trickNumber, leadPlayerIdx, hasPlays }) => {
        const userIDs = [1, 2, 3];
        const hand1 = handCards.slice(0, Math.ceil(handCards.length / 2));
        const hand2 = handCards.slice(Math.ceil(handCards.length / 2));

        const plays =
          phase === 'play' && hasPlays
            ? [{ player: userIDs[leadPlayerIdx], card: { name: 'jc' } }]
            : [];

        return {
          players: userIDs.map((id, i) => ({
            userID: id,
            role: null,
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
          tricks: phase === 'play' ? [{ plays, winner: null }] : [],
          crack: null,
          blitz: null,
          previousGameDouble: null,
          noPick: null,
          redeals: null,
          legalCardNames: null,
          hasHoleCard: false,
          legalCallableCards: null,
          holeCardRequired: null,
          dealerUserID: userIDs[0],
        };
      });
  }

  it('player has leader badge iff phase is play and they led the current trick', () => {
    fc.assert(
      fc.property(arbPlayerViewForLeader(), (state) => {
        for (const player of state.players) {
          const badges = SheepsheadTablePlugin.getSeatBadges!(state, player.userID);
          const hasLeaderBadge = badges.some(
            (b) => b.label === 'L' && b.color === 'yellow' && b.position === 'right',
          );

          let expectedLeader: number | null = null;
          if (state.phase === 'play' && state.tricks.length > 0) {
            const currentTrick = state.tricks[state.tricks.length - 1];
            expectedLeader =
              currentTrick.plays.length > 0 ? currentTrick.plays[0].player : state.activePlayer;
          }

          const shouldHaveBadge = expectedLeader === player.userID;
          expect(hasLeaderBadge).toBe(shouldHaveBadge);
        }
      }),
      { numRuns: 200 },
    );
  });
});

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

describe('all badges have a valid position for left/right rendering split', () => {
  it('every badge position is either left or right', () => {
    fc.assert(
      fc.property(arbPlayerViewForBadges(), (state) => {
        for (const player of state.players) {
          const badges = SheepsheadTablePlugin.getSeatBadges!(state, player.userID);
          for (const badge of badges) {
            expect(['left', 'right']).toContain(badge.position);
          }
        }
      }),
      { numRuns: 200 },
    );
  });
});

describe('every badge color maps to a non-empty CSS class string', () => {
  const SEAT_BADGE_CLASSES: Record<string, string> = {
    red: 'bg-badge-red-surface text-badge-red dark:bg-badge-red-surface-dark dark:text-badge-red-dark',
    yellow:
      'bg-badge-yellow-surface text-badge-yellow dark:bg-badge-yellow-surface-dark dark:text-badge-yellow-dark',
    green:
      'bg-badge-green-surface text-badge-green dark:bg-badge-green-surface-dark dark:text-badge-green-dark',
    blue: 'bg-badge-blue-surface text-badge-blue dark:bg-badge-blue-surface-dark dark:text-badge-blue-dark',
    purple:
      'bg-badge-purple-surface text-badge-purple dark:bg-badge-purple-surface-dark dark:text-badge-purple-dark',
    pink: 'bg-badge-pink-surface text-badge-pink dark:bg-badge-pink-surface-dark dark:text-badge-pink-dark',
    dark: 'bg-gray-800 text-white dark:bg-gray-200 dark:text-gray-900',
  };

  it('every badge color returned by getSeatBadges has a corresponding class mapping', () => {
    fc.assert(
      fc.property(arbPlayerViewForBadges(), (state) => {
        for (const player of state.players) {
          const badges = SheepsheadTablePlugin.getSeatBadges!(state, player.userID);
          for (const badge of badges) {
            const cssClass = SEAT_BADGE_CLASSES[badge.color];
            expect(cssClass).toBeDefined();
            expect(cssClass.length).toBeGreaterThan(0);
          }
        }
      }),
      { numRuns: 200 },
    );
  });
});

describe('badge count equals left plus right partition', () => {
  it('total badges equals left-positioned plus right-positioned badges for every player', () => {
    fc.assert(
      fc.property(arbPlayerViewForBadges(), (state) => {
        for (const player of state.players) {
          const badges = SheepsheadTablePlugin.getSeatBadges!(state, player.userID);
          const left = badges.filter((b) => b.position === 'left');
          const right = badges.filter((b) => b.position === 'right');
          expect(left.length + right.length).toBe(badges.length);
        }
      }),
      { numRuns: 200 },
    );
  });
});
