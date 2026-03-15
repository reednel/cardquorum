import { DECK, TOTAL_POINTS } from '../constants';
import { gotSchneidered, gotSchwarzed, pickingTeamPoints, scoreMultiplier } from '../scoring';
import { SheepsheadConfig, SheepsheadState, TrickState } from '../types';
import { card, makeConfig } from './test-helpers';

function makeState(overrides: Partial<SheepsheadState> = {}): SheepsheadState {
  return {
    players: [
      {
        userID: 1,
        role: 'picker',
        hand: [],
        tricksWon: 0,
        pointsWon: 0,
        cardsWon: [],
        scoreDelta: null,
      },
      {
        userID: 2,
        role: 'opposition',
        hand: [],
        tricksWon: 0,
        pointsWon: 0,
        cardsWon: [],
        scoreDelta: null,
      },
      {
        userID: 3,
        role: 'opposition',
        hand: [],
        tricksWon: 0,
        pointsWon: 0,
        cardsWon: [],
        scoreDelta: null,
      },
    ],
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
    noPick: null,
    previousGameDouble: null,
    redeals: null,
    ...overrides,
  };
}

describe('pickingTeamPoints', () => {
  it('counts buried cards toward picker', () => {
    const state = makeState({
      buried: [card('ac'), card('xc')], // 11 + 10 = 21
    });
    expect(pickingTeamPoints(state)).toBe(21);
  });

  it('counts trick winners for picking team', () => {
    const trick: TrickState = {
      plays: [
        { player: 1, card: card('ac') },
        { player: 2, card: card('7c') },
      ],
      winner: 1, // picker won
    };
    const state = makeState({ tricks: [trick] });
    expect(pickingTeamPoints(state)).toBe(11); // ac=11, 7c=0
  });

  it('does not count tricks won by opposition', () => {
    const trick: TrickState = {
      plays: [
        { player: 1, card: card('7c') },
        { player: 2, card: card('ac') },
      ],
      winner: 2, // opposition won
    };
    const state = makeState({ tricks: [trick] });
    expect(pickingTeamPoints(state)).toBe(0);
  });

  it('includes partner tricks', () => {
    const trick: TrickState = {
      plays: [
        { player: 1, card: card('7c') },
        { player: 2, card: card('ac') },
        { player: 3, card: card('kc') },
      ],
      winner: 2,
    };
    const state = makeState({
      players: [
        {
          userID: 1,
          role: 'picker',
          hand: [],
          tricksWon: 0,
          pointsWon: 0,
          cardsWon: [],
          scoreDelta: null,
        },
        {
          userID: 2,
          role: 'partner',
          hand: [],
          tricksWon: 0,
          pointsWon: 0,
          cardsWon: [],
          scoreDelta: null,
        },
        {
          userID: 3,
          role: 'opposition',
          hand: [],
          tricksWon: 0,
          pointsWon: 0,
          cardsWon: [],
          scoreDelta: null,
        },
      ],
      tricks: [trick],
    });
    expect(pickingTeamPoints(state)).toBe(15); // 0 + 11 + 4
  });
});

describe('gotSchneidered', () => {
  it('opposition gets schneidered when they take <30', () => {
    expect(gotSchneidered(91, true)).toBe(true); // opposition has 29
  });

  it('picker does not get schneider when opposition has 30+', () => {
    expect(gotSchneidered(90, true)).toBe(false); // opposition has 30
  });

  it('picker loses schneider when picker has <30', () => {
    expect(gotSchneidered(29, false)).toBe(true);
  });

  it('picker does not lose schneider when picker has 30+', () => {
    expect(gotSchneidered(30, false)).toBe(false);
  });
});

describe('gotSchwarzed', () => {
  it('returns true when picking team won 0 tricks', () => {
    const tricks: TrickState[] = [
      { plays: [], winner: 2 },
      { plays: [], winner: 3 },
    ];
    const state = makeState({ tricks });
    expect(gotSchwarzed(state)).toBe(true);
  });

  it('returns true when picking team won all tricks', () => {
    const tricks: TrickState[] = [
      { plays: [], winner: 1 },
      { plays: [], winner: 1 },
    ];
    const state = makeState({ tricks });
    expect(gotSchwarzed(state)).toBe(true);
  });

  it('returns false when both teams won tricks', () => {
    const tricks: TrickState[] = [
      { plays: [], winner: 1 },
      { plays: [], winner: 2 },
    ];
    const state = makeState({ tricks });
    expect(gotSchwarzed(state)).toBe(false);
  });
});

describe('scoreMultiplier', () => {
  it('base multiplier is 1', () => {
    // Picker won with 61 points (loser wasn't schneidered or schwarz).
    const tricks: TrickState[] = [
      {
        plays: [
          { player: 1, card: card('ac') },
          { player: 2, card: card('7c') },
        ],
        winner: 1,
      },
      {
        plays: [
          { player: 2, card: card('as') },
          { player: 1, card: card('7s') },
        ],
        winner: 2,
      },
    ];
    const state = makeState({
      buried: [card('xc'), card('xs')], // 20 points buried
      tricks,
    });
    // pickerPts = 20 (buried) + 11 (ac trick) = 31
    // opposition has 11 (as trick)
    // total only 42 — not a full game, but enough to test multiplier logic
    // pickerWon = false (31 < 61), schneider = false (31 >= 30)
    expect(scoreMultiplier(state, makeConfig())).toBe(1);
  });

  it('schneider doubles', () => {
    // Picker lost with <30 points. Both teams took tricks.
    const state = makeState({
      buried: [],
      tricks: [
        {
          plays: [
            { player: 1, card: card('ac') },
            { player: 2, card: card('7c') },
          ],
          winner: 1,
        }, // picker wins 11
        {
          plays: [
            { player: 2, card: card('as') },
            { player: 1, card: card('7s') },
          ],
          winner: 2,
        }, // opp wins 11
      ],
    });
    // pickerPts = 11, pickerWon = false (11 < 61), isSchneider(11, false) = true (11 < 30)
    expect(scoreMultiplier(state, makeConfig())).toBe(2);
  });

  it('crack doubles the multiplier', () => {
    // Both teams won tricks, schneider applies
    const state = makeState({
      tricks: [
        {
          plays: [
            { player: 1, card: card('ac') },
            { player: 2, card: card('7c') },
          ],
          winner: 1,
        },
        {
          plays: [
            { player: 2, card: card('as') },
            { player: 1, card: card('7s') },
          ],
          winner: 2,
        },
      ],
      crack: { crackedBy: 2, reCrackedBy: null },
    });
    // schneider (2) × crack (2) = 4
    expect(scoreMultiplier(state, makeConfig({ cracking: true }))).toBe(4);
  });

  it('re-crack quadruples the multiplier', () => {
    const state = makeState({
      tricks: [
        {
          plays: [
            { player: 1, card: card('ac') },
            { player: 2, card: card('7c') },
          ],
          winner: 1,
        },
        {
          plays: [
            { player: 2, card: card('as') },
            { player: 1, card: card('7s') },
          ],
          winner: 2,
        },
      ],
      crack: { crackedBy: 2, reCrackedBy: 1 },
    });
    // schneider (2) × re-crack (4) = 8
    expect(scoreMultiplier(state, makeConfig({ cracking: true }))).toBe(8);
  });

  it('blitz doubles the multiplier', () => {
    const state = makeState({
      tricks: [
        {
          plays: [
            { player: 1, card: card('ac') },
            { player: 2, card: card('7c') },
          ],
          winner: 1,
        },
        {
          plays: [
            { player: 2, card: card('as') },
            { player: 1, card: card('7s') },
          ],
          winner: 2,
        },
      ],
      blitz: { type: 'black-blitz', blitzedBy: 1 },
    });
    // schneider (2) × blitz (2) = 4
    expect(scoreMultiplier(state, makeConfig({ blitzing: true }))).toBe(4);
  });

  it('blitz ignored when config.blitzing is false', () => {
    const state = makeState({
      tricks: [
        {
          plays: [
            { player: 1, card: card('ac') },
            { player: 2, card: card('7c') },
          ],
          winner: 1,
        },
        {
          plays: [
            { player: 2, card: card('as') },
            { player: 1, card: card('7s') },
          ],
          winner: 2,
        },
      ],
      blitz: { type: 'black-blitz', blitzedBy: 1 },
    });
    // schneider (2) only — blitz disabled
    expect(scoreMultiplier(state, makeConfig({ blitzing: false }))).toBe(2);
  });

  it('doubleOnTheBump doubles when picker loses', () => {
    // Picker lost with < 61 points, no schneider (>= 30)
    const state = makeState({
      buried: [card('kc'), card('ks')], // 4 + 4 = 8
      tricks: [
        {
          plays: [
            { player: 1, card: card('ac') },
            { player: 2, card: card('7c') },
          ],
          winner: 1,
        }, // picker wins 11
        {
          plays: [
            { player: 2, card: card('as') },
            { player: 1, card: card('7s') },
          ],
          winner: 2,
        }, // opp wins 11
      ],
    });
    // pickerPts = 8 (buried) + 11 (trick) = 19... that's schneider
    // Let's use a case where picker has 30+ but < 61
    const state2 = makeState({
      buried: [card('ac'), card('as')], // 11 + 11 = 22
      tricks: [
        {
          plays: [
            { player: 1, card: card('xc') },
            { player: 2, card: card('7c') },
          ],
          winner: 1,
        }, // picker wins 10
        {
          plays: [
            { player: 2, card: card('xs') },
            { player: 1, card: card('7s') },
          ],
          winner: 2,
        }, // opp wins 10
      ],
    });
    // pickerPts = 22 + 10 = 32, pickerWon = false, schneider = false (32 >= 30)
    // base (1) × doubleOnTheBump (2) = 2
    expect(scoreMultiplier(state2, makeConfig({ doubleOnTheBump: true }))).toBe(2);
  });

  it('multiplicityLimit caps the multiplier', () => {
    // Schneider (2) × crack (2) = 4, but limit is 2
    const state = makeState({
      tricks: [
        {
          plays: [
            { player: 1, card: card('ac') },
            { player: 2, card: card('7c') },
          ],
          winner: 1,
        },
        {
          plays: [
            { player: 2, card: card('as') },
            { player: 1, card: card('7s') },
          ],
          winner: 2,
        },
      ],
      crack: { crackedBy: 2, reCrackedBy: null },
    });
    expect(scoreMultiplier(state, makeConfig({ cracking: true, multiplicityLimit: 2 }))).toBe(2);
  });

  it('multiplicityLimit null means no cap', () => {
    const state = makeState({
      tricks: [
        {
          plays: [
            { player: 1, card: card('ac') },
            { player: 2, card: card('7c') },
          ],
          winner: 1,
        },
        {
          plays: [
            { player: 2, card: card('as') },
            { player: 1, card: card('7s') },
          ],
          winner: 2,
        },
      ],
      crack: { crackedBy: 2, reCrackedBy: null },
    });
    expect(scoreMultiplier(state, makeConfig({ cracking: true, multiplicityLimit: null }))).toBe(4);
  });

  it('schneider + crack + blitz stack multiplicatively', () => {
    const state = makeState({
      tricks: [
        {
          plays: [
            { player: 1, card: card('ac') },
            { player: 2, card: card('7c') },
          ],
          winner: 1,
        },
        {
          plays: [
            { player: 2, card: card('as') },
            { player: 1, card: card('7s') },
          ],
          winner: 2,
        },
      ],
      crack: { crackedBy: 3, reCrackedBy: null },
      blitz: { type: 'black-blitz', blitzedBy: 1 },
    });
    // schneider (2) × crack (2) × blitz (2) = 8
    expect(scoreMultiplier(state, makeConfig({ cracking: true, blitzing: true }))).toBe(8);
  });

  it('schwarz + re-crack + blitz + doubleOnTheBump stack multiplicatively', () => {
    // Picker took 0 tricks — schwarz applies
    const state = makeState({
      tricks: [
        {
          plays: [
            { player: 2, card: card('ac') },
            { player: 1, card: card('7c') },
          ],
          winner: 2,
        },
        {
          plays: [
            { player: 2, card: card('as') },
            { player: 3, card: card('7s') },
          ],
          winner: 2,
        },
      ],
      crack: { crackedBy: 2, reCrackedBy: 1 },
      blitz: { type: 'red-blitz', blitzedBy: 2 },
    });
    // schwarz (3) × re-crack (4) × blitz (2) × doubleOnTheBump (2) = 48
    expect(
      scoreMultiplier(state, makeConfig({ cracking: true, blitzing: true, doubleOnTheBump: true })),
    ).toBe(48);
  });

  it('multiplicityLimit caps the full stack', () => {
    const state = makeState({
      tricks: [
        {
          plays: [
            { player: 2, card: card('ac') },
            { player: 1, card: card('7c') },
          ],
          winner: 2,
        },
        {
          plays: [
            { player: 2, card: card('as') },
            { player: 3, card: card('7s') },
          ],
          winner: 2,
        },
      ],
      crack: { crackedBy: 2, reCrackedBy: 1 },
      blitz: { type: 'red-blitz', blitzedBy: 2 },
    });
    // Would be 48 uncapped; limited to 8
    expect(
      scoreMultiplier(
        state,
        makeConfig({
          cracking: true,
          blitzing: true,
          doubleOnTheBump: true,
          multiplicityLimit: 8,
        }),
      ),
    ).toBe(8);
  });

  it('doubleOnTheBump does not apply when picker wins', () => {
    const state = makeState({
      buried: [card('ac'), card('as'), card('ah'), card('xc')],
      tricks: [
        {
          plays: [
            { player: 1, card: card('xs') },
            { player: 2, card: card('7c') },
          ],
          winner: 1,
        }, // picker wins 10
        {
          plays: [
            { player: 2, card: card('7s') },
            { player: 1, card: card('7h') },
          ],
          winner: 2,
        }, // opp wins 0
      ],
    });
    // pickerPts = 11+11+11+10 (buried) + 10 (trick) = 53... not enough
    // Use more buried: ac=11, as=11, ah=11, xc=10 = 43 + 10 (trick) = 53... still < 61
    // Add more to buried
    const state2 = makeState({
      buried: [card('ac'), card('as'), card('ah'), card('xc'), card('xs')],
      tricks: [
        {
          plays: [
            { player: 1, card: card('xh') },
            { player: 2, card: card('7c') },
          ],
          winner: 1,
        }, // picker wins 10
        {
          plays: [
            { player: 2, card: card('7s') },
            { player: 1, card: card('7h') },
          ],
          winner: 2,
        }, // opp wins 0
      ],
    });
    // pickerPts = 11+11+11+10+10 (buried) + 10 (trick) = 63, pickerWon = true
    // Both teams won tricks, so no schwarz. Opposition has 57 pts, no schneider.
    // doubleOnTheBump should not apply when picker wins
    expect(scoreMultiplier(state2, makeConfig({ doubleOnTheBump: true }))).toBe(1);
  });
});
