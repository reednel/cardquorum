import { isTrump, sumPoints, cardPower, cardsEqual } from '../cards';
import { DECK, TRUMP_ORDER, FAIL_RANK_ORDER } from '../constants';
import { TrickState } from '../types';
import { card } from './test-helpers';

describe('isTrump', () => {
  it('queens are trump', () => {
    expect(isTrump(card('qc'))).toBe(true);
    expect(isTrump(card('qs'))).toBe(true);
    expect(isTrump(card('qh'))).toBe(true);
    expect(isTrump(card('qd'))).toBe(true);
  });

  it('jacks are trump', () => {
    expect(isTrump(card('jc'))).toBe(true);
    expect(isTrump(card('js'))).toBe(true);
    expect(isTrump(card('jh'))).toBe(true);
    expect(isTrump(card('jd'))).toBe(true);
  });

  it('diamonds are trump', () => {
    expect(isTrump(card('7d'))).toBe(true);
    expect(isTrump(card('ad'))).toBe(true);
    expect(isTrump(card('xd'))).toBe(true);
  });

  it('fail suit cards are not trump', () => {
    expect(isTrump(card('ac'))).toBe(false);
    expect(isTrump(card('ks'))).toBe(false);
    expect(isTrump(card('7h'))).toBe(false);
    expect(isTrump(card('xc'))).toBe(false);
  });
});

describe('sumPoints', () => {
  it('empty array returns 0', () => {
    expect(sumPoints([])).toBe(0);
  });

  it('null returns 0', () => {
    expect(sumPoints(null)).toBe(0);
  });

  it('full deck sums to 120', () => {
    expect(sumPoints([...DECK])).toBe(120);
  });

  it('sums specific cards correctly', () => {
    expect(sumPoints([card('ac'), card('xc')])).toBe(21); // 11 + 10
    expect(sumPoints([card('7c'), card('8c')])).toBe(0);
    expect(sumPoints([card('kc')])).toBe(4);
  });

  it('sums tricks correctly', () => {
    const tricks: TrickState[] = [
      {
        plays: [
          { player: 1, card: card('ac') },
          { player: 2, card: card('xc') },
        ],
        winner: 1,
      },
    ];
    expect(sumPoints(tricks)).toBe(21);
  });
});

describe('cardPower', () => {
  it('trump beats fail — lower power index is stronger', () => {
    const trumpPower = cardPower(card('qc'), 'clubs');
    const failPower = cardPower(card('ac'), 'clubs');
    expect(trumpPower).toBeLessThan(failPower);
  });

  it('higher trump beats lower trump', () => {
    const qcPower = cardPower(card('qc'), 'clubs');
    const jcPower = cardPower(card('jc'), 'clubs');
    expect(qcPower).toBeLessThan(jcPower);
  });

  it('fail suit ordering: ace > 10 > king > 9 > 8 > 7', () => {
    const powers = FAIL_RANK_ORDER.map((rank) => {
      const c = DECK.find((d) => d.rank === rank && d.suit === 'clubs');
      return cardPower(c!, 'clubs');
    });
    // Each should be less than the next (lower = stronger)
    for (let i = 0; i < powers.length - 1; i++) {
      expect(powers[i]).toBeLessThan(powers[i + 1]);
    }
  });

  it('off-suit returns -1', () => {
    expect(cardPower(card('ac'), 'spades')).toBe(-1);
  });

  it('trump cards always have a non-negative power regardless of lead suit', () => {
    for (const name of TRUMP_ORDER) {
      expect(cardPower(card(name), 'clubs')).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('cardsEqual', () => {
  it('same card returns true', () => {
    expect(cardsEqual(card('ac'), card('ac'))).toBe(true);
  });

  it('different cards return false', () => {
    expect(cardsEqual(card('ac'), card('as'))).toBe(false);
    expect(cardsEqual(card('ac'), card('kc'))).toBe(false);
  });
});
