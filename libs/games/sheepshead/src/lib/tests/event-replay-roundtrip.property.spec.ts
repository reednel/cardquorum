import * as fc from 'fast-check';
import { SheepsheadPlugin } from '../sheepshead-plugin';
import { legalPlays } from '../tricks';
import { CalledCard, SheepsheadConfig, SheepsheadEvent, SheepsheadState } from '../types';

const { createInitialState, applyEvent, getValidActions, isGameOver } = SheepsheadPlugin;

/** Helper: apply event, capture sideEffects into event payload, return new state. */
function applyAndCapture(
  config: SheepsheadConfig,
  state: SheepsheadState,
  event: SheepsheadEvent,
): SheepsheadState {
  const result = applyEvent(config, state, event);
  // Simulate backend behavior: store sideEffects as the event payload
  if (result.sideEffects !== undefined) {
    if ((result.sideEffects as any).dealPayload) {
      // Redeal case: store dealPayload on the event for replay
      (event as any).dealPayload = (result.sideEffects as any).dealPayload;
    } else {
      // Deal case: store deal payload directly
      (event as any).payload = result.sideEffects;
    }
  }
  return result.state;
}

/** Helper: apply event during replay (just unwrap state). */
function applyReplay(
  config: SheepsheadConfig,
  state: SheepsheadState,
  event: SheepsheadEvent,
): SheepsheadState {
  return applyEvent(config, state, event).state;
}

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

/** Pick a random index from an array using a value in [0, 1). */
function pickIndex(rngValue: number, length: number): number {
  if (length === 0) return 0;
  return Math.min(Math.floor(rngValue * length), length - 1);
}

/**
 * Play a random valid game to completion, collecting all events.
 * Uses a PRNG-like approach by choosing random valid actions.
 */
function playRandomGame(
  config: SheepsheadConfig,
  userIDs: number[],
  rng: () => number,
): { events: SheepsheadEvent[]; finalState: SheepsheadState } {
  const events: SheepsheadEvent[] = [];
  let state = createInitialState(config, userIDs);

  const MAX_EVENTS = 200; // safety limit

  for (let i = 0; i < MAX_EVENTS; i++) {
    if (isGameOver(state)) break;

    // Check for scheduled events (trick_advance, game_scored)
    const stateWithScheduled = state as SheepsheadState & {
      scheduledEvents?: { event: { type: string }; delayMs: number }[];
    };
    if (stateWithScheduled.scheduledEvents && stateWithScheduled.scheduledEvents.length > 0) {
      const scheduledEvent = stateWithScheduled.scheduledEvents[0].event as SheepsheadEvent;
      // Deep clone the event so we can capture sideEffects into it
      const eventCopy = JSON.parse(JSON.stringify(scheduledEvent));
      state = applyAndCapture(config, state, eventCopy);
      events.push(eventCopy);
      continue;
    }

    // Find a player with valid actions
    let actingPlayer: number | null = null;
    let validActions: string[] = [];

    for (const uid of userIDs) {
      const actions = getValidActions(config, state, uid);
      if (actions.length > 0) {
        actingPlayer = uid;
        validActions = actions;
        break;
      }
    }

    if (actingPlayer === null || validActions.length === 0) break;

    // Choose a random action
    const actionIdx = pickIndex(rng(), validActions.length);
    const actionType = validActions[actionIdx];

    const event = buildEvent(actionType, actingPlayer, state, config, rng);
    if (!event) continue;

    state = applyAndCapture(config, state, event);
    events.push(event);
  }

  return { events, finalState: state };
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
 * Compare two states for equivalence, ignoring transient fields like scheduledEvents.
 */
function statesEquivalent(a: SheepsheadState, b: SheepsheadState): boolean {
  // Compare the key fields that define game state
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

describe('Event replay round-trip produces equivalent states', () => {
  it('replaying stored events from initial state produces the same final state', () => {
    const config = makeConfig();
    const userIDs = [1, 2, 3];

    fc.assert(
      fc.property(fc.infiniteStream(fc.double({ min: 0, max: 1, noNaN: true })), (rngStream) => {
        const rngIterator = rngStream[Symbol.iterator]();
        const rng = () => rngIterator.next().value;

        // Play a random game, collecting events (with enriched payloads)
        const { events, finalState } = playRandomGame(config, userIDs, rng);

        // Game must have completed for the test to be meaningful
        if (!isGameOver(finalState)) return; // skip incomplete games

        // Replay: start from initial state and apply all collected events
        let replayState = createInitialState(config, userIDs);
        for (const event of events) {
          // Deep clone the event to avoid mutation during replay
          const eventCopy = JSON.parse(JSON.stringify(event));
          replayState = applyReplay(config, replayState, eventCopy);
        }

        // Final states should be equivalent
        expect(statesEquivalent(finalState, replayState)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('replaying with deal payload produces deterministic results', () => {
    const config = makeConfig();
    const userIDs = [1, 2, 3];

    fc.assert(
      fc.property(fc.infiniteStream(fc.double({ min: 0, max: 1, noNaN: true })), (rngStream) => {
        const rngIterator = rngStream[Symbol.iterator]();
        const rng = () => rngIterator.next().value;

        // Play a game
        const { events, finalState } = playRandomGame(config, userIDs, rng);
        if (!isGameOver(finalState)) return;

        // Replay twice — both should produce the same result
        const replay = (evts: SheepsheadEvent[]) => {
          let state = createInitialState(config, userIDs);
          for (const event of evts) {
            const eventCopy = JSON.parse(JSON.stringify(event));
            state = applyReplay(config, state, eventCopy);
          }
          return state;
        };

        const replay1 = replay(events);
        const replay2 = replay(events);

        expect(statesEquivalent(replay1, replay2)).toBe(true);
      }),
      { numRuns: 50 },
    );
  });
});
