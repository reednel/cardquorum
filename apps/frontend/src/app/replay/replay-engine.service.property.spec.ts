import * as fc from 'fast-check';
import type { ReplayEventDto, ReplayParticipantDto } from '@cardquorum/shared';
import {
  legalPlays,
  SheepsheadPlugin,
  type CalledCard,
  type SheepsheadConfig,
  type SheepsheadEvent,
  type SheepsheadState,
} from '@cardquorum/sheepshead';
import { ReplayEngineService } from './replay-engine.service';

const { createInitialState, applyEvent, getValidActions, isGameOver, getPlayerView } =
  SheepsheadPlugin;

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
    if ((result.sideEffects as Record<string, unknown>)['dealPayload']) {
      (event as Record<string, unknown>)['dealPayload'] = (
        result.sideEffects as Record<string, unknown>
      )['dealPayload'];
    } else {
      (event as Record<string, unknown>)['payload'] = result.sideEffects;
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
 * Play a random valid game, collecting events with sideEffects captured as payload.
 * Returns the enriched events that can be replayed deterministically.
 */
function playRandomGame(
  config: SheepsheadConfig,
  userIDs: number[],
  rng: () => number,
): SheepsheadEvent[] {
  const events: SheepsheadEvent[] = [];
  let state = createInitialState(config, userIDs);
  const MAX_EVENTS = 200;

  for (let i = 0; i < MAX_EVENTS; i++) {
    if (isGameOver(state)) break;

    // Check for scheduled events
    const stateWithScheduled = state as SheepsheadState & {
      scheduledEvents?: { event: { type: string }; delayMs: number }[];
    };
    if (stateWithScheduled.scheduledEvents && stateWithScheduled.scheduledEvents.length > 0) {
      const scheduledEvent = stateWithScheduled.scheduledEvents[0].event as SheepsheadEvent;
      const eventCopy = JSON.parse(JSON.stringify(scheduledEvent));
      state = applyAndCapture(config, state, eventCopy);
      events.push(eventCopy);
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

        state = applyAndCapture(config, state, event);
        events.push(event);
        advanced = true;
        break;
      }
    }

    if (!advanced) break;
  }

  return events;
}

/**
 * Convert a SheepsheadEvent (with captured sideEffects as payload) to a ReplayEventDto.
 * This simulates what the backend stores and the replay API returns.
 */
function toReplayEventDto(event: SheepsheadEvent, seq: number): ReplayEventDto {
  return {
    eventType: event.type,
    userId: event.userID ?? null,
    payload: (event as Record<string, unknown>)['payload'] ?? null,
    message: null,
    seq,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Build participants in seatIndex order from userIDs.
 */
function buildParticipants(userIDs: number[]): ReplayParticipantDto[] {
  return userIDs.map((userId, idx) => ({
    userId,
    seatIndex: idx,
    displayName: `Player ${userId}`,
    username: `player${userId}`,
  }));
}

describe('Replay reconstruction correctness', () => {
  it('goToPosition(N) produces the same playerView as manual createInitialState → applyEvent^N → getPlayerView', () => {
    const config = makeConfig();
    const userIDs = [1, 2, 3];
    const participants = buildParticipants(userIDs);

    fc.assert(
      fc.property(
        fc.infiniteStream(fc.double({ min: 0, max: 1, noNaN: true })),
        fc.integer({ min: 0, max: 2 }),
        (rngStream, viewerIdx) => {
          const rngIterator = rngStream[Symbol.iterator]();
          const rng = () => rngIterator.next().value;

          // Play a random game, collecting events with sideEffects captured
          const gameEvents = playRandomGame(config, userIDs, rng);
          if (gameEvents.length === 0) return;

          // Convert to ReplayEventDto format (no synthetic events in this sequence)
          const replayEvents: ReplayEventDto[] = gameEvents.map((e, i) => toReplayEventDto(e, i));

          // Pick a random target position
          const targetPosition = pickIndex(rng(), gameEvents.length + 1); // 0..M inclusive
          const viewerUserId = userIDs[viewerIdx];

          // --- Engine path: use ReplayEngineService ---
          const engine = new ReplayEngineService();
          engine.initialize('sheepshead', config, participants, replayEvents, viewerUserId);
          engine.goToPosition(targetPosition);
          const enginePlayerView = engine.playerView();

          // --- Manual path: createInitialState → applyEvent^N → getPlayerView ---
          let state = createInitialState(config, userIDs);
          for (let i = 0; i < targetPosition; i++) {
            const event = gameEvents[i];
            const eventCopy = JSON.parse(JSON.stringify(event));
            const result = applyEvent(config, state, eventCopy);
            state = result.state;
          }
          const expectedPlayerView = getPlayerView(config, state, viewerUserId);

          // Both paths should produce the same player view
          expect(enginePlayerView).toEqual(expectedPlayerView);
        },
      ),
      { numRuns: 100 },
    );
  });
});
