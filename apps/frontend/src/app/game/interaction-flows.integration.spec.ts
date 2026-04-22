import {
  InteractionController,
  InteractionDispatcher,
  InteractionPluginAdapter,
} from './interaction-controller';
import { SheepsheadTablePlugin } from './sheepshead/sheepshead-table-plugin';

// ── Shared test state factories ──

function makePlayState(overrides: Record<string, unknown> = {}) {
  return {
    phase: 'play',
    players: [
      {
        userID: 1,
        role: null,
        hand: [{ name: 'qc' }, { name: 'jc' }, { name: 'ac' }],
        tricksWon: 0,
        pointsWon: 0,
        scoreDelta: null,
      },
    ],
    activePlayer: 1,
    tricks: [{ plays: [], winner: null }],
    trickNumber: 1,
    blind: null,
    buried: null,
    calledCard: null,
    hole: null,
    crack: null,
    blitz: null,
    previousGameDouble: null,
    noPick: null,
    redeals: null,
    legalCardNames: ['qc', 'jc', 'ac'],
    dealerUserID: null,
    ...overrides,
  };
}

function makeBuryState(overrides: Record<string, unknown> = {}) {
  return {
    phase: 'bury',
    players: [
      {
        userID: 1,
        role: 'picker',
        hand: [{ name: 'qc' }, { name: 'jc' }, { name: 'ac' }, { name: '7s' }, { name: '8s' }],
        tricksWon: 0,
        pointsWon: 0,
        scoreDelta: null,
      },
    ],
    activePlayer: 1,
    tricks: [],
    trickNumber: 0,
    blind: null,
    buried: null,
    calledCard: null,
    hole: null,
    crack: null,
    blitz: null,
    previousGameDouble: null,
    noPick: null,
    redeals: null,
    legalCardNames: null,
    dealerUserID: null,
    ...overrides,
  };
}

/**
 * Wire an InteractionController with a real SheepsheadTablePlugin adapter
 * and a mock dispatcher, simulating what GameTable does in production.
 */
function createWiredController(state: unknown, validActions: string[]) {
  const ctrl = new InteractionController();

  const dispatcher: InteractionDispatcher = {
    queryTargets: jest.fn(),
    sendAction: jest.fn(),
  };

  const pluginAdapter: InteractionPluginAdapter = {
    getDefaultTarget: () => SheepsheadTablePlugin.getDefaultTarget(state, validActions),
    buildMoveEvent: (selectedCards, targetStackId) =>
      SheepsheadTablePlugin.buildMoveEvent(state, selectedCards, targetStackId) as {
        type: string;
        payload?: unknown;
      },
  };

  ctrl.init(dispatcher, pluginAdapter);

  return { ctrl, dispatcher, pluginAdapter };
}

/** Extract the generation from the last queryTargets call. */
function lastQueryGeneration(dispatcher: InteractionDispatcher): number {
  const calls = (dispatcher.queryTargets as jest.Mock).mock.calls;
  return calls[calls.length - 1][2] as number;
}

// ── Tests ──

describe('Select-then-target flow dispatches correct play_card event', () => {
  it('selects a card, receives targets, commits, and dispatches play_card', () => {
    const state = makePlayState();
    const { ctrl, dispatcher } = createWiredController(state, ['play_card']);

    // Register stacks that exist on the table
    ctrl.register('hand', document.createElement('div'));
    ctrl.register('trick-pile', document.createElement('div'));

    // Step 1: Select a card from hand
    ctrl.selectCard('hand', 'qc', 1);
    expect(ctrl.phase()).toBe('selecting');
    expect(ctrl.selectedCards()).toEqual(['qc']);
    expect(dispatcher.queryTargets).toHaveBeenCalledWith('hand', ['qc'], expect.any(Number));

    // Step 2: Simulate server responding with valid targets
    const generation = lastQueryGeneration(dispatcher);
    ctrl.receiveValidTargets(generation, ['trick-pile']);
    expect(ctrl.phase()).toBe('targeting');
    expect(ctrl.validTargets()).toEqual(['trick-pile']);

    // Step 3: Commit to the target
    ctrl.commitToTarget('trick-pile');

    // Verify the dispatched action matches what SheepsheadTablePlugin.buildPlayCardEvent produces
    expect(dispatcher.sendAction).toHaveBeenCalledTimes(1);
    const sentAction = (dispatcher.sendAction as jest.Mock).mock.calls[0][0];
    expect(sentAction.type).toBe('play_card');
    expect(sentAction.payload).toEqual({ card: { name: 'qc' } });

    // Controller resets to idle after dispatch
    expect(ctrl.phase()).toBe('idle');
    expect(ctrl.selectedCards()).toEqual([]);
  });
});

describe('Bury flow dispatches correct bury event via interaction system', () => {
  it('selects multiple cards, receives buried target, commits bury', () => {
    const state = makeBuryState();
    const { ctrl, dispatcher } = createWiredController(state, ['bury']);

    ctrl.register('hand', document.createElement('div'));
    ctrl.register('buried', document.createElement('div'));

    // Step 1: Select first card for burying
    ctrl.selectCard('hand', '7s', 2);
    expect(ctrl.phase()).toBe('selecting');
    expect(ctrl.selectedCards()).toEqual(['7s']);

    // Step 2: Select second card (bury requires 2 cards by default)
    ctrl.selectCard('hand', '8s', 2);
    expect(ctrl.selectedCards()).toEqual(['7s', '8s']);

    // Step 3: Simulate server responding with buried as valid target
    const generation = lastQueryGeneration(dispatcher);
    ctrl.receiveValidTargets(generation, ['buried']);
    expect(ctrl.phase()).toBe('targeting');
    expect(ctrl.validTargets()).toEqual(['buried']);

    // Step 4: Commit to the buried pile
    ctrl.commitToTarget('buried');

    // Verify the dispatched action is a bury event with both cards
    expect(dispatcher.sendAction).toHaveBeenCalledTimes(1);
    const sentAction = (dispatcher.sendAction as jest.Mock).mock.calls[0][0];
    expect(sentAction.type).toBe('bury');
    expect(sentAction.payload.cards).toHaveLength(2);
    const buriedNames = sentAction.payload.cards.map((c: { name: string }) => c.name);
    expect(buriedNames).toContain('7s');
    expect(buriedNames).toContain('8s');

    expect(ctrl.phase()).toBe('idle');
  });
});

describe('Double-click shortcut dispatches immediately during play phase', () => {
  it('confirms a card and dispatches play_card with no query or phase transition', () => {
    const state = makePlayState();
    const { ctrl, dispatcher } = createWiredController(state, ['play_card']);

    ctrl.register('hand', document.createElement('div'));
    ctrl.register('trick-pile', document.createElement('div'));

    // Double-click shortcut
    ctrl.confirmCard('hand', 'qc');

    // Should dispatch immediately — no queryTargets call
    expect(dispatcher.queryTargets).not.toHaveBeenCalled();

    // sendAction called with the correct play_card event
    expect(dispatcher.sendAction).toHaveBeenCalledTimes(1);
    const sentAction = (dispatcher.sendAction as jest.Mock).mock.calls[0][0];
    expect(sentAction.type).toBe('play_card');
    expect(sentAction.payload).toEqual({ card: { name: 'qc' } });

    // Phase never left idle
    expect(ctrl.phase()).toBe('idle');
  });

  it('falls back to selection when getDefaultTarget returns null (bury phase)', () => {
    const state = makeBuryState();
    const { ctrl, dispatcher } = createWiredController(state, ['bury']);

    ctrl.register('hand', document.createElement('div'));
    ctrl.register('buried', document.createElement('div'));

    // Double-click during bury phase — getDefaultTarget returns null
    ctrl.confirmCard('hand', 'qc');

    // Should enter selecting phase and send a query (no immediate dispatch)
    expect(ctrl.phase()).toBe('selecting');
    expect(ctrl.selectedCards()).toEqual(['qc']);
    expect(dispatcher.queryTargets).toHaveBeenCalledTimes(1);
    expect(dispatcher.sendAction).not.toHaveBeenCalled();
  });
});

describe('Stale query rejection with rapid selection changes', () => {
  it('ignores responses from previous selections and only honors the latest', () => {
    const state = makePlayState();
    const { ctrl, dispatcher } = createWiredController(state, ['play_card']);

    ctrl.register('hand', document.createElement('div'));
    ctrl.register('trick-pile', document.createElement('div'));

    // Rapid selection changes: select qc, then switch to jc, then to ac
    ctrl.selectCard('hand', 'qc', 1);
    const gen1 = lastQueryGeneration(dispatcher);

    // Change selection — reset and select different card
    ctrl.reset();
    ctrl.selectCard('hand', 'jc', 1);
    const gen2 = lastQueryGeneration(dispatcher);

    ctrl.reset();
    ctrl.selectCard('hand', 'ac', 1);
    const gen3 = lastQueryGeneration(dispatcher);

    // Deliver stale response for gen1
    ctrl.receiveValidTargets(gen1, ['trick-pile']);
    expect(ctrl.phase()).toBe('selecting'); // ignored

    // Deliver stale response for gen2
    ctrl.receiveValidTargets(gen2, ['trick-pile']);
    expect(ctrl.phase()).toBe('selecting'); // ignored

    // Deliver current response for gen3
    ctrl.receiveValidTargets(gen3, ['trick-pile']);
    expect(ctrl.phase()).toBe('targeting'); // accepted
    expect(ctrl.validTargets()).toEqual(['trick-pile']);
  });

  it('ignores stale response when selection changes mid-flight without reset', () => {
    const state = makeBuryState();
    const { ctrl, dispatcher } = createWiredController(state, ['bury']);

    ctrl.register('hand', document.createElement('div'));
    ctrl.register('buried', document.createElement('div'));

    // Select first card
    ctrl.selectCard('hand', '7s', 2);
    const gen1 = lastQueryGeneration(dispatcher);

    // Add second card — this sends a new query with a new generation
    ctrl.selectCard('hand', '8s', 2);
    const gen2 = lastQueryGeneration(dispatcher);

    expect(gen2).toBeGreaterThan(gen1);

    // Deliver the stale gen1 response
    ctrl.receiveValidTargets(gen1, ['buried']);
    expect(ctrl.phase()).toBe('selecting'); // stale, ignored

    // Deliver the current gen2 response
    ctrl.receiveValidTargets(gen2, ['buried']);
    expect(ctrl.phase()).toBe('targeting'); // accepted
  });
});

describe('Phase change resets interaction state', () => {
  it('simulates what GameTable does on phase change: calls reset', () => {
    const state = makeBuryState();
    const { ctrl, dispatcher } = createWiredController(state, ['bury']);

    ctrl.register('hand', document.createElement('div'));
    ctrl.register('buried', document.createElement('div'));

    // Player is mid-selection
    ctrl.selectCard('hand', '7s', 2);
    ctrl.selectCard('hand', '8s', 2);
    expect(ctrl.phase()).toBe('selecting');
    expect(ctrl.selectedCards()).toHaveLength(2);

    // Simulate phase change (GameTable calls reset on phase transitions)
    ctrl.reset();

    expect(ctrl.phase()).toBe('idle');
    expect(ctrl.selectedCards()).toEqual([]);
    expect(ctrl.sourceStack()).toBeNull();
    expect(ctrl.validTargets()).toEqual([]);
  });
});

describe('Unregistered target stacks are filtered from valid targets', () => {
  it('only includes registered stacks in validTargets', () => {
    const state = makePlayState();
    const { ctrl, dispatcher } = createWiredController(state, ['play_card']);

    // Only register hand — trick-pile is NOT registered
    ctrl.register('hand', document.createElement('div'));

    ctrl.selectCard('hand', 'qc', 1);
    const generation = lastQueryGeneration(dispatcher);

    // Server says trick-pile is valid, but it's not registered
    ctrl.receiveValidTargets(generation, ['trick-pile']);

    // Should stay in selecting because no registered targets matched
    expect(ctrl.phase()).toBe('selecting');
    expect(ctrl.validTargets()).toEqual([]);
  });
});
