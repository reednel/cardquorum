import * as fc from 'fast-check';
import { SheepsheadPlugin } from '../sheepshead-plugin';
import { legalPlays } from '../tricks';
import {
  type CalledCard,
  type SheepsheadConfig,
  type SheepsheadEvent,
  type SheepsheadState,
} from '../types';

const { createInitialState, applyEvent, getValidActions, isGameOver } = SheepsheadPlugin;

function makeConfig(overrides: Partial<SheepsheadConfig> = {}): SheepsheadConfig {
  return {
    name: 'jack-of-diamonds',
    playerCount: 3,
    handSize: 10,
    blindSize: 2,
    pickerRule: 'autonomous',
    partnerRule: 'jd',
    noPick: 'leaster',
    cracking: false,
    blitzing: false,
    doubleOnTheBump: false,
    partnerOffTheHook: false,
    noAceFaceTrump: false,
    multiplicityLimit: null,
    callOwnAce: null,
    cardsRemoved: [],
    ...overrides,
  };
}

const FAIL_ACES: CalledCard[] = ['ac', 'as', 'ah'];

function pickIndex(rngValue: number, length: number): number {
  if (length === 0) return 0;
  return Math.min(Math.floor(rngValue * length), length - 1);
}

/** Apply event and capture sideEffects into the event payload for replay determinism. */
function applyAndCapture(
  config: SheepsheadConfig,
  state: SheepsheadState,
  event: SheepsheadEvent,
): SheepsheadState {
  const result = applyEvent(config, state, event);
  if (result.sideEffects !== undefined) {
    const sideEffects = result.sideEffects as Record<string, unknown>;
    if (sideEffects['dealPayload']) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (event as any).dealPayload = sideEffects['dealPayload'];
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (event as any).payload = result.sideEffects;
    }
  }
  return result.state;
}

function buildEvent(
  actionType: string,
  actingPlayer: number,
  state: SheepsheadState,
  config: SheepsheadConfig,
  rng: () => number,
): SheepsheadEvent | null {
  switch (actionType) {
    case 'deal':
      return { type: 'deal', userID: actingPlayer };
    case 'pick':
      return { type: 'pick', userID: actingPlayer };
    case 'pass':
      return { type: 'pass', userID: actingPlayer };
    case 'bury': {
      const player = state.players.find((p) => p.userID === actingPlayer)!;
      const buryCount =
        config.partnerDraft === true ? Math.floor(config.blindSize / 2) : config.blindSize;
      const cards = player.hand.slice(0, buryCount);
      return { type: 'bury', userID: actingPlayer, payload: { cards } };
    }
    case 'call_ace': {
      const player = state.players.find((p) => p.userID === actingPlayer)!;
      const pickerHand = player.hand;
      const buried = state.buried ?? [];
      const callableAce = FAIL_ACES.find(
        (a) => !pickerHand.some((c) => c.name === a) && !buried.some((c) => c.name === a),
      );
      const card: CalledCard = callableAce ?? 'alone';
      return { type: 'call_ace', userID: actingPlayer, payload: { card } };
    }
    case 'play_card': {
      const { cards } = legalPlays(state, config, actingPlayer);
      if (cards.length === 0) return null;
      const cardIdx = pickIndex(rng(), cards.length);
      return { type: 'play_card', userID: actingPlayer, payload: { card: cards[cardIdx] } };
    }
    case 'crack':
      return { type: 'crack', userID: actingPlayer };
    case 're_crack':
      return { type: 're_crack', userID: actingPlayer };
    case 'blitz': {
      const player = state.players.find((p) => p.userID === actingPlayer)!;
      const hasBlackQueens =
        player.hand.some((c) => c.name === 'qc') && player.hand.some((c) => c.name === 'qs');
      const blitzType = hasBlackQueens ? 'black-blitz' : 'red-blitz';
      return { type: 'blitz', userID: actingPlayer, payload: { blitzType } };
    }
    default:
      return null;
  }
}

/**
 * Collect (state, event) pairs from a random game progression.
 * Each pair represents a valid state and the enriched event (with sideEffects captured)
 * that can be applied deterministically.
 */
function collectStateEventPairs(
  config: SheepsheadConfig,
  userIDs: number[],
  rng: () => number,
  maxSteps: number,
): { state: SheepsheadState; event: SheepsheadEvent }[] {
  const pairs: { state: SheepsheadState; event: SheepsheadEvent }[] = [];
  let state = createInitialState(config, userIDs);

  for (let i = 0; i < maxSteps; i++) {
    if (isGameOver(state)) break;

    // Check for scheduled events (trick_advance, game_scored)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const scheduled = (state as any).scheduledEvents;
    if (scheduled && scheduled.length > 0) {
      const scheduledEvent = JSON.parse(JSON.stringify(scheduled[0].event)) as SheepsheadEvent;
      const stateBefore = JSON.parse(JSON.stringify(state));
      state = applyAndCapture(config, state, scheduledEvent);
      pairs.push({ state: stateBefore, event: scheduledEvent });
      continue;
    }

    // Find a player with valid actions
    let advanced = false;
    for (const uid of userIDs) {
      const actions = getValidActions(config, state, uid);
      if (actions.length > 0) {
        const actionIdx = pickIndex(rng(), actions.length);
        const actionType = actions[actionIdx];
        const event = buildEvent(actionType, uid, state, config, rng);
        if (!event) continue;

        const stateBefore = JSON.parse(JSON.stringify(state));
        state = applyAndCapture(config, state, event);
        pairs.push({ state: stateBefore, event });
        advanced = true;
        break;
      }
    }

    if (!advanced) break;
  }

  return pairs;
}

describe('applyEvent purity (determinism and immutability)', () => {
  it('calling applyEvent twice with the same inputs produces identical output states', () => {
    const config = makeConfig();
    const userIDs = [1, 2, 3];

    fc.assert(
      fc.property(
        fc.infiniteStream(fc.double({ min: 0, max: 1, noNaN: true })),
        fc.integer({ min: 0, max: 50 }),
        (rngStream, stepOffset) => {
          const rngIterator = rngStream[Symbol.iterator]();
          const rng = () => rngIterator.next().value;

          // Play a random game and collect valid (state, event) pairs
          const pairs = collectStateEventPairs(config, userIDs, rng, 100);
          if (pairs.length === 0) return;

          // Pick a pair to test (use stepOffset to vary which pair we test)
          const idx = stepOffset % pairs.length;
          const { state, event } = pairs[idx];

          // Deep clone inputs so both calls get identical fresh copies
          const stateClone1 = JSON.parse(JSON.stringify(state));
          const eventClone1 = JSON.parse(JSON.stringify(event));
          const stateClone2 = JSON.parse(JSON.stringify(state));
          const eventClone2 = JSON.parse(JSON.stringify(event));

          const result1 = applyEvent(config, stateClone1, eventClone1);
          const result2 = applyEvent(config, stateClone2, eventClone2);

          // Both calls should produce identical state
          expect(result1.state).toEqual(result2.state);
          // Both calls should produce identical sideEffects (or both undefined)
          expect(result1.sideEffects).toEqual(result2.sideEffects);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('applyEvent does not mutate the original state object', () => {
    const config = makeConfig();
    const userIDs = [1, 2, 3];

    fc.assert(
      fc.property(
        fc.infiniteStream(fc.double({ min: 0, max: 1, noNaN: true })),
        fc.integer({ min: 0, max: 50 }),
        (rngStream, stepOffset) => {
          const rngIterator = rngStream[Symbol.iterator]();
          const rng = () => rngIterator.next().value;

          // Play a random game and collect valid (state, event) pairs
          const pairs = collectStateEventPairs(config, userIDs, rng, 100);
          if (pairs.length === 0) return;

          // Pick a pair to test
          const idx = stepOffset % pairs.length;
          const { state, event } = pairs[idx];

          // Deep clone the state before calling applyEvent
          const stateSnapshot = JSON.parse(JSON.stringify(state));
          const eventCopy = JSON.parse(JSON.stringify(event));

          // Call applyEvent
          applyEvent(config, state, eventCopy);

          // The original state must not have been mutated
          expect(state).toEqual(stateSnapshot);
        },
      ),
      { numRuns: 100 },
    );
  });
});
