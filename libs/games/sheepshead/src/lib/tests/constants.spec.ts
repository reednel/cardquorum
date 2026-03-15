import { CONFIG_PRESETS, DECK, FAIL_RANK_ORDER, TOTAL_POINTS, TRUMP_ORDER } from '../constants';
import { SheepsheadPlugin } from '../sheepshead-plugin';

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

describe('CONFIG_PRESETS', () => {
  it.each(CONFIG_PRESETS.map((p, i) => ({ ...p, idx: i })))(
    '$label ($fixed.playerCount players): deck math checks out',
    (preset) => {
      const removed = preset.fixed.cardsRemoved?.length ?? 0;
      const deckSize = 32 - removed;
      const { playerCount, handSize, blindSize } = preset.fixed;
      expect(playerCount! * handSize! + blindSize!).toBe(deckSize);
    },
  );

  it.each(CONFIG_PRESETS.map((p, i) => ({ ...p, idx: i })))(
    '$label ($fixed.playerCount players): name has no whitespace',
    (preset) => {
      expect(preset.fixed.name).toMatch(/^\S+$/);
    },
  );

  it.each(CONFIG_PRESETS.map((p, i) => ({ ...p, idx: i })))(
    '$label ($fixed.playerCount players): merged config passes validateConfig',
    (preset) => {
      const merged = { ...preset.defaults, ...preset.fixed };
      expect(SheepsheadPlugin.validateConfig(merged)).toBe(true);
    },
  );
});
