import { evaluateTrick, legalPlays } from './tricks';
import { DECK } from './constants';
import { Card, TrickState } from './types';

function card(name: string): Card {
  const c = DECK.find((d) => d.name === name);
  if (!c) throw new Error(`Card not found: ${name}`);
  return c;
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
  it('any card when leading', () => {
    const hand = [card('ac'), card('qc'), card('7s')];
    const trick: TrickState = { plays: [], winner: null };
    expect(legalPlays(hand, trick)).toEqual(hand);
  });

  it('must follow trump when trump led', () => {
    const hand = [card('ac'), card('qc'), card('7d')];
    const trick: TrickState = {
      plays: [{ player: 1, card: card('jc') }], // trump lead
      winner: null,
    };
    const legal = legalPlays(hand, trick);
    // qc and 7d are trump
    expect(legal).toHaveLength(2);
    expect(legal.map((c) => c.name).sort()).toEqual(['7d', 'qc']);
  });

  it('must follow fail suit when fail led', () => {
    const hand = [card('ac'), card('kc'), card('7s'), card('qc')];
    const trick: TrickState = {
      plays: [{ player: 1, card: card('9c') }], // clubs lead
      winner: null,
    };
    const legal = legalPlays(hand, trick);
    // ac and kc are the only clubs (non-trump)
    expect(legal).toHaveLength(2);
    expect(legal.map((c) => c.name).sort()).toEqual(['ac', 'kc']);
  });

  it('any card when void in led suit', () => {
    const hand = [card('as'), card('ks'), card('7s')];
    const trick: TrickState = {
      plays: [{ player: 1, card: card('ac') }], // clubs lead
      winner: null,
    };
    // No clubs in hand, can play anything
    expect(legalPlays(hand, trick)).toEqual(hand);
  });

  it('any card when void in trump', () => {
    const hand = [card('ac'), card('as'), card('7c')];
    const trick: TrickState = {
      plays: [{ player: 1, card: card('qc') }], // trump lead
      winner: null,
    };
    // No trump in hand
    expect(legalPlays(hand, trick)).toEqual(hand);
  });
});
