import { handleScore } from '../../phases';
import { SheepsheadConfig, SheepsheadState } from '../../types';
import { card, makeConfig, makeNoPickScoreState } from '../test-helpers';

describe('handleScore', () => {
  it('calculates score deltas for all players', () => {
    const config = makeConfig();
    const state: SheepsheadState = {
      players: [
        {
          userID: 1,
          role: 'opposition',
          hand: [],
          tricksWon: 1,
          pointsWon: 30,
          cardsWon: [],
          scoreDelta: null,
        },
        {
          userID: 2,
          role: 'picker',
          hand: [],
          tricksWon: 2,
          pointsWon: 90,
          cardsWon: [],
          scoreDelta: null,
        },
        {
          userID: 3,
          role: 'opposition',
          hand: [],
          tricksWon: 1,
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
        {
          plays: [
            { player: 1, card: card('kc') },
            { player: 3, card: card('ks') },
          ],
          winner: 1,
        },
      ],
      crack: null,
      blitz: null,
      previousGameDouble: null,
      noPick: null,
      redeals: null,
    };

    const scored = handleScore(state, config);

    // All players should have score deltas
    for (const p of scored.players) {
      expect(p.scoreDelta).not.toBeNull();
    }
  });

  it('picker wins with 61+ points', () => {
    const config = makeConfig();
    const state: SheepsheadState = {
      players: [
        {
          userID: 1,
          role: 'opposition',
          hand: [],
          tricksWon: 0,
          pointsWon: 0,
          cardsWon: [],
          scoreDelta: null,
        },
        {
          userID: 2,
          role: 'picker',
          hand: [],
          tricksWon: 1,
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
      // Buried counts for picker: 61 points from buried alone
      buried: [card('ac'), card('as'), card('ah'), card('xc'), card('xs'), card('xh')],
      calledCard: null,
      hole: null,
      tricks: [
        {
          plays: [
            { player: 2, card: card('7c') },
            { player: 1, card: card('7s') },
          ],
          winner: 2,
        },
        {
          plays: [
            { player: 1, card: card('kc') },
            { player: 3, card: card('ks') },
          ],
          winner: 1,
        },
      ],
      crack: null,
      blitz: null,
      previousGameDouble: null,
      noPick: null,
      redeals: null,
    };

    const scored = handleScore(state, config);
    // Picker (player 2) should have positive scoreDelta
    expect(scored.players[1].scoreDelta).toBeGreaterThan(0);
    // Opposition should have negative
    expect(scored.players[0].scoreDelta).toBeLessThan(0);
  });

  it('moster: player with most points is the only loser', () => {
    const config = makeConfig({ noPick: 'moster' });
    const state = makeNoPickScoreState([40, 50, 30], [2, 3, 2], 'moster');
    const scored = handleScore(state, config);

    // Player 2 (50 pts) is the loser
    expect(scored.players[1].scoreDelta).toBeLessThan(0);
    // Others win
    expect(scored.players[0].scoreDelta).toBeGreaterThan(0);
    expect(scored.players[2].scoreDelta).toBeGreaterThan(0);
    // Zero-sum
    const total = scored.players.reduce((s, p) => s + (p.scoreDelta ?? 0), 0);
    expect(total).toBe(0);
  });

  it('mittler: player with middle score wins', () => {
    const config = makeConfig({ noPick: 'mittler' });
    const state = makeNoPickScoreState([20, 50, 50], [1, 2, 2], 'mittler');
    const scored = handleScore(state, config);

    // Player 1 (20 pts) is middle of 3 sorted values [20, 50, 50]
    // Actually with duplicates at 50, the middle is 50. Let me use distinct values.
    const state2 = makeNoPickScoreState([20, 70, 30], [1, 3, 2], 'mittler');
    const scored2 = handleScore(state2, config);

    // Sorted: 20, 30, 70 → middle is 30 → player 3 wins
    expect(scored2.players[2].scoreDelta).toBeGreaterThan(0);
    // Zero-sum
    const total = scored2.players.reduce((s, p) => s + (p.scoreDelta ?? 0), 0);
    expect(total).toBe(0);
  });

  it('mittler: wash when no single middle value (even players)', () => {
    const config = makeConfig({
      playerCount: 4,
      handSize: 8,
      blindSize: 0,
      noPick: 'mittler',
      pickerRule: null,
      partnerRule: null,
    });
    const state = makeNoPickScoreState([10, 20, 30, 60], [1, 1, 1, 1], 'mittler');
    const scored = handleScore(state, config);

    // Even number of players — no single middle — all deltas 0 (wash)
    for (const p of scored.players) {
      expect(p.scoreDelta).toBe(0);
    }
  });

  it('schneidster: closest to 30 without going over wins', () => {
    const config = makeConfig({ noPick: 'schneidster' });
    const state = makeNoPickScoreState([25, 35, 60], [2, 2, 2], 'schneidster');
    const scored = handleScore(state, config);

    // Player 1 (25 pts) is closest to 30 without going over
    expect(scored.players[0].scoreDelta).toBeGreaterThan(0);
    // Zero-sum
    const total = scored.players.reduce((s, p) => s + (p.scoreDelta ?? 0), 0);
    expect(total).toBe(0);
  });

  it('schneidster: wash when two players tie for closest', () => {
    const config = makeConfig({ noPick: 'schneidster' });
    const state = makeNoPickScoreState([25, 25, 70], [2, 2, 2], 'schneidster');
    const scored = handleScore(state, config);

    // Tie — wash
    for (const p of scored.players) {
      expect(p.scoreDelta).toBe(0);
    }
  });

  it('moster: player who takes every trick wins instead of losing', () => {
    const config = makeConfig({ noPick: 'moster' });
    // Player 2 took all tricks (all 120 points, all 7 tricks)
    const state = makeNoPickScoreState([0, 120, 0], [0, 7, 0], 'moster');
    const scored = handleScore(state, config);

    // Player 2 took every trick — they win
    expect(scored.players[1].scoreDelta).toBeGreaterThan(0);
    expect(scored.players[0].scoreDelta).toBeLessThan(0);
    expect(scored.players[2].scoreDelta).toBeLessThan(0);
    // Zero-sum
    const total = scored.players.reduce((s, p) => s + (p.scoreDelta ?? 0), 0);
    expect(total).toBe(0);
  });

  it('schwanzer: player with greatest trump power is the only loser', () => {
    const config = makeConfig({ noPick: 'schwanzer' });
    // We need to set up hands for power calculation. Queens=3, Jacks=2, Diamonds=1
    const state: SheepsheadState = {
      ...makeNoPickScoreState([0, 0, 0], [0, 0, 0], 'schwanzer'),
      players: [
        // Player 1: qc(3) + jd(2) + ad(1) = 6 power
        {
          userID: 1,
          role: 'opposition',
          hand: [card('qc'), card('jd'), card('ad')],
          tricksWon: 0,
          pointsWon: 0,
          cardsWon: [],
          scoreDelta: null,
        },
        // Player 2: qs(3) + 7d(1) = 4 power
        {
          userID: 2,
          role: 'opposition',
          hand: [card('qs'), card('7d')],
          tricksWon: 0,
          pointsWon: 0,
          cardsWon: [],
          scoreDelta: null,
        },
        // Player 3: jc(2) = 2 power
        {
          userID: 3,
          role: 'opposition',
          hand: [card('jc')],
          tricksWon: 0,
          pointsWon: 0,
          cardsWon: [],
          scoreDelta: null,
        },
      ],
    };
    const scored = handleScore(state, config);

    // Player 1 (6 power) loses
    expect(scored.players[0].scoreDelta).toBeLessThan(0);
    expect(scored.players[1].scoreDelta).toBeGreaterThan(0);
    expect(scored.players[2].scoreDelta).toBeGreaterThan(0);
    // Zero-sum
    const total = scored.players.reduce((s, p) => s + (p.scoreDelta ?? 0), 0);
    expect(total).toBe(0);
  });

  it('schwanzer: tiebreaker goes to player with highest trump card', () => {
    const config = makeConfig({ noPick: 'schwanzer' });
    const state: SheepsheadState = {
      ...makeNoPickScoreState([0, 0, 0], [0, 0, 0], 'schwanzer'),
      players: [
        // Player 1: qs(3) + 7d(1) = 4 power, highest trump = qs (index 1)
        {
          userID: 1,
          role: 'opposition',
          hand: [card('qs'), card('7d')],
          tricksWon: 0,
          pointsWon: 0,
          cardsWon: [],
          scoreDelta: null,
        },
        // Player 2: qh(3) + 8d(1) = 4 power, highest trump = qh (index 2)
        {
          userID: 2,
          role: 'opposition',
          hand: [card('qh'), card('8d')],
          tricksWon: 0,
          pointsWon: 0,
          cardsWon: [],
          scoreDelta: null,
        },
        // Player 3: jc(2) = 2 power
        {
          userID: 3,
          role: 'opposition',
          hand: [card('jc')],
          tricksWon: 0,
          pointsWon: 0,
          cardsWon: [],
          scoreDelta: null,
        },
      ],
    };
    const scored = handleScore(state, config);

    // Player 1 has qs (index 1 in TRUMP_ORDER) — higher than qh (index 2)
    // Player 1 loses the tiebreaker
    expect(scored.players[0].scoreDelta).toBeLessThan(0);
    expect(scored.players[1].scoreDelta).toBeGreaterThan(0);
    expect(scored.players[2].scoreDelta).toBeGreaterThan(0);
  });

  it('partnerOffTheHook: partner not penalized when picking team takes no tricks', () => {
    const config = makeConfig({ partnerOffTheHook: true, partnerRule: 'jd' });
    const state: SheepsheadState = {
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
          tricksWon: 3,
          pointsWon: 60,
          cardsWon: [],
          scoreDelta: null,
        },
        {
          userID: 4,
          role: 'opposition',
          hand: [],
          tricksWon: 4,
          pointsWon: 60,
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
      tricks: [
        // All tricks won by opposition
        {
          plays: [
            { player: 3, card: card('ac') },
            { player: 1, card: card('7c') },
          ],
          winner: 3,
        },
        {
          plays: [
            { player: 4, card: card('as') },
            { player: 2, card: card('7s') },
          ],
          winner: 4,
        },
        {
          plays: [
            { player: 3, card: card('ah') },
            { player: 1, card: card('7h') },
          ],
          winner: 3,
        },
        {
          plays: [
            { player: 4, card: card('kc') },
            { player: 2, card: card('8c') },
          ],
          winner: 4,
        },
        {
          plays: [
            { player: 3, card: card('ks') },
            { player: 1, card: card('8s') },
          ],
          winner: 3,
        },
        {
          plays: [
            { player: 4, card: card('kh') },
            { player: 2, card: card('8h') },
          ],
          winner: 4,
        },
        {
          plays: [
            { player: 4, card: card('9c') },
            { player: 2, card: card('9s') },
          ],
          winner: 4,
        },
      ],
      crack: null,
      blitz: null,
      previousGameDouble: null,
      noPick: null,
      redeals: null,
    };
    const scored = handleScore(state, config);

    // Partner should have 0 delta (off the hook)
    expect(scored.players[1].scoreDelta).toBe(0);
    // Picker pays the full penalty alone
    expect(scored.players[0].scoreDelta).toBeLessThan(0);
    // Opposition still wins
    expect(scored.players[2].scoreDelta).toBeGreaterThan(0);
    expect(scored.players[3].scoreDelta).toBeGreaterThan(0);
    // Zero-sum
    const total = scored.players.reduce((s, p) => s + (p.scoreDelta ?? 0), 0);
    expect(total).toBe(0);
  });

  it('leaster: tied fewest points — first in reduce wins', () => {
    const config = makeConfig({ noPick: 'leaster' });
    const state = makeNoPickScoreState([20, 20, 80], [1, 1, 5], 'leaster');
    const scored = handleScore(state, config);

    // Both player 1 and 2 have 20 pts; reduce picks the first minimum
    expect(scored.players[0].scoreDelta).toBeGreaterThan(0);
    expect(scored.players[1].scoreDelta).toBeLessThan(0);
    expect(scored.players[2].scoreDelta).toBeLessThan(0);
    const total = scored.players.reduce((s, p) => s + (p.scoreDelta ?? 0), 0);
    expect(total).toBe(0);
  });

  it('moster: tied most points — first in reduce loses', () => {
    const config = makeConfig({ noPick: 'moster' });
    const state = makeNoPickScoreState([60, 60, 0], [3, 3, 1], 'moster');
    const scored = handleScore(state, config);

    // Both player 1 and 2 have 60 pts; reduce picks the first maximum → player 1 loses
    expect(scored.players[0].scoreDelta).toBeLessThan(0);
    expect(scored.players[1].scoreDelta).toBeGreaterThan(0);
    expect(scored.players[2].scoreDelta).toBeGreaterThan(0);
    const total = scored.players.reduce((s, p) => s + (p.scoreDelta ?? 0), 0);
    expect(total).toBe(0);
  });

  it('schneidster: all players over 30 is a wash', () => {
    const config = makeConfig({ noPick: 'schneidster' });
    const state = makeNoPickScoreState([40, 40, 40], [2, 3, 2], 'schneidster');
    const scored = handleScore(state, config);

    for (const p of scored.players) {
      expect(p.scoreDelta).toBe(0);
    }
  });

  it('mittler: 5-player game picks correct middle', () => {
    const config = makeConfig({ playerCount: 5, handSize: 6, blindSize: 2, noPick: 'mittler' });
    const state = makeNoPickScoreState([10, 50, 30, 20, 10], [1, 3, 1, 1, 1], 'mittler');
    const scored = handleScore(state, config);

    // Sorted: [10, 10, 20, 30, 50] → middle = 20 → player 4 wins
    expect(scored.players[3].scoreDelta).toBeGreaterThan(0);
    const total = scored.players.reduce((s, p) => s + (p.scoreDelta ?? 0), 0);
    expect(total).toBe(0);
  });
});
