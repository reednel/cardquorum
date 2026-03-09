import { pickingTeamPoints, isSchneider, isSchwarz, scoreMultiplier } from './scoring';
import { DECK, TOTAL_POINTS } from './constants';
import { Card, SheepsheadConfig, SheepsheadState, TrickState } from './types';

function card(name: string): Card {
  const c = DECK.find((d) => d.name === name);
  if (!c) throw new Error(`Card not found: ${name}`);
  return c;
}

function makeConfig(overrides: Partial<SheepsheadConfig> = {}): SheepsheadConfig {
  return {
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
    ...overrides,
  };
}

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
    trickNumber: null,
    activePlayer: null,
    blind: [],
    buried: [],
    calledSuit: null,
    tricks: [],
    crack: null,
    blitz: null,
    noPick: null,
    previousGameDouble: null,
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

describe('isSchneider', () => {
  it('picker wins schneider when opposition has <30', () => {
    expect(isSchneider(91, true)).toBe(true); // opposition has 29
  });

  it('picker does not get schneider when opposition has 30+', () => {
    expect(isSchneider(90, true)).toBe(false); // opposition has 30
  });

  it('picker loses schneider when picker has <30', () => {
    expect(isSchneider(29, false)).toBe(true);
  });

  it('picker does not lose schneider when picker has 30+', () => {
    expect(isSchneider(30, false)).toBe(false);
  });
});

describe('isSchwarz', () => {
  it('returns true when picking team won 0 tricks', () => {
    const tricks: TrickState[] = [
      { plays: [], winner: 2 },
      { plays: [], winner: 3 },
    ];
    const state = makeState({ tricks });
    expect(isSchwarz(state)).toBe(true);
  });

  it('returns true when picking team won all tricks', () => {
    const tricks: TrickState[] = [
      { plays: [], winner: 1 },
      { plays: [], winner: 1 },
    ];
    const state = makeState({ tricks });
    expect(isSchwarz(state)).toBe(true);
  });

  it('returns false when both teams won tricks', () => {
    const tricks: TrickState[] = [
      { plays: [], winner: 1 },
      { plays: [], winner: 2 },
    ];
    const state = makeState({ tricks });
    expect(isSchwarz(state)).toBe(false);
  });
});

describe('scoreMultiplier', () => {
  it('base multiplier is 1', () => {
    // Picker won with 61 points (no schneider, no schwarz)
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
    // Picker lost with <30 points. Both teams took tricks (no schwarz).
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
    // Not schwarz (both teams won tricks)
    expect(scoreMultiplier(state, makeConfig())).toBe(2);
  });

  it('schwarz gives 3x (replaces schneider)', () => {
    // All tricks won by opposition
    const state = makeState({
      tricks: [
        {
          plays: [
            { player: 1, card: card('7c') },
            { player: 2, card: card('ac') },
          ],
          winner: 2,
        },
        {
          plays: [
            { player: 1, card: card('7s') },
            { player: 2, card: card('as') },
          ],
          winner: 2,
        },
      ],
    });
    // Picking team took 0 tricks → schwarz
    expect(scoreMultiplier(state, makeConfig())).toBe(3);
  });

  it('crack doubles the multiplier', () => {
    // Both teams won tricks (no schwarz), schneider applies
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
});
