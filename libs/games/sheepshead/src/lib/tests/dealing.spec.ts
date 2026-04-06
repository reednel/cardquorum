import { DECK } from '../constants';
import { createShuffledDeck, deal, hasNoAceFaceTrump } from '../dealing';
import { card } from './test-helpers';

describe('createShuffledDeck', () => {
  it('returns 32 cards', () => {
    expect(createShuffledDeck()).toHaveLength(32);
  });

  it('contains all the same cards as DECK', () => {
    const shuffled = createShuffledDeck();
    const names = shuffled.map((c) => c.name).sort();
    const deckNames = [...DECK].map((c) => c.name).sort();
    expect(names).toEqual(deckNames);
  });

  it('produces a different order from DECK (probabilistic)', () => {
    // Run multiple shuffles — at least one should differ
    const attempts = 5;
    let anyDifferent = false;
    for (let i = 0; i < attempts; i++) {
      const shuffled = createShuffledDeck();
      const same = shuffled.every((c, idx) => c.name === DECK[idx].name);
      if (!same) {
        anyDifferent = true;
        break;
      }
    }
    expect(anyDifferent).toBe(true);
  });
});

describe('deal', () => {
  const layouts = [
    { playerCount: 3, handSize: 10, blindSize: 2 },
    { playerCount: 4, handSize: 7, blindSize: 4 },
    { playerCount: 4, handSize: 8, blindSize: 0 },
    { playerCount: 5, handSize: 6, blindSize: 2 },
    { playerCount: 5, handSize: 6, blindSize: 0 },
  ] as const;

  it.each(layouts)('deals correctly for $playerCount players ($handSize/$blindSize)', (config) => {
    const deck = createShuffledDeck();
    const { hands, blind } = deal(deck, config);

    expect(hands).toHaveLength(config.playerCount);
    for (const hand of hands) {
      expect(hand).toHaveLength(config.handSize);
    }
    expect(blind).toHaveLength(config.blindSize);

    // All cards accounted for
    const allCards = [...blind, ...hands.flat()];
    expect(allCards).toHaveLength(config.playerCount * config.handSize + config.blindSize);

    // No duplicates
    const names = allCards.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('createShuffledDeck with cardsRemoved', () => {
  it('removes specified cards from the deck', () => {
    const deck = createShuffledDeck(['7c', '7s']);
    expect(deck).toHaveLength(30);
    const names = deck.map((c) => c.name);
    expect(names).not.toContain('7c');
    expect(names).not.toContain('7s');
    // All remaining cards unique
    expect(new Set(names).size).toBe(30);
  });

  it('returns full deck when cardsRemoved is empty', () => {
    expect(createShuffledDeck([])).toHaveLength(32);
  });
});

describe('deal with additional player counts', () => {
  const layouts = [
    { playerCount: 2, handSize: 14, blindSize: 4 },
    { playerCount: 6, handSize: 5, blindSize: 2 },
    { playerCount: 7, handSize: 4, blindSize: 4 },
    { playerCount: 8, handSize: 4, blindSize: 0 },
  ] as const;

  it.each(layouts)('deals correctly for $playerCount players ($handSize/$blindSize)', (config) => {
    const deck = createShuffledDeck();
    const { hands, blind } = deal(deck, config);

    expect(hands).toHaveLength(config.playerCount);
    for (const hand of hands) {
      expect(hand).toHaveLength(config.handSize);
    }
    expect(blind).toHaveLength(config.blindSize);

    const allCards = [...blind, ...hands.flat()];
    expect(allCards).toHaveLength(config.playerCount * config.handSize + config.blindSize);

    const names = allCards.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('deals correctly with cardsRemoved', () => {
    const deck = createShuffledDeck(['7c', '7s']);
    const { hands, blind } = deal(deck, { playerCount: 4 as const, handSize: 7, blindSize: 2 });

    expect(hands).toHaveLength(4);
    for (const hand of hands) {
      expect(hand).toHaveLength(7);
    }
    expect(blind).toHaveLength(2);

    const allCards = [...blind, ...hands.flat()];
    expect(allCards).toHaveLength(30);
    const names = allCards.map((c) => c.name);
    expect(names).not.toContain('7c');
    expect(names).not.toContain('7s');
  });
});

describe('hasNoAceFaceTrump', () => {
  it('returns true when a hand has only low fail cards', () => {
    // Hand with only 7s, 8s, 9s of fail suits — no ace, no face, no trump
    const hands = [
      [card('7c'), card('8c'), card('9c'), card('7s'), card('8s'), card('9s')],
      [card('ac'), card('qc'), card('jd'), card('ad')],
    ];
    expect(hasNoAceFaceTrump(hands)).toBe(true);
  });

  it('returns false when all hands have at least one ace, face, or trump', () => {
    const hands = [
      [card('7c'), card('8c'), card('ac')], // has ace
      [card('7s'), card('qc')], // has face (queen is also trump)
      [card('7h'), card('7d')], // has trump (diamond)
    ];
    expect(hasNoAceFaceTrump(hands)).toBe(false);
  });

  it('returns false when hand has a trump diamond', () => {
    const hands = [
      [card('7d'), card('8c'), card('9c')], // 7d is trump
    ];
    expect(hasNoAceFaceTrump(hands)).toBe(false);
  });

  it('returns false when hand has a king (face card)', () => {
    const hands = [
      [card('kc'), card('8s'), card('9s')], // king is a face card
    ];
    expect(hasNoAceFaceTrump(hands)).toBe(false);
  });
});
