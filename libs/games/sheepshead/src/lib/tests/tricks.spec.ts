import { evaluateTrick, legalPlays } from '../tricks';
import { SheepsheadConfig, SheepsheadState, TrickState, Card } from '../types';
import { card, makeConfig } from './test-helpers';

/** Build a minimal play-phase state for legalPlays tests. */
function playState(
  userID: number,
  hand: Card[],
  currentTrick: TrickState,
  overrides: Partial<SheepsheadState> = {},
): SheepsheadState {
  return {
    players: [
      { userID, role: null, hand, tricksWon: 0, pointsWon: 0, cardsWon: [], scoreDelta: null },
    ],
    phase: 'play',
    trickNumber: 1,
    activePlayer: userID,
    blind: [],
    buried: [],
    calledCard: null,
    hole: null,
    tricks: [currentTrick],
    crack: null,
    blitz: null,
    previousGameDouble: null,
    noPick: null,
    redeals: null,
    ...overrides,
  };
}

describe('evaluateTrick', () => {
  it('trump beats fail', () => {
    const trick: TrickState = {
      plays: [
        { player: 1, card: card('ac') }, // fail lead (ace of clubs)
        { player: 2, card: card('7d') }, // weakest trump
      ],
      winner: null,
    };
    expect(evaluateTrick(trick)).toBe(2);
  });

  it('higher trump beats lower trump', () => {
    const trick: TrickState = {
      plays: [
        { player: 1, card: card('jd') }, // lowest jack
        { player: 2, card: card('qc') }, // queen of clubs (highest trump)
      ],
      winner: null,
    };
    expect(evaluateTrick(trick)).toBe(2);
  });

  it('lead suit wins when no trump played', () => {
    const trick: TrickState = {
      plays: [
        { player: 1, card: card('ac') }, // ace of clubs (lead)
        { player: 2, card: card('kc') }, // king of clubs
      ],
      winner: null,
    };
    expect(evaluateTrick(trick)).toBe(1);
  });

  it('off-suit loses to lead suit', () => {
    const trick: TrickState = {
      plays: [
        { player: 1, card: card('7c') }, // 7 of clubs (lead)
        { player: 2, card: card('as') }, // ace of spades (off-suit)
      ],
      winner: null,
    };
    expect(evaluateTrick(trick)).toBe(1);
  });

  it('throws on empty trick', () => {
    expect(() => evaluateTrick({ plays: [], winner: null })).toThrow();
  });

  it('hole card does not win the trick', () => {
    const trick: TrickState = {
      plays: [
        { player: 1, card: card('qc'), isHoleCard: true }, // strongest trump, but hole card
        { player: 2, card: card('7c') },
        { player: 3, card: card('8c') },
      ],
      winner: null,
    };
    // 8c beats 7c in clubs; hole card is skipped
    expect(evaluateTrick(trick)).toBe(3);
  });

  it('hole card as lead gives no trick-taking power', () => {
    const trick: TrickState = {
      plays: [
        { player: 1, card: card('ac'), isHoleCard: true }, // lead but hole (clubs)
        { player: 2, card: card('7c') }, // follows clubs
        { player: 3, card: card('kc') }, // follows clubs, higher
      ],
      winner: null,
    };
    // Hole card lead has Infinity power — any real card beats it
    // kc beats 7c in clubs
    expect(evaluateTrick(trick)).toBe(3);
  });

  it('handles 3+ player tricks', () => {
    const trick: TrickState = {
      plays: [
        { player: 1, card: card('kc') },
        { player: 2, card: card('ac') }, // highest fail
        { player: 3, card: card('7c') },
      ],
      winner: null,
    };
    expect(evaluateTrick(trick)).toBe(2);
  });
});

describe('legalPlays', () => {
  const config = makeConfig();

  it('any card when leading', () => {
    const hand = [card('ac'), card('qc'), card('7s')];
    const trick: TrickState = { plays: [], winner: null };
    const state = playState(1, hand, trick);
    expect(legalPlays(state, config, 1).cards).toEqual(hand);
  });

  it('must follow trump when trump led', () => {
    const hand = [card('ac'), card('qc'), card('7d')];
    const trick: TrickState = {
      plays: [{ player: 2, card: card('jc') }], // trump lead
      winner: null,
    };
    const state = playState(1, hand, trick, {
      players: [
        { userID: 1, role: null, hand, tricksWon: 0, pointsWon: 0, cardsWon: [], scoreDelta: null },
        {
          userID: 2,
          role: null,
          hand: [],
          tricksWon: 0,
          pointsWon: 0,
          cardsWon: [],
          scoreDelta: null,
        },
      ],
    });
    const legal = legalPlays(state, config, 1).cards;
    // qc and 7d are trump
    expect(legal).toHaveLength(2);
    expect(legal.map((c) => c.name).sort()).toEqual(['7d', 'qc']);
  });

  it('must follow fail suit when fail led', () => {
    const hand = [card('ac'), card('kc'), card('7s'), card('qc')];
    const trick: TrickState = {
      plays: [{ player: 2, card: card('9c') }], // clubs lead
      winner: null,
    };
    const state = playState(1, hand, trick, {
      players: [
        { userID: 1, role: null, hand, tricksWon: 0, pointsWon: 0, cardsWon: [], scoreDelta: null },
        {
          userID: 2,
          role: null,
          hand: [],
          tricksWon: 0,
          pointsWon: 0,
          cardsWon: [],
          scoreDelta: null,
        },
      ],
    });
    const legal = legalPlays(state, config, 1).cards;
    // ac and kc are the only clubs (non-trump)
    expect(legal).toHaveLength(2);
    expect(legal.map((c) => c.name).sort()).toEqual(['ac', 'kc']);
  });

  it('any card when void in led suit', () => {
    const hand = [card('as'), card('ks'), card('7s')];
    const trick: TrickState = {
      plays: [{ player: 2, card: card('ac') }], // clubs lead
      winner: null,
    };
    const state = playState(1, hand, trick, {
      players: [
        { userID: 1, role: null, hand, tricksWon: 0, pointsWon: 0, cardsWon: [], scoreDelta: null },
        {
          userID: 2,
          role: null,
          hand: [],
          tricksWon: 0,
          pointsWon: 0,
          cardsWon: [],
          scoreDelta: null,
        },
      ],
    });
    // No clubs in hand, can play anything
    expect(legalPlays(state, config, 1).cards).toEqual(hand);
  });

  it('any card when void in trump', () => {
    const hand = [card('ac'), card('as'), card('7c')];
    const trick: TrickState = {
      plays: [{ player: 2, card: card('qc') }], // trump lead
      winner: null,
    };
    const state = playState(1, hand, trick, {
      players: [
        { userID: 1, role: null, hand, tricksWon: 0, pointsWon: 0, cardsWon: [], scoreDelta: null },
        {
          userID: 2,
          role: null,
          hand: [],
          tricksWon: 0,
          pointsWon: 0,
          cardsWon: [],
          scoreDelta: null,
        },
      ],
    });
    // No trump in hand
    expect(legalPlays(state, config, 1).cards).toEqual(hand);
  });
});
