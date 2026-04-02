import {
  CONFIG_PRESETS,
  FIELD_REGISTRY,
  SheepsheadConfigPlugin,
  SheepsheadConfigSchema,
} from '../config';
import { DECK, FAIL_RANK_ORDER, TOTAL_POINTS, TRUMP_ORDER } from '../constants';
import { SheepsheadPlugin } from '../sheepshead-plugin';
import { configFromPreset } from './test-helpers';

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
    '$label: deck math checks out',
    (preset) => {
      const removed = preset.fields.cardsRemoved.value.length;
      const deckSize = 32 - removed;
      expect(
        preset.playerCount * preset.fields.handSize.value + preset.fields.blindSize.value,
      ).toBe(deckSize);
    },
  );

  it.each(CONFIG_PRESETS.map((p, i) => ({ ...p, idx: i })))(
    '$label: name has no whitespace',
    (preset) => {
      expect(preset.name).toMatch(/^\S+$/);
    },
  );

  it.each(CONFIG_PRESETS.map((p, i) => ({ ...p, idx: i })))(
    '$label: config passes validateConfig',
    (preset) => {
      const merged = configFromPreset(preset);
      expect(SheepsheadPlugin.validateConfig(merged)).toBe(true);
    },
  );
});

describe('Preset-registry key alignment', () => {
  const registryKeys = new Set(Object.keys(SheepsheadConfigPlugin.fieldRegistry));

  it.each(SheepsheadConfigPlugin.presets.map((p) => [p.name, p.playerCount, p] as const))(
    'preset "%s" (%dp) fields match registry keys',
    (_name, _playerCount, preset) => {
      const presetKeys = new Set(Object.keys(preset.fields));
      expect(presetKeys).toEqual(registryKeys);
    },
  );
});

describe('Config schema validation round-trip', () => {
  it.each(SheepsheadConfigPlugin.presets.map((p) => [p.name, p.playerCount, p] as const))(
    'preset "%s" (%dp) flat config passes SheepsheadConfigSchema.safeParse()',
    (_name, _playerCount, preset) => {
      const flatConfig = {
        name: preset.name,
        playerCount: preset.playerCount,
        ...Object.fromEntries(Object.entries(preset.fields).map(([k, f]) => [k, f.value])),
      };

      const result = SheepsheadConfigSchema.safeParse(flatConfig);
      expect(result.success).toBe(true);
    },
  );
});

describe('Sheepshead-specific verification', () => {
  describe('FIELD_REGISTRY', () => {
    it('has exactly 13 entries', () => {
      expect(Object.keys(FIELD_REGISTRY)).toHaveLength(13);
    });

    it('has correct display names for all fields', () => {
      const expectedDisplayNames: Record<string, string> = {
        handSize: 'Hand Size',
        blindSize: 'Blind Size',
        pickerRule: 'Picker Rule',
        partnerRule: 'Partner Rule',
        noPick: 'No-Pick Rule',
        cracking: 'Cracking/Recracking',
        blitzing: 'Blitzing',
        doubleOnTheBump: 'Double on the Bump',
        partnerOffTheHook: 'Partner off the Hook',
        noAceFaceTrump: 'No Ace, No Face, No Trump',
        multiplicityLimit: 'Multiplicity Limit',
        callOwnAce: 'May Call Own Ace',
        cardsRemoved: 'Cards Removed',
      };

      for (const [key, expectedName] of Object.entries(expectedDisplayNames)) {
        expect(FIELD_REGISTRY[key as keyof typeof FIELD_REGISTRY].displayName).toBe(expectedName);
      }
    });
  });

  describe('SheepsheadConfigPlugin', () => {
    it('has label "Sheepshead"', () => {
      expect(SheepsheadConfigPlugin.label).toBe('Sheepshead');
    });

    it('has the FIELD_REGISTRY as its fieldRegistry', () => {
      expect(SheepsheadConfigPlugin.fieldRegistry).toBe(FIELD_REGISTRY);
    });

    it('has exactly 15 presets', () => {
      expect(SheepsheadConfigPlugin.presets).toHaveLength(15);
    });

    it('has SheepsheadConfigSchema as its configSchema', () => {
      expect(SheepsheadConfigPlugin.configSchema).toBe(SheepsheadConfigSchema);
    });
  });

  describe('Preset field counts', () => {
    it.each(SheepsheadConfigPlugin.presets.map((p) => [p.name, p.playerCount, p] as const))(
      'preset "%s" (%dp) has exactly 13 fields',
      (_name, _playerCount, preset) => {
        expect(Object.keys(preset.fields)).toHaveLength(13);
      },
    );
  });
});
