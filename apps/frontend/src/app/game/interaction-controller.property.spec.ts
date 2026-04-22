import * as fc from 'fast-check';
import {
  InteractionController,
  InteractionDispatcher,
  InteractionPluginAdapter,
} from './interaction-controller';

const VALID_PHASES = ['idle', 'selecting', 'targeting'] as const;

const STACK_IDS = ['hand', 'trick-pile', 'buried', 'discard', 'deck'];
const CARD_NAMES = ['7c', '8c', '9c', 'xc', 'jc', 'qc', 'kc', 'ac', '7s', '8s', '9s', 'xs'];

function createMocks() {
  const dispatcher: InteractionDispatcher = {
    queryTargets: jest.fn(),
    sendAction: jest.fn(),
  };
  const pluginAdapter: InteractionPluginAdapter = {
    getDefaultTarget: jest.fn().mockReturnValue(null),
    buildMoveEvent: jest.fn().mockReturnValue({ type: 'move', payload: {} }),
  };
  return { dispatcher, pluginAdapter };
}

function createController(stacks: string[] = STACK_IDS) {
  const ctrl = new InteractionController();
  const mocks = createMocks();
  ctrl.init(mocks.dispatcher, mocks.pluginAdapter);
  for (const id of stacks) {
    ctrl.register(id, document.createElement('div'));
  }
  return { ctrl, ...mocks };
}

/**
 * Arbitrary that produces a random interaction operation.
 * Each operation is a function that mutates the controller state.
 */
const arbOperation = fc.oneof(
  // selectCard from a random stack with a random card
  fc.record({
    type: fc.constant('selectCard' as const),
    stackId: fc.constantFrom(...STACK_IDS),
    card: fc.constantFrom(...CARD_NAMES),
    max: fc.integer({ min: 1, max: 5 }),
  }),
  // deselectCard
  fc.record({
    type: fc.constant('deselectCard' as const),
    card: fc.constantFrom(...CARD_NAMES),
  }),
  // confirmCard (double-click)
  fc.record({
    type: fc.constant('confirmCard' as const),
    stackId: fc.constantFrom(...STACK_IDS),
    card: fc.constantFrom(...CARD_NAMES),
  }),
  // commitToTarget
  fc.record({
    type: fc.constant('commitToTarget' as const),
    stackId: fc.constantFrom(...STACK_IDS),
  }),
  // cancel
  fc.record({ type: fc.constant('cancel' as const) }),
  // reset
  fc.record({ type: fc.constant('reset' as const) }),
  // receiveValidTargets with random generation and targets
  fc.record({
    type: fc.constant('receiveValidTargets' as const),
    generation: fc.integer({ min: 0, max: 100 }),
    targets: fc.subarray(STACK_IDS, { minLength: 0, maxLength: STACK_IDS.length }),
  }),
);

type Operation = typeof arbOperation extends fc.Arbitrary<infer T> ? T : never;

function applyOperation(ctrl: InteractionController, op: Operation): void {
  switch (op.type) {
    case 'selectCard':
      ctrl.selectCard(op.stackId, op.card, op.max);
      break;
    case 'deselectCard':
      ctrl.deselectCard(op.card);
      break;
    case 'confirmCard':
      ctrl.confirmCard(op.stackId, op.card);
      break;
    case 'commitToTarget':
      ctrl.commitToTarget(op.stackId);
      break;
    case 'cancel':
      ctrl.cancel();
      break;
    case 'reset':
      ctrl.reset();
      break;
    case 'receiveValidTargets':
      ctrl.receiveValidTargets(op.generation, op.targets);
      break;
  }
}

describe('Phase signal is always idle, selecting, or targeting', () => {
  it('phase remains a valid value after any random sequence of operations', () => {
    fc.assert(
      fc.property(fc.array(arbOperation, { minLength: 1, maxLength: 50 }), (operations) => {
        const { ctrl } = createController();

        // Verify initial phase
        expect(VALID_PHASES).toContain(ctrl.phase());

        for (const op of operations) {
          applyOperation(ctrl, op);
          expect(VALID_PHASES).toContain(ctrl.phase());
        }
      }),
      { numRuns: 100 },
    );
  });
});

describe('Selection toggle adds, removes, and respects limits', () => {
  it('selecting a card from idle adds it and transitions to selecting', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...STACK_IDS),
        fc.constantFrom(...CARD_NAMES),
        fc.integer({ min: 1, max: 5 }),
        (stackId, card, max) => {
          const { ctrl } = createController();

          expect(ctrl.phase()).toBe('idle');
          expect(ctrl.selectedCards()).toEqual([]);

          ctrl.selectCard(stackId, card, max);

          expect(ctrl.phase()).toBe('selecting');
          expect(ctrl.selectedCards()).toContain(card);
          expect(ctrl.selectedCards()).toHaveLength(1);
          expect(ctrl.sourceStack()).toBe(stackId);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('selecting the same card again removes it from the selection', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...STACK_IDS),
        fc.constantFrom(...CARD_NAMES),
        fc.integer({ min: 1, max: 5 }),
        (stackId, card, max) => {
          const { ctrl } = createController();

          ctrl.selectCard(stackId, card, max);
          expect(ctrl.selectedCards()).toContain(card);

          // Click the same card again to toggle it off
          ctrl.selectCard(stackId, card, max);
          expect(ctrl.selectedCards()).not.toContain(card);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('phase returns to idle when all cards are deselected', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...STACK_IDS),
        fc.uniqueArray(fc.constantFrom(...CARD_NAMES), { minLength: 1, maxLength: 5 }),
        (stackId, cards) => {
          const { ctrl } = createController();
          const max = cards.length;

          // Select all cards
          for (const card of cards) {
            ctrl.selectCard(stackId, card, max);
          }
          expect(ctrl.phase()).toBe('selecting');
          expect(ctrl.selectedCards().length).toBe(cards.length);

          // Deselect all cards one by one (toggle each off)
          for (const card of cards) {
            ctrl.selectCard(stackId, card, max);
          }

          expect(ctrl.selectedCards()).toEqual([]);
          expect(ctrl.phase()).toBe('idle');
          expect(ctrl.sourceStack()).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('selection does not exceed maxSelections limit', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...STACK_IDS),
        fc.uniqueArray(fc.constantFrom(...CARD_NAMES), {
          minLength: 2,
          maxLength: CARD_NAMES.length,
        }),
        fc.integer({ min: 1, max: 4 }),
        (stackId, cards, max) => {
          const { ctrl } = createController();

          for (const card of cards) {
            ctrl.selectCard(stackId, card, max);
          }

          expect(ctrl.selectedCards().length).toBeLessThanOrEqual(max);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('selecting from a different source stack resets the previous selection', () => {
    // Use two distinct stacks to guarantee the source switch
    const arbTwoStacks = fc
      .uniqueArray(fc.constantFrom(...STACK_IDS), { minLength: 2, maxLength: 2 })
      .map(([a, b]) => ({ firstStack: a, secondStack: b }));

    fc.assert(
      fc.property(
        arbTwoStacks,
        fc.constantFrom(...CARD_NAMES),
        fc.constantFrom(...CARD_NAMES),
        fc.integer({ min: 1, max: 5 }),
        ({ firstStack, secondStack }, firstCard, secondCard, max) => {
          const { ctrl } = createController();

          // Select a card from the first stack
          ctrl.selectCard(firstStack, firstCard, max);
          expect(ctrl.sourceStack()).toBe(firstStack);
          expect(ctrl.selectedCards()).toContain(firstCard);

          // Select a card from a different stack
          ctrl.selectCard(secondStack, secondCard, max);

          // Source should switch, selection should contain only the new card
          expect(ctrl.sourceStack()).toBe(secondStack);
          expect(ctrl.selectedCards()).toEqual([secondCard]);
          expect(ctrl.selectedCards()).toHaveLength(1);
          expect(ctrl.phase()).toBe('selecting');
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('Target query generation tracking and stale response rejection', () => {
  it('each selectCard call increments the query generation and sends a target query', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.constantFrom(...CARD_NAMES), { minLength: 1, maxLength: 5 }),
        (cards) => {
          const { ctrl, dispatcher } = createController();

          for (let i = 0; i < cards.length; i++) {
            ctrl.selectCard('hand', cards[i], cards.length);

            // Each selectCard should have sent a query with incrementing generation
            const calls = (dispatcher.queryTargets as jest.Mock).mock.calls;
            expect(calls.length).toBeGreaterThanOrEqual(i + 1);
            const lastCall = calls[calls.length - 1];
            // generation should be a positive integer that increases
            expect(lastCall[2]).toBeGreaterThan(0);
          }

          // Verify generations are strictly increasing
          const allGenerations = (dispatcher.queryTargets as jest.Mock).mock.calls.map(
            (c: unknown[]) => c[2] as number,
          );
          for (let i = 1; i < allGenerations.length; i++) {
            expect(allGenerations[i]).toBeGreaterThan(allGenerations[i - 1]);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('responses with stale generation numbers are ignored', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 10 }),
        fc.subarray(STACK_IDS, { minLength: 1, maxLength: STACK_IDS.length }),
        (selectionCount, targets) => {
          const { ctrl, dispatcher } = createController();

          // Make multiple selections to advance the generation counter
          const cards = CARD_NAMES.slice(0, Math.min(selectionCount, CARD_NAMES.length));
          // Reset between selections to keep things clean — each selectCard from idle increments generation
          for (const card of cards) {
            ctrl.reset();
            ctrl.selectCard('hand', card, 5);
          }

          // The current generation is the last one sent
          const calls = (dispatcher.queryTargets as jest.Mock).mock.calls;
          const currentGeneration = calls[calls.length - 1][2] as number;

          // Deliver a response with an old generation (any generation before the current one)
          const staleGeneration = currentGeneration - 1;
          ctrl.receiveValidTargets(staleGeneration, targets);

          // Stale response should be ignored — phase stays selecting, no valid targets
          expect(ctrl.phase()).toBe('selecting');
          expect(ctrl.validTargets()).toEqual([]);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('only the response matching the current generation transitions to targeting', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 8 }),
        fc.subarray(STACK_IDS, { minLength: 1, maxLength: STACK_IDS.length }),
        (selectionCount, targets) => {
          const { ctrl, dispatcher } = createController();

          // Build up multiple generations by selecting different cards from idle
          const cards = CARD_NAMES.slice(0, Math.min(selectionCount, CARD_NAMES.length));
          for (const card of cards) {
            ctrl.reset();
            ctrl.selectCard('hand', card, 5);
          }

          const calls = (dispatcher.queryTargets as jest.Mock).mock.calls;
          const currentGeneration = calls[calls.length - 1][2] as number;

          // Deliver the response with the current generation
          ctrl.receiveValidTargets(currentGeneration, targets);

          // Should transition to targeting with the provided targets (filtered to registered stacks)
          const registeredTargets = targets.filter((t) => STACK_IDS.includes(t));
          if (registeredTargets.length > 0) {
            expect(ctrl.phase()).toBe('targeting');
            expect(ctrl.validTargets()).toEqual(registeredTargets);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('rapid selection changes result in only the latest query being honored', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.constantFrom(...CARD_NAMES), { minLength: 2, maxLength: 6 }),
        fc.subarray(STACK_IDS, { minLength: 1, maxLength: STACK_IDS.length }),
        (cards, targets) => {
          const { ctrl, dispatcher } = createController();

          // Simulate rapid selection changes — each from idle to get distinct generations
          const generations: number[] = [];
          for (const card of cards) {
            ctrl.reset();
            ctrl.selectCard('hand', card, 5);
            const calls = (dispatcher.queryTargets as jest.Mock).mock.calls;
            generations.push(calls[calls.length - 1][2] as number);
          }

          const currentGeneration = generations[generations.length - 1];

          // Deliver responses for ALL generations in random order
          // Only the current generation should be accepted
          for (const gen of generations) {
            // Reset to selecting for each attempt (only the last selectCard's state matters)
            // The controller is already in selecting from the last selectCard call
            if (gen !== currentGeneration) {
              ctrl.receiveValidTargets(gen, targets);
              // Stale — should still be selecting
              expect(ctrl.phase()).toBe('selecting');
              expect(ctrl.validTargets()).toEqual([]);
            }
          }

          // Now deliver the current generation response
          ctrl.receiveValidTargets(currentGeneration, targets);

          const registeredTargets = targets.filter((t) => STACK_IDS.includes(t));
          if (registeredTargets.length > 0) {
            expect(ctrl.phase()).toBe('targeting');
            expect(ctrl.validTargets()).toEqual(registeredTargets);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('Reset clears all interaction state regardless of current state', () => {
  function assertIdleState(ctrl: InteractionController): void {
    expect(ctrl.phase()).toBe('idle');
    expect(ctrl.selectedCards()).toEqual([]);
    expect(ctrl.sourceStack()).toBeNull();
    expect(ctrl.validTargets()).toEqual([]);
    expect(ctrl.isDragging()).toBe(false);
  }

  it('cancel returns all signals to idle defaults after any random operations', () => {
    fc.assert(
      fc.property(fc.array(arbOperation, { minLength: 1, maxLength: 50 }), (operations) => {
        const { ctrl } = createController();

        for (const op of operations) {
          applyOperation(ctrl, op);
        }

        ctrl.cancel();
        assertIdleState(ctrl);
      }),
      { numRuns: 100 },
    );
  });

  it('reset returns all signals to idle defaults after any random operations', () => {
    fc.assert(
      fc.property(fc.array(arbOperation, { minLength: 1, maxLength: 50 }), (operations) => {
        const { ctrl } = createController();

        for (const op of operations) {
          applyOperation(ctrl, op);
        }

        ctrl.reset();
        assertIdleState(ctrl);
      }),
      { numRuns: 100 },
    );
  });

  it('committing to an invalid target during targeting resets to idle', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...STACK_IDS),
        fc.constantFrom(...CARD_NAMES),
        fc.integer({ min: 1, max: 5 }),
        fc.subarray(STACK_IDS, { minLength: 1, maxLength: STACK_IDS.length }),
        (stackId, card, max, targets) => {
          const { ctrl } = createController();

          // Drive to targeting phase: select a card, then receive valid targets
          ctrl.selectCard(stackId, card, max);

          // After one selectCard, queryGeneration is 1
          ctrl.receiveValidTargets(1, targets);

          if (ctrl.phase() === 'targeting') {
            // Commit to a stack that is NOT in validTargets
            ctrl.commitToTarget('__nonexistent_stack__');
            assertIdleState(ctrl);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('completing a move via valid target resets to idle', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...STACK_IDS),
        fc.constantFrom(...CARD_NAMES),
        fc.integer({ min: 1, max: 5 }),
        fc.subarray(STACK_IDS, { minLength: 1, maxLength: STACK_IDS.length }),
        (stackId, card, max, targets) => {
          const { ctrl } = createController();

          ctrl.selectCard(stackId, card, max);
          ctrl.receiveValidTargets(1, targets);

          if (ctrl.phase() === 'targeting') {
            const validTarget = ctrl.validTargets()[0];
            ctrl.commitToTarget(validTarget);
            assertIdleState(ctrl);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('reset clears drag state along with all other signals', () => {
    fc.assert(
      fc.property(
        fc.array(arbOperation, { minLength: 1, maxLength: 30 }),
        fc.constantFrom('cancel', 'reset') as fc.Arbitrary<'cancel' | 'reset'>,
        (operations, method) => {
          const { ctrl } = createController();

          for (const op of operations) {
            applyOperation(ctrl, op);
          }

          // Ensure dragging is active before reset
          ctrl.dragStarted();
          expect(ctrl.isDragging()).toBe(true);

          if (method === 'cancel') {
            ctrl.cancel();
          } else {
            ctrl.reset();
          }
          assertIdleState(ctrl);
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('Double-click with default target dispatches immediately without query or phase change', () => {
  it('confirmCard dispatches move via buildMoveEvent and sendAction when getDefaultTarget returns non-null', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...STACK_IDS),
        fc.constantFrom(...CARD_NAMES),
        fc.constantFrom(...STACK_IDS),
        (sourceStackId, cardName, defaultTarget) => {
          const { ctrl, dispatcher, pluginAdapter } = createController();
          const sentinelEvent = { type: 'shortcut-move', payload: { id: Math.random() } };

          // Configure getDefaultTarget to return a non-null target
          (pluginAdapter.getDefaultTarget as jest.Mock).mockReturnValue(defaultTarget);
          (pluginAdapter.buildMoveEvent as jest.Mock).mockReturnValue(sentinelEvent);

          // Clear any prior calls from init
          (dispatcher.queryTargets as jest.Mock).mockClear();
          (dispatcher.sendAction as jest.Mock).mockClear();
          (pluginAdapter.buildMoveEvent as jest.Mock).mockClear();

          ctrl.confirmCard(sourceStackId, cardName);

          // buildMoveEvent called with [cardName] and the default target
          expect(pluginAdapter.buildMoveEvent).toHaveBeenCalledWith([cardName], defaultTarget);

          // sendAction called with the event returned by buildMoveEvent
          expect(dispatcher.sendAction).toHaveBeenCalledWith(sentinelEvent);

          // No server round-trip — queryTargets must NOT be called
          expect(dispatcher.queryTargets).not.toHaveBeenCalled();

          // No phase transition — phase remains idle
          expect(ctrl.phase()).toBe('idle');
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('Move dispatch contains correct selected cards and target stack ID', () => {
  /**
   * Helper: drive the controller to targeting phase with the given cards selected
   * from the given source stack, and the given targets as valid.
   * Returns the generation used so callers don't need to track it.
   */
  function driveToTargeting(
    ctrl: InteractionController,
    dispatcher: InteractionDispatcher,
    sourceStackId: string,
    cards: string[],
    targets: string[],
  ): void {
    // Select all cards (first card transitions idle→selecting, rest add to selection)
    for (const card of cards) {
      ctrl.selectCard(sourceStackId, card, cards.length);
    }

    // The generation is the last one sent via queryTargets
    const calls = (dispatcher.queryTargets as jest.Mock).mock.calls;
    const generation = calls[calls.length - 1][2] as number;

    // Deliver valid targets for the current generation
    ctrl.receiveValidTargets(generation, targets);
  }

  it('commitToTarget dispatches a move event with all selected cards and the clicked target', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...STACK_IDS),
        fc.uniqueArray(fc.constantFrom(...CARD_NAMES), { minLength: 1, maxLength: 5 }),
        fc.constantFrom(...STACK_IDS),
        (sourceStackId, cards, targetStackId) => {
          const { ctrl, dispatcher, pluginAdapter } = createController();
          const sentinelEvent = { type: 'test-move', payload: { id: Math.random() } };
          (pluginAdapter.buildMoveEvent as jest.Mock).mockReturnValue(sentinelEvent);

          driveToTargeting(ctrl, dispatcher, sourceStackId, cards, [targetStackId]);

          if (ctrl.phase() !== 'targeting') return; // target may not be registered; skip

          // Clear prior calls so we only see the commit call
          (pluginAdapter.buildMoveEvent as jest.Mock).mockClear();
          (dispatcher.sendAction as jest.Mock).mockClear();

          ctrl.commitToTarget(targetStackId);

          // buildMoveEvent was called with the full selection and the target
          expect(pluginAdapter.buildMoveEvent).toHaveBeenCalledWith(cards, targetStackId);

          // sendAction was called with exactly what buildMoveEvent returned
          expect(dispatcher.sendAction).toHaveBeenCalledWith(sentinelEvent);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('multi-card selections include all selected cards in the dispatched event', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...STACK_IDS),
        fc.uniqueArray(fc.constantFrom(...CARD_NAMES), { minLength: 2, maxLength: 6 }),
        fc.constantFrom(...STACK_IDS),
        (sourceStackId, cards, targetStackId) => {
          const { ctrl, dispatcher, pluginAdapter } = createController();
          const sentinelEvent = { type: 'multi-move', payload: { n: cards.length } };
          (pluginAdapter.buildMoveEvent as jest.Mock).mockReturnValue(sentinelEvent);

          driveToTargeting(ctrl, dispatcher, sourceStackId, cards, [targetStackId]);

          if (ctrl.phase() !== 'targeting') return;

          (pluginAdapter.buildMoveEvent as jest.Mock).mockClear();
          (dispatcher.sendAction as jest.Mock).mockClear();

          // Randomly choose click or drop
          ctrl.commitToTarget(targetStackId);

          const buildCall = (pluginAdapter.buildMoveEvent as jest.Mock).mock.calls[0];
          const [selectedCards, target] = buildCall;

          // Every originally selected card is present
          expect(selectedCards).toHaveLength(cards.length);
          for (const card of cards) {
            expect(selectedCards).toContain(card);
          }
          expect(target).toBe(targetStackId);

          // sendAction receives the exact return value of buildMoveEvent
          expect(dispatcher.sendAction).toHaveBeenCalledTimes(1);
          expect(dispatcher.sendAction).toHaveBeenCalledWith(sentinelEvent);
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('Live announcements for screen readers', () => {
  function driveToTargeting(
    ctrl: InteractionController,
    dispatcher: InteractionDispatcher,
    targets: string[],
  ): void {
    ctrl.selectCard('hand', '7c', 5);
    const calls = (dispatcher.queryTargets as jest.Mock).mock.calls;
    const generation = calls[calls.length - 1][2] as number;
    ctrl.receiveValidTargets(generation, targets);
  }

  it('announces the number of valid targets when transitioning to targeting', () => {
    fc.assert(
      fc.property(
        fc.subarray(STACK_IDS, { minLength: 1, maxLength: STACK_IDS.length }),
        (targets) => {
          const { ctrl, dispatcher } = createController();

          driveToTargeting(ctrl, dispatcher, targets);

          if (ctrl.phase() === 'targeting') {
            const count = ctrl.validTargets().length;
            expect(ctrl.liveAnnouncement()).toBe(`${count} valid targets available`);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('announces cancellation when cancel is called', () => {
    const { ctrl, dispatcher } = createController();

    driveToTargeting(ctrl, dispatcher, ['trick-pile']);
    expect(ctrl.phase()).toBe('targeting');

    ctrl.cancel();
    expect(ctrl.liveAnnouncement()).toBe('Interaction cancelled');
  });

  it('clears announcement on reset', () => {
    const { ctrl, dispatcher } = createController();

    driveToTargeting(ctrl, dispatcher, ['trick-pile']);
    expect(ctrl.liveAnnouncement()).toBe('1 valid targets available');

    ctrl.reset();
    expect(ctrl.liveAnnouncement()).toBe('');
  });

  it('starts with an empty announcement', () => {
    const ctrl = new InteractionController();
    expect(ctrl.liveAnnouncement()).toBe('');
  });
});

describe('Drop resolution returns geometrically correct target', () => {
  /**
   * Arbitrary: generates a non-overlapping bounding rect.
   * Each rect is placed on a grid to guarantee no overlaps.
   */
  const RECT_SIZE = 100;
  const GAP = 10;

  function createMockElement(rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  }): HTMLElement {
    const el = document.createElement('div');
    el.getBoundingClientRect = () => ({
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      left: rect.x,
      top: rect.y,
      right: rect.x + rect.width,
      bottom: rect.y + rect.height,
      toJSON: () => ({}),
    });
    return el;
  }

  /**
   * Generate non-overlapping rects for a list of stack IDs by placing them
   * in a horizontal row with gaps between them.
   */
  function buildStackRects(
    stackIds: string[],
  ): Map<string, { x: number; y: number; width: number; height: number }> {
    const rects = new Map<string, { x: number; y: number; width: number; height: number }>();
    stackIds.forEach((id, i) => {
      rects.set(id, {
        x: i * (RECT_SIZE + GAP),
        y: 0,
        width: RECT_SIZE,
        height: RECT_SIZE,
      });
    });
    return rects;
  }

  function findContainingStack(
    point: { x: number; y: number },
    rects: Map<string, { x: number; y: number; width: number; height: number }>,
    candidateIds: string[],
  ): string | null {
    for (const id of candidateIds) {
      const r = rects.get(id);
      if (
        r &&
        point.x >= r.x &&
        point.x <= r.x + r.width &&
        point.y >= r.y &&
        point.y <= r.y + r.height
      ) {
        return id;
      }
    }
    return null;
  }

  /** Arbitrary for a drop point that may or may not land inside any rect. */
  function arbDropPoint(stackCount: number): fc.Arbitrary<{ x: number; y: number }> {
    const maxX = stackCount * (RECT_SIZE + GAP) + RECT_SIZE;
    return fc.record({
      x: fc.double({ min: -50, max: maxX, noNaN: true, noDefaultInfinity: true }),
      y: fc.double({ min: -50, max: RECT_SIZE + 50, noNaN: true, noDefaultInfinity: true }),
    });
  }

  it('returns the valid target containing the drop point during targeting, or null', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...STACK_IDS),
        fc.constantFrom(...CARD_NAMES),
        fc.subarray(STACK_IDS, { minLength: 1, maxLength: STACK_IDS.length }),
        fc.integer({ min: 0, max: STACK_IDS.length }),
        (sourceStackId, cardName, validTargetIds, pointSeed) => {
          const ctrl = new InteractionController();
          const mocks = createMocks();
          ctrl.init(mocks.dispatcher, mocks.pluginAdapter);

          const stackRects = buildStackRects(STACK_IDS);

          // Register all stacks with mock elements
          for (const id of STACK_IDS) {
            ctrl.register(id, createMockElement(stackRects.get(id)!));
          }

          // Drive to targeting phase
          ctrl.selectCard(sourceStackId, cardName, 5);
          const calls = (mocks.dispatcher.queryTargets as jest.Mock).mock.calls;
          const generation = calls[calls.length - 1][2] as number;
          ctrl.receiveValidTargets(generation, validTargetIds);

          if (ctrl.phase() !== 'targeting') return;

          // Generate a drop point — use pointSeed to pick either inside a target or outside all
          const totalWidth = STACK_IDS.length * (RECT_SIZE + GAP) + RECT_SIZE;
          const dropPoint = {
            x: (pointSeed / STACK_IDS.length) * totalWidth - 50,
            y: RECT_SIZE / 2,
          };

          const result = ctrl.resolveDropTarget(sourceStackId, cardName, dropPoint);

          const registeredValidTargets = validTargetIds.filter((t) => STACK_IDS.includes(t));
          const expectedTarget = findContainingStack(dropPoint, stackRects, registeredValidTargets);

          if (expectedTarget !== null) {
            expect(result).toEqual({ targetId: expectedTarget, mode: 'commit' });
          } else {
            expect(result).toBeNull();
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('returns the valid target containing the drop point during targeting with random coordinates', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...STACK_IDS),
        fc.constantFrom(...CARD_NAMES),
        fc.subarray(STACK_IDS, { minLength: 1, maxLength: STACK_IDS.length }),
        arbDropPoint(STACK_IDS.length),
        (sourceStackId, cardName, validTargetIds, dropPoint) => {
          const ctrl = new InteractionController();
          const mocks = createMocks();
          ctrl.init(mocks.dispatcher, mocks.pluginAdapter);

          const stackRects = buildStackRects(STACK_IDS);

          for (const id of STACK_IDS) {
            ctrl.register(id, createMockElement(stackRects.get(id)!));
          }

          // Drive to targeting phase
          ctrl.selectCard(sourceStackId, cardName, 5);
          const calls = (mocks.dispatcher.queryTargets as jest.Mock).mock.calls;
          const generation = calls[calls.length - 1][2] as number;
          ctrl.receiveValidTargets(generation, validTargetIds);

          if (ctrl.phase() !== 'targeting') return;

          const result = ctrl.resolveDropTarget(sourceStackId, cardName, dropPoint);

          const registeredValidTargets = validTargetIds.filter((t) => STACK_IDS.includes(t));
          const expectedTarget = findContainingStack(dropPoint, stackRects, registeredValidTargets);

          if (expectedTarget !== null) {
            expect(result).toEqual({ targetId: expectedTarget, mode: 'commit' });
          } else {
            expect(result).toBeNull();
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('returns the default target containing the drop point during idle, or null', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...STACK_IDS),
        fc.constantFrom(...CARD_NAMES),
        fc.constantFrom(...STACK_IDS),
        arbDropPoint(STACK_IDS.length),
        (sourceStackId, cardName, defaultTargetId, dropPoint) => {
          const ctrl = new InteractionController();
          const mocks = createMocks();
          (mocks.pluginAdapter.getDefaultTarget as jest.Mock).mockReturnValue(defaultTargetId);
          ctrl.init(mocks.dispatcher, mocks.pluginAdapter);

          const stackRects = buildStackRects(STACK_IDS);

          for (const id of STACK_IDS) {
            ctrl.register(id, createMockElement(stackRects.get(id)!));
          }

          // IC is idle with no selection — this is the single-card drag-to-play shortcut path
          expect(ctrl.phase()).toBe('idle');
          expect(ctrl.selectedCards()).toEqual([]);

          const result = ctrl.resolveDropTarget(sourceStackId, cardName, dropPoint);

          const expectedTarget = findContainingStack(dropPoint, stackRects, [defaultTargetId]);

          if (expectedTarget !== null) {
            expect(result).toEqual({ targetId: defaultTargetId, mode: 'confirm' });
          } else {
            expect(result).toBeNull();
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('returns null during idle when no default target is configured', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...STACK_IDS),
        fc.constantFrom(...CARD_NAMES),
        arbDropPoint(STACK_IDS.length),
        (sourceStackId, cardName, dropPoint) => {
          const ctrl = new InteractionController();
          const mocks = createMocks();
          // getDefaultTarget returns null (default mock behavior)
          ctrl.init(mocks.dispatcher, mocks.pluginAdapter);

          const stackRects = buildStackRects(STACK_IDS);

          for (const id of STACK_IDS) {
            ctrl.register(id, createMockElement(stackRects.get(id)!));
          }

          expect(ctrl.phase()).toBe('idle');

          const result = ctrl.resolveDropTarget(sourceStackId, cardName, dropPoint);
          expect(result).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('returns null when card is not in selectedCards during targeting', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...STACK_IDS),
        fc.subarray(STACK_IDS, { minLength: 1, maxLength: STACK_IDS.length }),
        arbDropPoint(STACK_IDS.length),
        (sourceStackId, validTargetIds, dropPoint) => {
          const ctrl = new InteractionController();
          const mocks = createMocks();
          ctrl.init(mocks.dispatcher, mocks.pluginAdapter);

          const stackRects = buildStackRects(STACK_IDS);

          for (const id of STACK_IDS) {
            ctrl.register(id, createMockElement(stackRects.get(id)!));
          }

          // Select '7c' and drive to targeting
          ctrl.selectCard(sourceStackId, '7c', 5);
          const calls = (mocks.dispatcher.queryTargets as jest.Mock).mock.calls;
          const generation = calls[calls.length - 1][2] as number;
          ctrl.receiveValidTargets(generation, validTargetIds);

          if (ctrl.phase() !== 'targeting') return;

          // Use a card NOT in selectedCards
          const unselectedCard = CARD_NAMES.find((c) => !ctrl.selectedCards().includes(c));
          if (!unselectedCard) return;

          const result = ctrl.resolveDropTarget(sourceStackId, unselectedCard, dropPoint);
          expect(result).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('IC dispatches via the most recently provided dispatcher after repeated init calls', () => {
  it('always uses the latest dispatcher and adapter after interleaved init and operations', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5 }),
        fc.array(arbOperation, { minLength: 0, maxLength: 20 }),
        (initCount, operations) => {
          const ctrl = new InteractionController();

          // Register stacks so operations can work
          for (const id of STACK_IDS) {
            ctrl.register(id, document.createElement('div'));
          }

          let latestDispatcher!: InteractionDispatcher;
          let latestAdapter!: InteractionPluginAdapter;

          for (let i = 0; i < initCount; i++) {
            const mocks = createMocks();
            latestDispatcher = mocks.dispatcher;
            latestAdapter = mocks.pluginAdapter;
            ctrl.init(mocks.dispatcher, mocks.pluginAdapter);

            // Apply a slice of operations between init calls
            const sliceStart = Math.floor((i * operations.length) / initCount);
            const sliceEnd = Math.floor(((i + 1) * operations.length) / initCount);
            const opsSlice = operations.slice(sliceStart, sliceEnd);

            for (const op of opsSlice) {
              applyOperation(ctrl, op);
              expect(VALID_PHASES).toContain(ctrl.phase());
            }
          }

          // Reset to a clean idle state, then drive to a dispatch
          ctrl.reset();

          // Configure the latest adapter to enable confirmCard shortcut
          (latestAdapter.getDefaultTarget as jest.Mock).mockReturnValue('trick-pile');
          const sentinelEvent = { type: 'test-move', payload: { id: 42 } };
          (latestAdapter.buildMoveEvent as jest.Mock).mockReturnValue(sentinelEvent);
          (latestDispatcher.sendAction as jest.Mock).mockClear();

          // confirmCard with a default target dispatches immediately via the latest dispatcher
          ctrl.confirmCard('hand', '7c');

          expect(latestDispatcher.sendAction).toHaveBeenCalledTimes(1);
          expect(latestDispatcher.sendAction).toHaveBeenCalledWith(sentinelEvent);
          expect(latestAdapter.buildMoveEvent).toHaveBeenCalledWith(['7c'], 'trick-pile');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('previous dispatchers are never called after a subsequent init', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 5 }),
        fc.array(arbOperation, { minLength: 0, maxLength: 15 }),
        (initCount, operations) => {
          const ctrl = new InteractionController();

          for (const id of STACK_IDS) {
            ctrl.register(id, document.createElement('div'));
          }

          const allDispatchers: InteractionDispatcher[] = [];
          let latestAdapter!: InteractionPluginAdapter;

          for (let i = 0; i < initCount; i++) {
            const mocks = createMocks();
            allDispatchers.push(mocks.dispatcher);
            latestAdapter = mocks.pluginAdapter;
            ctrl.init(mocks.dispatcher, mocks.pluginAdapter);

            // Apply interleaved operations
            const sliceStart = Math.floor((i * operations.length) / initCount);
            const sliceEnd = Math.floor(((i + 1) * operations.length) / initCount);
            for (const op of operations.slice(sliceStart, sliceEnd)) {
              applyOperation(ctrl, op);
            }
          }

          // Reset and clear all mock call counts
          ctrl.reset();
          for (const d of allDispatchers) {
            (d.sendAction as jest.Mock).mockClear();
          }

          // Configure latest adapter for a dispatch
          (latestAdapter.getDefaultTarget as jest.Mock).mockReturnValue('trick-pile');
          (latestAdapter.buildMoveEvent as jest.Mock).mockReturnValue({ type: 'move' });

          ctrl.confirmCard('hand', '7c');

          // Only the last dispatcher should have been called
          const lastDispatcher = allDispatchers[allDispatchers.length - 1];
          expect(lastDispatcher.sendAction).toHaveBeenCalledTimes(1);

          // All previous dispatchers should NOT have been called
          for (let i = 0; i < allDispatchers.length - 1; i++) {
            expect(allDispatchers[i].sendAction).not.toHaveBeenCalled();
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('phase remains valid throughout all init calls and interleaved operations', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5 }),
        fc.array(arbOperation, { minLength: 1, maxLength: 30 }),
        (initCount, operations) => {
          const ctrl = new InteractionController();

          for (const id of STACK_IDS) {
            ctrl.register(id, document.createElement('div'));
          }

          expect(VALID_PHASES).toContain(ctrl.phase());

          for (let i = 0; i < initCount; i++) {
            const mocks = createMocks();
            ctrl.init(mocks.dispatcher, mocks.pluginAdapter);
            expect(VALID_PHASES).toContain(ctrl.phase());

            const sliceStart = Math.floor((i * operations.length) / initCount);
            const sliceEnd = Math.floor(((i + 1) * operations.length) / initCount);

            for (const op of operations.slice(sliceStart, sliceEnd)) {
              applyOperation(ctrl, op);
              expect(VALID_PHASES).toContain(ctrl.phase());
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
