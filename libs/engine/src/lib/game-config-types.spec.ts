import type { FieldMetadata, FieldRegistry, GenericConfigPreset } from './game-config-types';

const VALID_RENDER_TYPES: FieldMetadata['renderType'][] = [
  'boolean',
  'select',
  'number',
  'nullable-number',
  'hidden-array',
];

const VALID_MODES = ['hidden', 'locked', 'editable'] as const;

/** A handful of representative registries to test against. */
const sampleRegistries: FieldRegistry[] = [
  {
    alpha: { displayName: 'Alpha', description: 'First field', renderType: 'boolean' },
  },
  {
    x: { displayName: 'X', description: '', renderType: 'number' },
    y: { displayName: 'Y', description: 'Second', renderType: 'select' },
    z: { displayName: 'Z', description: 'Third', renderType: 'nullable-number' },
  },
  {
    a: { displayName: 'A', description: 'desc-a', renderType: 'hidden-array' },
    b: { displayName: 'B', description: 'desc-b', renderType: 'boolean' },
    c: { displayName: 'C', description: '', renderType: 'number' },
    d: { displayName: 'D', description: 'desc-d', renderType: 'select' },
    e: { displayName: 'E', description: 'desc-e', renderType: 'nullable-number' },
  },
];

describe('Registry metadata completeness', () => {
  it.each(sampleRegistries.map((r, i) => [`registry ${i} (${Object.keys(r).length} keys)`, r]))(
    '%s — every entry has non-empty displayName, description string, and valid renderType',
    (_label, registry) => {
      for (const key of Object.keys(registry as FieldRegistry)) {
        const entry = (registry as FieldRegistry)[key];
        expect(typeof entry.displayName).toBe('string');
        expect(entry.displayName.length).toBeGreaterThan(0);
        expect(typeof entry.description).toBe('string');
        expect(VALID_RENDER_TYPES).toContain(entry.renderType);
      }
    },
  );
});

describe('Registry is metadata-only', () => {
  it.each(sampleRegistries.map((r, i) => [`registry ${i} (${Object.keys(r).length} keys)`, r]))(
    '%s — no entry contains value, mode, or options',
    (_label, registry) => {
      for (const key of Object.keys(registry as FieldRegistry)) {
        const entry = (registry as FieldRegistry)[key] as unknown as Record<string, unknown>;
        expect(entry).not.toHaveProperty('value');
        expect(entry).not.toHaveProperty('mode');
        expect(entry).not.toHaveProperty('options');
      }
    },
  );
});

describe('Preset structural completeness', () => {
  const samplePresets: GenericConfigPreset[] = [
    {
      name: 'minimal',
      label: 'Minimal',
      description: 'One field',
      playerCount: 2,
      fields: { score: { value: 0, mode: 'editable' } },
    },
    {
      name: 'mixed',
      label: 'Mixed Types',
      description: 'Various value types',
      playerCount: 5,
      fields: {
        flag: { value: true, mode: 'locked' },
        count: { value: 42, mode: 'editable' },
        limit: { value: null, mode: 'hidden' },
        tag: { value: 'hello', mode: 'editable' },
      },
    },
    {
      name: 'large',
      label: 'Large',
      description: 'Many fields',
      playerCount: 8,
      fields: {
        a: { value: 1, mode: 'editable' },
        b: { value: false, mode: 'locked' },
        c: { value: 'x', mode: 'hidden' },
        d: { value: null, mode: 'editable' },
        e: { value: 99, mode: 'locked' },
        f: { value: true, mode: 'editable' },
      },
    },
  ];

  it.each(samplePresets.map((p) => [p.name, p]))(
    'preset "%s" has valid structure',
    (_name, preset) => {
      const p = preset as GenericConfigPreset;
      expect(typeof p.name).toBe('string');
      expect(p.name.length).toBeGreaterThan(0);
      expect(typeof p.label).toBe('string');
      expect(p.label.length).toBeGreaterThan(0);
      expect(typeof p.description).toBe('string');
      expect(p.description.length).toBeGreaterThan(0);
      expect(Number.isInteger(p.playerCount)).toBe(true);
      expect(p.playerCount).toBeGreaterThan(0);

      for (const key of Object.keys(p.fields)) {
        const field = p.fields[key];
        expect(field.value).toBeDefined();
        expect(VALID_MODES as readonly string[]).toContain(field.mode);
      }
    },
  );
});
