import { createShuffledDeck, deal } from './dealing';
import { DECK } from './constants';

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
