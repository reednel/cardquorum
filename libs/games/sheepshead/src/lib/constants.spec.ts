import { DECK, TOTAL_POINTS, TRUMP_ORDER, FAIL_RANK_ORDER } from './constants';

describe('constants', () => {
  it('DECK has 32 cards', () => {
    expect(DECK).toHaveLength(32);
  });

  it('DECK points sum to TOTAL_POINTS (120)', () => {
    const total = DECK.reduce((sum, c) => sum + c.points, 0);
    expect(total).toBe(TOTAL_POINTS);
    expect(TOTAL_POINTS).toBe(120);
  });

  it('all card names in DECK are unique', () => {
    const names = DECK.map((c) => c.name);
    expect(new Set(names).size).toBe(32);
  });

  it('TRUMP_ORDER has 14 entries', () => {
    expect(TRUMP_ORDER).toHaveLength(14);
  });

  it('all TRUMP_ORDER entries are in DECK', () => {
    const deckNames = new Set(DECK.map((c) => c.name));
    for (const name of TRUMP_ORDER) {
      expect(deckNames.has(name)).toBe(true);
    }
  });

  it('FAIL_RANK_ORDER has 6 entries', () => {
    expect(FAIL_RANK_ORDER).toHaveLength(6);
  });
});
