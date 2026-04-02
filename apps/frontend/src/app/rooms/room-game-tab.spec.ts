import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import type { FieldRegistry, GenericConfigPreset } from '@cardquorum/engine';
import { buildFieldEntries, RoomGameTab } from './room-game-tab';

const VALID_RENDER_TYPES = ['boolean', 'select', 'number', 'nullable-number', 'hidden-array'];
const VALID_MODES = ['hidden', 'locked', 'editable'];

/** Sample preset + registry pairs that share the same keys. */
const pairedFixtures: { label: string; preset: GenericConfigPreset; registry: FieldRegistry }[] = [
  {
    label: 'single boolean field',
    preset: {
      name: 'one',
      label: 'One',
      description: 'Single field',
      playerCount: 2,
      fields: { flag: { value: true, mode: 'editable' } },
    },
    registry: {
      flag: { displayName: 'Flag', description: 'A boolean flag', renderType: 'boolean' },
    },
  },
  {
    label: 'multiple mixed fields',
    preset: {
      name: 'multi',
      label: 'Multi',
      description: 'Multiple fields',
      playerCount: 4,
      fields: {
        count: { value: 5, mode: 'locked' },
        rule: { value: 'standard', mode: 'editable' },
        enabled: { value: false, mode: 'hidden' },
      },
    },
    registry: {
      count: { displayName: 'Count', description: 'How many', renderType: 'number' },
      rule: { displayName: 'Rule', description: 'Which rule', renderType: 'select' },
      enabled: { displayName: 'Enabled', description: '', renderType: 'boolean' },
    },
  },
  {
    label: 'nullable and hidden-array fields',
    preset: {
      name: 'special',
      label: 'Special',
      description: 'Special types',
      playerCount: 3,
      fields: {
        limit: { value: null, mode: 'editable' },
        removed: { value: ['a', 'b'], mode: 'hidden' },
      },
    },
    registry: {
      limit: { displayName: 'Limit', description: 'Max allowed', renderType: 'nullable-number' },
      removed: { displayName: 'Removed', description: 'Items removed', renderType: 'hidden-array' },
    },
  },
];

describe('Field entry metadata propagation', () => {
  it.each(pairedFixtures.map((f) => [f.label, f.preset, f.registry]))(
    '%s — buildFieldEntries propagates displayName, description, and renderType from registry',
    (_label, preset, registry) => {
      const entries = buildFieldEntries(preset as GenericConfigPreset, registry as FieldRegistry);

      expect(entries.length).toBe(Object.keys((preset as GenericConfigPreset).fields).length);

      for (const entry of entries) {
        const meta = (registry as FieldRegistry)[entry.key];
        expect(entry.displayName).toBe(meta.displayName);
        expect(entry.description).toBe(meta.description);
        expect(entry.renderType).toBe(meta.renderType);
      }
    },
  );
});

describe('Plugin-driven rendering is game-agnostic', () => {
  it.each(pairedFixtures.map((f) => [f.label, f.preset, f.registry]))(
    '%s — produces valid FieldEntry objects without game-specific code',
    (_label, preset, registry) => {
      const entries = buildFieldEntries(preset as GenericConfigPreset, registry as FieldRegistry);

      expect(entries.length).toBeGreaterThan(0);

      for (const entry of entries) {
        expect(typeof entry.displayName).toBe('string');
        expect(entry.displayName.length).toBeGreaterThan(0);
        expect(VALID_RENDER_TYPES).toContain(entry.renderType);
        expect(VALID_MODES).toContain(entry.mode);
        expect(entry.value).toBeDefined();
      }
    },
  );
});

// Unit tests for buildFieldEntries edge cases
describe('buildFieldEntries — edge cases', () => {
  it('falls back to key as displayName, empty description, and "number" renderType when registry key is missing', () => {
    const preset: GenericConfigPreset = {
      name: 'test',
      label: 'Test',
      description: 'A test preset',
      playerCount: 4,
      fields: {
        knownField: { value: true, mode: 'editable' },
        unknownField: { value: 42, mode: 'locked' },
      },
    };

    const registry: FieldRegistry = {
      knownField: {
        displayName: 'Known Field',
        description: 'This field is known.',
        renderType: 'boolean',
      },
    };

    const entries = buildFieldEntries(preset, registry);
    const known = entries.find((e) => e.key === 'knownField');
    const unknown = entries.find((e) => e.key === 'unknownField');

    expect(known?.displayName).toBe('Known Field');
    expect(known?.description).toBe('This field is known.');
    expect(known?.renderType).toBe('boolean');

    expect(unknown?.displayName).toBe('unknownField');
    expect(unknown?.description).toBe('');
    expect(unknown?.renderType).toBe('number');
  });

  it('produces entries with empty description when the registry description is empty', () => {
    const preset: GenericConfigPreset = {
      name: 'empty-desc',
      label: 'Empty Desc',
      description: 'Preset with empty field descriptions',
      playerCount: 2,
      fields: {
        alpha: { value: 10, mode: 'editable' },
        beta: { value: false, mode: 'locked' },
      },
    };

    const registry: FieldRegistry = {
      alpha: { displayName: 'Alpha', description: '', renderType: 'number' },
      beta: { displayName: 'Beta', description: '', renderType: 'boolean' },
    };

    const entries = buildFieldEntries(preset, registry);

    for (const entry of entries) {
      expect(entry.description).toBe('');
    }
  });
});

// Component rendering tests
describe('RoomGameTab — component rendering', () => {
  let fixture: ComponentFixture<RoomGameTab>;
  let el: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RoomGameTab, FormsModule],
    }).compileComponents();

    fixture = TestBed.createComponent(RoomGameTab);
    el = fixture.nativeElement;
    fixture.detectChanges();
  });

  it('renders displayName from registry and title attributes for non-empty descriptions', async () => {
    const gameSelect = el.querySelector('#game-type') as HTMLSelectElement;
    gameSelect.value = 'sheepshead';
    gameSelect.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const presetSelect = el.querySelector('#preset') as HTMLSelectElement;
    presetSelect.value = '0';
    presetSelect.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const allText = el.textContent ?? '';
    expect(allText).toContain('Hand Size');
    expect(allText).toContain('Blind Size');
    expect(allText).toContain('Cracking');

    const titledElements = el.querySelectorAll('[title]');
    const titles = Array.from(titledElements).map((e) => e.getAttribute('title'));
    const nonEmptyTitles = titles.filter((t) => t && t.length > 0);

    expect(nonEmptyTitles.length).toBeGreaterThan(0);
    expect(titles).toContain('Number of cards dealt to each player.');
  });
});
