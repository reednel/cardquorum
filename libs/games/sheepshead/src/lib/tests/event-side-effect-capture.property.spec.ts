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

interface CapturedEvent {
  /** The event as originally sent by the client (before sideEffects enrichment). */
  originalEvent: SheepsheadEvent;
  /** The stored payload: sideEffects if returned, otherwise the client payload. */
  storedEvent: SheepsheadEvent;
  /** Whether applyEvent returned sideEffects for this event. */
  hadSideEffects: boolean;
}

/**
 * Play a random game forward, capturing both the original client event and the
 * stored event (with sideEffects applied) at each step.
 */
function playGameWithCapture(
  config: SheepsheadConfig,
  userIDs: number[],
  rng: () => number,
): { capturedEvents: CapturedEvent[]; finalState: SheepsheadState } {
  const capturedEvents: CapturedEvent[] = [];
  let state = createInitialState(config, userIDs);

  const MAX_EVENTS = 200;

  for (let i = 0; i < MAX_EVENTS; i++) {
    if (isGameOver(state)) break;

    // Check for scheduled events (trick_advance, game_scored)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const scheduled = (state as any).scheduledEvents;
    if (scheduled && scheduled.length > 0) {
      const scheduledEvent = JSON.parse(JSON.stringify(scheduled[0].event)) as SheepsheadEvent;
      const originalEvent = JSON.parse(JSON.stringify(scheduledEvent));

      const result = applyEvent(config, state, scheduledEvent);
      state = result.state;

      // Build the stored event (simulating backend behavior)
      const storedEvent = JSON.parse(JSON.stringify(scheduledEvent));
      const hadSideEffects = result.sideEffects !== undefined;
      if (hadSideEffects) {
        const sideEffects = result.sideEffects as Record<string, unknown>;
        if (sideEffects['dealPayload']) {
          (storedEvent as any).dealPayload = sideEffects['dealPayload'];
        } else {
          (storedEvent as any).payload = result.sideEffects;
        }
      }

      capturedEvents.push({ originalEvent, storedEvent, hadSideEffects });
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

        const originalEvent = JSON.parse(JSON.stringify(event));

        const result = applyEvent(config, state, event);
        state = result.state;

        // Build the stored event (simulating backend behavior)
        const storedEvent = JSON.parse(JSON.stringify(event));
        const hadSideEffects = result.sideEffects !== undefined;
        if (hadSideEffects) {
          const sideEffects = result.sideEffects as Record<string, unknown>;
          if (sideEffects['dealPayload']) {
            (storedEvent as any).dealPayload = sideEffects['dealPayload'];
          } else {
            (storedEvent as any).payload = result.sideEffects;
          }
        }

        capturedEvents.push({ originalEvent, storedEvent, hadSideEffects });
        advanced = true;
        break;
      }
    }

    if (!advanced) break;
  }

  return { capturedEvents, finalState: state };
}

/**
 * Compare two states for equivalence, ignoring transient fields like scheduledEvents.
 */
function statesEquivalent(a: SheepsheadState, b: SheepsheadState): boolean {
  const normalize = (s: SheepsheadState) => ({
    players: s.players.map((p) => ({
      userID: p.userID,
      role: p.role,
      hand: p.hand.map((c) => c.name).sort(),
      tricksWon: p.tricksWon,
      pointsWon: p.pointsWon,
      cardsWon: p.cardsWon.map((c) => c.name).sort(),
      scoreDelta: p.scoreDelta,
    })),
    phase: s.phase,
    trickNumber: s.trickNumber,
    activePlayer: s.activePlayer,
    blind: s.blind?.map((c) => c.name).sort() ?? null,
    buried: s.buried?.map((c) => c.name).sort() ?? null,
    calledCard: s.calledCard,
    hole: s.hole?.name ?? null,
    tricks: s.tricks.map((t) => ({
      plays: t.plays.map((p) => ({
        player: p.player,
        card: p.card.name,
        isHoleCard: p.isHoleCard,
      })),
      winner: t.winner,
    })),
    crack: s.crack,
    blitz: s.blitz,
    previousGameDouble: s.previousGameDouble,
    noPick: s.noPick,
    redeals:
      s.redeals?.map((r) => ({
        hands: r.hands.map((h) => ({ userID: h.userID, hand: h.hand.map((c) => c.name).sort() })),
        blind: r.blind.map((c) => c.name).sort(),
      })) ?? null,
  });

  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}

describe('Event side-effect capture and replay', () => {
  it('stored payload equals sideEffects when applyEvent returns sideEffects, and equals client payload otherwise', () => {
    const config = makeConfig();
    const userIDs = [1, 2, 3];

    fc.assert(
      fc.property(fc.infiniteStream(fc.double({ min: 0, max: 1, noNaN: true })), (rngStream) => {
        const rngIterator = rngStream[Symbol.iterator]();
        const rng = () => rngIterator.next().value;

        const { capturedEvents, finalState } = playGameWithCapture(config, userIDs, rng);

        // Must have at least one event to be meaningful
        if (capturedEvents.length === 0) return;
        // Must have completed for a full test
        if (!isGameOver(finalState)) return;

        // Verify: at least one event had sideEffects (deal events always do in live play)
        const eventsWithSideEffects = capturedEvents.filter((e) => e.hadSideEffects);
        expect(eventsWithSideEffects.length).toBeGreaterThan(0);

        for (const { originalEvent, storedEvent, hadSideEffects } of capturedEvents) {
          if (hadSideEffects) {
            // When sideEffects are returned, the stored event must differ from the original
            // (it has enriched payload/dealPayload from sideEffects)
            if (originalEvent.type === 'deal') {
              // Deal events: stored event should have payload with hands and blind
              expect((storedEvent as any).payload).toBeDefined();
              expect((storedEvent as any).payload.hands).toBeDefined();
              expect((storedEvent as any).payload.blind).toBeDefined();
              // Original deal event should NOT have had payload (live play sends bare deal)
              expect((originalEvent as any).payload).toBeUndefined();
            } else if (originalEvent.type === 'pick' || originalEvent.type === 'pass') {
              // Redeal case: stored event should have dealPayload
              expect((storedEvent as any).dealPayload).toBeDefined();
              expect((storedEvent as any).dealPayload.hands).toBeDefined();
              expect((storedEvent as any).dealPayload.blind).toBeDefined();
            }
          } else {
            // When no sideEffects: stored payload equals client-provided payload
            expect((storedEvent as any).payload).toEqual((originalEvent as any).payload);
            // And no dealPayload should be added
            expect((storedEvent as any).dealPayload).toEqual((originalEvent as any).dealPayload);
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  it('replaying with stored events (sideEffects as payload) produces the same final state as live execution', () => {
    const config = makeConfig();
    const userIDs = [1, 2, 3];

    fc.assert(
      fc.property(fc.infiniteStream(fc.double({ min: 0, max: 1, noNaN: true })), (rngStream) => {
        const rngIterator = rngStream[Symbol.iterator]();
        const rng = () => rngIterator.next().value;

        const { capturedEvents, finalState } = playGameWithCapture(config, userIDs, rng);

        // Must have completed for the test to be meaningful
        if (!isGameOver(finalState)) return;

        // Replay: start from initial state and apply all stored events
        let replayState = createInitialState(config, userIDs);
        for (const { storedEvent } of capturedEvents) {
          const eventCopy = JSON.parse(JSON.stringify(storedEvent));
          const result = applyEvent(config, replayState, eventCopy);
          replayState = result.state;
        }

        // Final states should be equivalent
        expect(statesEquivalent(finalState, replayState)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});
