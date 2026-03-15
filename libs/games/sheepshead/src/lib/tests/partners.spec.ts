import {
  determinePartnerJD,
  determinePartnerCalledAce,
  assignPartnerByRule,
  determinePartnerByCard,
  assignCardPairPartners,
} from '../partners';
import { SheepsheadState, Card, PlayerState } from '../types';
import { card } from './test-helpers';

function makePlayer(userID: number, hand: Card[], role: PlayerState['role'] = null): PlayerState {
  return { userID, role, hand, tricksWon: 0, pointsWon: 0, cardsWon: [], scoreDelta: null };
}

function makeState(players: PlayerState[]): SheepsheadState {
  return {
    players,
    phase: 'play',
    trickNumber: 1,
    activePlayer: players[0].userID,
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
}

describe('determinePartnerJD', () => {
  it('returns holder of Jack of Diamonds', () => {
    const state = makeState([
      makePlayer(1, [card('ac')]),
      makePlayer(2, [card('jd')]),
      makePlayer(3, [card('as')]),
    ]);
    expect(determinePartnerJD(state)).toBe(2);
  });

  it('returns null when JD is not in any hand', () => {
    const state = makeState([makePlayer(1, [card('ac')]), makePlayer(2, [card('as')])]);
    expect(determinePartnerJD(state)).toBeNull();
  });
});

describe('determinePartnerCalledAce', () => {
  it('returns holder of called suit ace', () => {
    const state = makeState([makePlayer(1, [card('ac')]), makePlayer(2, [card('as')])]);
    expect(determinePartnerCalledAce(state, 'as')).toBe(2);
  });

  it('returns null when no one holds the ace', () => {
    const state = makeState([makePlayer(1, [card('7c')]), makePlayer(2, [card('7s')])]);
    expect(determinePartnerCalledAce(state, 'ac')).toBeNull();
  });
});

describe('determinePartnerByCard', () => {
  it('returns holder of Jack of Clubs', () => {
    const state = makeState([
      makePlayer(1, [card('ac')]),
      makePlayer(2, [card('jc')]),
      makePlayer(3, [card('as')]),
    ]);
    expect(determinePartnerByCard(state, 'jc')).toBe(2);
  });

  it('returns null when card is not in any hand', () => {
    const state = makeState([makePlayer(1, [card('ac')]), makePlayer(2, [card('as')])]);
    expect(determinePartnerByCard(state, 'jc')).toBeNull();
  });
});

describe('assignCardPairPartners', () => {
  it('assigns two holders as partners when different players hold each card', () => {
    const state = makeState([
      makePlayer(1, [card('qc'), card('7c')]),
      makePlayer(2, [card('qs'), card('7s')]),
      makePlayer(3, [card('ac'), card('as')]),
      makePlayer(4, [card('ah'), card('kc')]),
    ]);
    const result = assignCardPairPartners(state, 'qc', 'qs');

    expect(result.players[0].role).toBe('picker'); // holder of first card
    expect(result.players[1].role).toBe('partner'); // holder of second card
    expect(result.players[2].role).toBe('opposition');
    expect(result.players[3].role).toBe('opposition');
  });

  it('assigns solo picker when one player holds both cards', () => {
    const state = makeState([
      makePlayer(1, [card('qc'), card('qs'), card('7c')]),
      makePlayer(2, [card('ac'), card('7s')]),
      makePlayer(3, [card('as'), card('ah')]),
      makePlayer(4, [card('kc'), card('ks')]),
    ]);
    const result = assignCardPairPartners(state, 'qc', 'qs');

    expect(result.players[0].role).toBe('picker');
    expect(result.players[1].role).toBe('opposition');
    expect(result.players[2].role).toBe('opposition');
    expect(result.players[3].role).toBe('opposition');
  });
});

describe('assignPartnerByRule', () => {
  it('jd: assigns JD holder as partner', () => {
    const state = makeState([
      makePlayer(1, [card('ac')], 'picker'),
      makePlayer(2, [card('jd')]),
      makePlayer(3, [card('as')]),
    ]);
    const result = assignPartnerByRule(state, 'jd');
    expect(result.players[1].role).toBe('partner');
    expect(result.players[2].role).toBe('opposition');
  });

  it('jc: assigns JC holder as partner', () => {
    const state = makeState([
      makePlayer(1, [card('ac')], 'picker'),
      makePlayer(2, [card('jc')]),
      makePlayer(3, [card('as')]),
    ]);
    const result = assignPartnerByRule(state, 'jc');
    expect(result.players[1].role).toBe('partner');
    expect(result.players[2].role).toBe('opposition');
  });

  it('qc-qs: assigns black queen holders as team', () => {
    const state = makeState([
      makePlayer(1, [card('qc')]),
      makePlayer(2, [card('qs')]),
      makePlayer(3, [card('ac')]),
      makePlayer(4, [card('as')]),
    ]);
    const result = assignPartnerByRule(state, 'qc-qs');
    expect(result.players[0].role).toBe('picker');
    expect(result.players[1].role).toBe('partner');
    expect(result.players[2].role).toBe('opposition');
    expect(result.players[3].role).toBe('opposition');
  });

  it('qs-jc: assigns QS and JC holders as team', () => {
    const state = makeState([
      makePlayer(1, [card('qs')]),
      makePlayer(2, [card('jc')]),
      makePlayer(3, [card('ac')]),
    ]);
    const result = assignPartnerByRule(state, 'qs-jc');
    expect(result.players[0].role).toBe('picker');
    expect(result.players[1].role).toBe('partner');
    expect(result.players[2].role).toBe('opposition');
  });

  it('qc-7d: assigns QC and 7D holders as team', () => {
    const state = makeState([
      makePlayer(1, [card('qc')]),
      makePlayer(2, [card('7d')]),
      makePlayer(3, [card('ac')]),
      makePlayer(4, [card('as')]),
    ]);
    const result = assignPartnerByRule(state, 'qc-7d');
    expect(result.players[0].role).toBe('picker');
    expect(result.players[1].role).toBe('partner');
  });

  it('left-of-picker: assigns player to picker left as partner', () => {
    const state = makeState([
      makePlayer(1, [card('ac')]),
      makePlayer(2, [card('as')]),
      makePlayer(3, [card('ah')], 'picker'),
      makePlayer(4, [card('kc')]),
    ]);
    const result = assignPartnerByRule(state, 'left-of-picker');
    // Player to the left of picker (index 3) is index 4 % 4 = 0
    expect(result.players[3].role).toBe('partner');
    expect(result.players[0].role).toBe('opposition');
  });

  it('first-trick: returns state unchanged (deferred)', () => {
    const state = makeState([
      makePlayer(1, [card('ac')], 'picker'),
      makePlayer(2, [card('as')]),
      makePlayer(3, [card('ah')]),
    ]);
    const result = assignPartnerByRule(state, 'first-trick');
    // No roles assigned yet — partner determined at trick resolution
    expect(result.players[1].role).toBeNull();
    expect(result.players[2].role).toBeNull();
  });
});
