import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import * as fc from 'fast-check';
import type { FieldRegistry, GenericConfigPreset } from '@cardquorum/engine';
import { GameService } from '../game/game.service';
import { WebSocketService } from '../websocket.service';
import { RoomContextService } from './room-context.service';
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
      allowedPlayerCounts: [2],
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
      allowedPlayerCounts: [4],
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
      allowedPlayerCounts: [3],
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
      allowedPlayerCounts: [4],
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
      allowedPlayerCounts: [2],
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

  const sessionIdSignal = signal<number | null>(null);
  const currentRoomIdSignal = signal<number | null>(42);

  const mockGameService = {
    sessionId: sessionIdSignal,
    store: signal(null),
    createGame: jest.fn(),
    startGame: jest.fn(),
    cancelGame: jest.fn(),
    error: signal(null),
  };

  const mockRoomContext = {
    currentRoomId: currentRoomIdSignal,
  };

  const mockWsService = {
    on: jest.fn().mockReturnValue(() => {
      /* noop */
    }),
    send: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    sessionIdSignal.set(null);
    currentRoomIdSignal.set(42);

    await TestBed.configureTestingModule({
      imports: [RoomGameTab, FormsModule],
      providers: [
        { provide: GameService, useValue: mockGameService },
        { provide: RoomContextService, useValue: mockRoomContext },
        { provide: WebSocketService, useValue: mockWsService },
      ],
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

// Start/Abort button tests
describe('RoomGameTab — Start/Abort buttons', () => {
  let fixture: ComponentFixture<RoomGameTab>;
  let el: HTMLElement;

  const sessionIdSignal = signal<number | null>(null);
  const currentRoomIdSignal = signal<number | null>(42);

  const mockGameService = {
    sessionId: sessionIdSignal,
    store: signal(null),
    createGame: jest.fn(),
    startGame: jest.fn(),
    cancelGame: jest.fn(),
    error: signal(null),
  };

  const mockRoomContext = {
    currentRoomId: currentRoomIdSignal,
  };

  const mockWsService = {
    on: jest.fn().mockReturnValue(() => {
      /* noop */
    }),
    send: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    sessionIdSignal.set(null);
    currentRoomIdSignal.set(42);

    await TestBed.configureTestingModule({
      imports: [RoomGameTab, FormsModule],
      providers: [
        { provide: GameService, useValue: mockGameService },
        { provide: RoomContextService, useValue: mockRoomContext },
        { provide: WebSocketService, useValue: mockWsService },
      ],
    }).compileComponents();
  });

  function createComponent(isOwner: boolean) {
    fixture = TestBed.createComponent(RoomGameTab);
    fixture.componentRef.setInput('isOwner', isOwner);
    el = fixture.nativeElement;
    fixture.detectChanges();
  }

  it('shows Start button when owner and no active session', () => {
    createComponent(true);

    expect(el.querySelector('[data-testid="start-game-btn"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="abort-game-btn"]')).toBeNull();
  });

  it('shows Abort button when owner and session is active', () => {
    sessionIdSignal.set(1);
    createComponent(true);

    expect(el.querySelector('[data-testid="abort-game-btn"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="start-game-btn"]')).toBeNull();
  });

  it('hides both buttons when not owner', () => {
    createComponent(false);

    expect(el.querySelector('[data-testid="start-game-btn"]')).toBeNull();
    expect(el.querySelector('[data-testid="abort-game-btn"]')).toBeNull();
  });

  it('hides both buttons when not owner even with active session', () => {
    sessionIdSignal.set(1);
    createComponent(false);

    expect(el.querySelector('[data-testid="start-game-btn"]')).toBeNull();
    expect(el.querySelector('[data-testid="abort-game-btn"]')).toBeNull();
  });

  it('calls createGame on Start button click', async () => {
    createComponent(true);

    // Provide roster players so validation passes
    fixture.componentRef.setInput('rosterPlayers', [
      { userId: 1, username: 'alice', displayName: null, section: 'players', position: 0 },
      { userId: 2, username: 'bob', displayName: null, section: 'players', position: 1 },
    ]);
    fixture.detectChanges();

    // Select a game type so onStart has a valid gameType
    const gameSelect = el.querySelector('#game-type') as HTMLSelectElement;
    gameSelect.value = 'sheepshead';
    gameSelect.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    // Select the first variant (Two-Handed, allowedPlayerCounts: [2])
    const presetSelect = el.querySelector('#preset') as HTMLSelectElement;
    presetSelect.value = '0';
    presetSelect.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const startBtn = el.querySelector('[data-testid="start-game-btn"]') as HTMLButtonElement;
    startBtn.click();
    fixture.detectChanges();

    expect(mockGameService.createGame).toHaveBeenCalledWith(42, 'sheepshead', expect.any(Object));
  });

  it('calls cancelGame on Abort button click', () => {
    sessionIdSignal.set(1);
    createComponent(true);

    const abortBtn = el.querySelector('[data-testid="abort-game-btn"]') as HTMLButtonElement;
    abortBtn.click();
    fixture.detectChanges();

    const confirmBtn = document.querySelector(
      '[data-testid="confirm-dialog-confirm"]',
    ) as HTMLButtonElement;
    confirmBtn.click();
    fixture.detectChanges();

    expect(mockGameService.cancelGame).toHaveBeenCalled();
  });

  it('replaces Abort with Start when session ends', () => {
    sessionIdSignal.set(1);
    createComponent(true);

    expect(el.querySelector('[data-testid="abort-game-btn"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="start-game-btn"]')).toBeNull();

    // Session ends
    sessionIdSignal.set(null);
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="start-game-btn"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="abort-game-btn"]')).toBeNull();
  });
});

// Form locking during active game session
describe('RoomGameTab — form locking during active session', () => {
  let fixture: ComponentFixture<RoomGameTab>;
  let el: HTMLElement;

  const sessionIdSignal = signal<number | null>(null);
  const currentRoomIdSignal = signal<number | null>(42);

  const mockGameService = {
    sessionId: sessionIdSignal,
    store: signal(null),
    createGame: jest.fn(),
    startGame: jest.fn(),
    cancelGame: jest.fn(),
    error: signal(null),
  };

  const mockRoomContext = {
    currentRoomId: currentRoomIdSignal,
  };

  const mockWsService = {
    on: jest.fn().mockReturnValue(() => {
      /* noop */
    }),
    send: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    sessionIdSignal.set(null);
    currentRoomIdSignal.set(42);

    await TestBed.configureTestingModule({
      imports: [RoomGameTab, FormsModule],
      providers: [
        { provide: GameService, useValue: mockGameService },
        { provide: RoomContextService, useValue: mockRoomContext },
        { provide: WebSocketService, useValue: mockWsService },
      ],
    }).compileComponents();
  });

  async function createWithPreset(isOwner: boolean) {
    fixture = TestBed.createComponent(RoomGameTab);
    fixture.componentRef.setInput('isOwner', isOwner);
    el = fixture.nativeElement;
    fixture.detectChanges();

    // Select a game type
    const gameSelect = el.querySelector('#game-type') as HTMLSelectElement;
    gameSelect.value = 'sheepshead';
    gameSelect.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    // Select the first variant
    const presetSelect = el.querySelector('#preset') as HTMLSelectElement;
    presetSelect.value = '0';
    presetSelect.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('disables game type, variant, and config fields when session is active', async () => {
    await createWithPreset(true);

    // Fields should be enabled before session starts
    const gameSelect = el.querySelector('#game-type') as HTMLSelectElement;
    const presetSelect = el.querySelector('#preset') as HTMLSelectElement;
    expect(gameSelect.disabled).toBe(false);
    expect(presetSelect.disabled).toBe(false);

    // Activate a session
    sessionIdSignal.set(99);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    // Game type and variant should now be disabled
    expect(gameSelect.disabled).toBe(true);
    expect(presetSelect.disabled).toBe(true);

    // All config field inputs and selects should be disabled
    const configSelects = Array.from(
      el.querySelectorAll<HTMLSelectElement>('select[id^="field-"]'),
    );
    for (const select of configSelects) {
      expect(select.disabled).toBe(true);
    }
    const configNumberInputs = Array.from(
      el.querySelectorAll<HTMLInputElement>('input[type="number"]'),
    );
    for (const input of configNumberInputs) {
      expect(input.disabled).toBe(true);
    }
    const configCheckboxes = Array.from(
      el.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
    );
    for (const cb of configCheckboxes) {
      expect(cb.disabled).toBe(true);
    }
  });

  it('keeps autostart button enabled for owner during active session', async () => {
    await createWithPreset(true);

    // Activate a session
    sessionIdSignal.set(99);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const autostartBtn = el.querySelector(
      '[data-testid="autostart-checkbox"]',
    ) as HTMLButtonElement;
    expect(autostartBtn).toBeTruthy();
    expect(autostartBtn.disabled).toBe(false);
  });

  it('re-enables form fields when session ends', async () => {
    sessionIdSignal.set(99);
    await createWithPreset(true);

    const gameSelect = el.querySelector('#game-type') as HTMLSelectElement;
    expect(gameSelect.disabled).toBe(true);

    // Session ends
    sessionIdSignal.set(null);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(gameSelect.disabled).toBe(false);

    const presetSelect = el.querySelector('#preset') as HTMLSelectElement;
    expect(presetSelect.disabled).toBe(false);
  });
});

// Autostart checkbox tests
describe('RoomGameTab — Autostart checkbox', () => {
  let fixture: ComponentFixture<RoomGameTab>;
  let el: HTMLElement;

  const sessionIdSignal = signal<number | null>(null);
  const storeSignal = signal<unknown>(null);
  const currentRoomIdSignal = signal<number | null>(42);

  const mockGameService = {
    sessionId: sessionIdSignal,
    store: storeSignal,
    createGame: jest.fn(),
    startGame: jest.fn(),
    cancelGame: jest.fn(),
    error: signal(null),
  };

  const mockRoomContext = {
    currentRoomId: currentRoomIdSignal,
  };

  const mockWsService = {
    on: jest.fn().mockReturnValue(() => {
      /* noop */
    }),
    send: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    sessionIdSignal.set(null);
    storeSignal.set(null);
    currentRoomIdSignal.set(42);

    await TestBed.configureTestingModule({
      imports: [RoomGameTab, FormsModule],
      providers: [
        { provide: GameService, useValue: mockGameService },
        { provide: RoomContextService, useValue: mockRoomContext },
        { provide: WebSocketService, useValue: mockWsService },
      ],
    }).compileComponents();
  });

  function createComponent(isOwner: boolean) {
    fixture = TestBed.createComponent(RoomGameTab);
    fixture.componentRef.setInput('isOwner', isOwner);
    el = fixture.nativeElement;
    fixture.detectChanges();
  }

  it('renders autostart button for owner', () => {
    createComponent(true);

    const autostartBtn = el.querySelector(
      '[data-testid="autostart-checkbox"]',
    ) as HTMLButtonElement;
    expect(autostartBtn).toBeTruthy();
    expect(autostartBtn.disabled).toBe(false);
  });

  it('hides autostart button for non-owner', async () => {
    createComponent(false);
    await fixture.whenStable();
    fixture.detectChanges();

    const autostartBtn = el.querySelector('[data-testid="autostart-checkbox"]');
    expect(autostartBtn).toBeFalsy();
  });

  it('keeps autostart button enabled for owner during active session', () => {
    sessionIdSignal.set(99);
    createComponent(true);

    const autostartBtn = el.querySelector(
      '[data-testid="autostart-checkbox"]',
    ) as HTMLButtonElement;
    expect(autostartBtn.disabled).toBe(false);
  });

  it('sends game-settings:update via WS when owner toggles autostart', () => {
    createComponent(true);

    const autostartBtn = el.querySelector(
      '[data-testid="autostart-checkbox"]',
    ) as HTMLButtonElement;

    autostartBtn.click();
    fixture.detectChanges();

    expect(mockWsService.send).toHaveBeenCalledWith(
      'game-settings:update',
      expect.objectContaining({
        roomId: 42,
        settings: expect.objectContaining({ autostart: true }),
      }),
    );
  });
});

// Settings persistence and restoration via WebSocket
describe('RoomGameTab — settings persistence via WebSocket', () => {
  let fixture: ComponentFixture<RoomGameTab>;
  let el: HTMLElement;

  const sessionIdSignal = signal<number | null>(null);
  const currentRoomIdSignal = signal<number | null>(42);

  const mockGameService = {
    sessionId: sessionIdSignal,
    store: signal(null),
    createGame: jest.fn(),
    startGame: jest.fn(),
    cancelGame: jest.fn(),
    error: signal(null),
  };

  const mockRoomContext = {
    currentRoomId: currentRoomIdSignal,
  };

  // Capture WS event handlers so we can invoke them in tests
  let wsHandlers: Record<string, ((data: unknown) => void)[]>;

  const mockWsService = {
    on: jest.fn().mockImplementation((event: string, handler: (data: unknown) => void) => {
      if (!wsHandlers[event]) wsHandlers[event] = [];
      wsHandlers[event].push(handler);
      return () => {
        wsHandlers[event] = wsHandlers[event].filter((h) => h !== handler);
      };
    }),
    send: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    wsHandlers = {};
    sessionIdSignal.set(null);
    currentRoomIdSignal.set(42);

    await TestBed.configureTestingModule({
      imports: [RoomGameTab, FormsModule],
      providers: [
        { provide: GameService, useValue: mockGameService },
        { provide: RoomContextService, useValue: mockRoomContext },
        { provide: WebSocketService, useValue: mockWsService },
      ],
    }).compileComponents();
  });

  function createComponent(isOwner: boolean) {
    fixture = TestBed.createComponent(RoomGameTab);
    fixture.componentRef.setInput('isOwner', isOwner);
    el = fixture.nativeElement;
    fixture.detectChanges();
  }

  it('sends game-settings:load on init', () => {
    createComponent(true);

    expect(mockWsService.send).toHaveBeenCalledWith('game-settings:load', { roomId: 42 });
  });

  it('registers listeners for game-settings:loaded and game-settings:updated', () => {
    createComponent(true);

    const registeredEvents = mockWsService.on.mock.calls.map((c: unknown[]) => c[0]);
    expect(registeredEvents).toContain('game-settings:loaded');
    expect(registeredEvents).toContain('game-settings:updated');
  });

  it('populates form from game-settings:loaded response', async () => {
    createComponent(true);

    // Simulate server responding with saved settings
    const loadedHandlers = wsHandlers['game-settings:loaded'] ?? [];
    for (const handler of loadedHandlers) {
      handler({
        settings: {
          gameType: 'sheepshead',
          presetName: 'two-handed',
          config: { name: 'two-handed', playerCount: 2, handSize: 8, blindSize: 4 },
          autostart: true,
        },
      });
    }
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    // Verify the game type select is set
    const gameSelect = el.querySelector('#game-type') as HTMLSelectElement;
    expect(gameSelect.value).toBe('sheepshead');

    // Verify autostart is active
    const autostartBtn = el.querySelector(
      '[data-testid="autostart-checkbox"]',
    ) as HTMLButtonElement;
    expect(autostartBtn.getAttribute('aria-pressed')).toBe('true');
  });

  it('updates form from game-settings:updated broadcast', async () => {
    createComponent(false);

    // Simulate broadcast from server (another user changed settings)
    const updatedHandlers = wsHandlers['game-settings:updated'] ?? [];
    for (const handler of updatedHandlers) {
      handler({
        settings: {
          gameType: 'sheepshead',
          presetName: 'two-handed',
          config: { name: 'two-handed', playerCount: 2 },
          autostart: false,
        },
      });
    }
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const gameSelect = el.querySelector('#game-type') as HTMLSelectElement;
    expect(gameSelect.value).toBe('sheepshead');
  });

  it('sends game-settings:update when game type changes', async () => {
    createComponent(true);
    mockWsService.send.mockClear();

    const gameSelect = el.querySelector('#game-type') as HTMLSelectElement;
    gameSelect.value = 'sheepshead';
    gameSelect.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(mockWsService.send).toHaveBeenCalledWith(
      'game-settings:update',
      expect.objectContaining({
        roomId: 42,
        settings: expect.objectContaining({ gameType: 'sheepshead' }),
      }),
    );
  });

  it('sends game-settings:update when preset changes', async () => {
    createComponent(true);

    // First select a game
    const gameSelect = el.querySelector('#game-type') as HTMLSelectElement;
    gameSelect.value = 'sheepshead';
    gameSelect.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    mockWsService.send.mockClear();

    // Select a preset
    const presetSelect = el.querySelector('#preset') as HTMLSelectElement;
    presetSelect.value = '0';
    presetSelect.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(mockWsService.send).toHaveBeenCalledWith(
      'game-settings:update',
      expect.objectContaining({
        roomId: 42,
        settings: expect.objectContaining({ presetName: expect.any(String) }),
      }),
    );
  });

  it('does not send game-settings:update when applying settings from WS (no infinite loop)', () => {
    createComponent(true);
    mockWsService.send.mockClear();

    // Simulate receiving settings from server
    const loadedHandlers = wsHandlers['game-settings:loaded'] ?? [];
    for (const handler of loadedHandlers) {
      handler({
        settings: {
          gameType: 'sheepshead',
          presetName: 'two-handed',
          config: { name: 'two-handed', playerCount: 2 },
          autostart: false,
        },
      });
    }

    // Should NOT have sent game-settings:update (only game-settings:load was sent before clear)
    const updateCalls = mockWsService.send.mock.calls.filter(
      (c: unknown[]) => c[0] === 'game-settings:update',
    );
    expect(updateCalls).toHaveLength(0);
  });

  it('handles null settings in game-settings:loaded gracefully', () => {
    createComponent(true);

    const loadedHandlers = wsHandlers['game-settings:loaded'] ?? [];
    // Should not throw
    for (const handler of loadedHandlers) {
      handler({ settings: null });
    }

    fixture.detectChanges();

    // Form should remain in default state
    const gameSelect = el.querySelector('#game-type') as HTMLSelectElement;
    expect(gameSelect.value).toBe('');
  });
});

describe('Game action button visibility', () => {
  let fixture: ComponentFixture<RoomGameTab>;
  let el: HTMLElement;

  const sessionIdSig = signal<number | null>(null);
  const currentRoomIdSig = signal<number | null>(42);

  const mockGame = {
    sessionId: sessionIdSig,
    store: signal(null),
    createGame: jest.fn(),
    startGame: jest.fn(),
    cancelGame: jest.fn(),
    error: signal(null),
  };

  const mockRoomContext = {
    currentRoomId: currentRoomIdSig,
  };

  const mockWs = {
    on: jest.fn().mockReturnValue(jest.fn()),
    send: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    sessionIdSig.set(null);
    currentRoomIdSig.set(42);

    await TestBed.configureTestingModule({
      imports: [RoomGameTab, FormsModule],
      providers: [
        { provide: GameService, useValue: mockGame },
        { provide: RoomContextService, useValue: mockRoomContext },
        { provide: WebSocketService, useValue: mockWs },
      ],
    }).compileComponents();
  });

  afterEach(() => {
    fixture?.destroy();
  });

  /**
   * For any (isOwner, sessionId) tuple:
   * - Start button visible iff isOwner && sessionId === null
   * - Abort button visible iff isOwner && sessionId !== null
   * - Neither visible when !isOwner
   */
  it('shows correct button based on (isOwner, sessionId) tuple', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.option(fc.integer({ min: 1, max: 100_000 }), { nil: null }),
        (isOwner, sessionId) => {
          sessionIdSig.set(sessionId);

          fixture = TestBed.createComponent(RoomGameTab);
          fixture.componentRef.setInput('isOwner', isOwner);
          el = fixture.nativeElement;
          fixture.detectChanges();

          const startBtn = el.querySelector('[data-testid="start-game-btn"]');
          const abortBtn = el.querySelector('[data-testid="abort-game-btn"]');

          if (!isOwner) {
            // Neither button visible for non-owners
            expect(startBtn).toBeNull();
            expect(abortBtn).toBeNull();
          } else if (sessionId === null) {
            // Owner with no active session → Start visible, Abort hidden
            expect(startBtn).toBeTruthy();
            expect(abortBtn).toBeNull();
          } else {
            // Owner with active session → Abort visible, Start hidden
            expect(abortBtn).toBeTruthy();
            expect(startBtn).toBeNull();
          }

          fixture.destroy();
        },
      ),
      { numRuns: 100 },
    );
  });
});
