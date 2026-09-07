import * as fc from 'fast-check';
import type { ReplayEventDto, ReplayParticipantDto } from '@cardquorum/shared';
import { legalPlays, SheepsheadPlugin } from '@cardquorum/sheepshead';
import type { SheepsheadConfig, SheepsheadEvent, SheepsheadState } from '@cardquorum/sheepshead';
import { ReplayEngineService } from './replay-engine.service';

const { createInitialState, applyEvent, getValidActions, isGameOver } = SheepsheadPlugin;

function makeConfig(): SheepsheadConfig {
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
  };
}

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
      (event as any).dealPayload = sideEffects['dealPayload'];
    } else {
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
      const FAIL_ACES: Array<'ac' | 'as' | 'ah'> = ['ac', 'as', 'ah'];
      const callableAce = FAIL_ACES.find(
        (a) => !pickerHand.some((c) => c.name === a) && !buried.some((c) => c.name === a),
      );
      const card = callableAce ?? 'alone';
      return { type: 'call_ace', userID: actingPlayer, payload: { card } };
    }
    case 'play_card': {
      const { cards } = legalPlays(state, config, actingPlayer);
      if (cards.length === 0) return null;
      const cardIdx = pickIndex(rng(), cards.length);
      return {
        type: 'play_card',
        userID: actingPlayer,
        payload: { card: cards[cardIdx] },
      } as SheepsheadEvent;
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
 * Generate a valid event sequence for a Sheepshead game.
 * Returns events with their payloads enriched with sideEffects for deterministic replay.
 */
function generateValidEventSequence(
  config: SheepsheadConfig,
  userIDs: number[],
  rng: () => number,
  maxSteps: number,
): SheepsheadEvent[] {
  const events: SheepsheadEvent[] = [];
  let state = createInitialState(config, userIDs);

  for (let i = 0; i < maxSteps; i++) {
    if (isGameOver(state)) break;

    // Check for scheduled events (trick_advance, game_scored)
    const scheduled = (state as any).scheduledEvents;
    if (scheduled && scheduled.length > 0) {
      const scheduledEvent = JSON.parse(JSON.stringify(scheduled[0].event)) as SheepsheadEvent;
      state = applyAndCapture(config, state, scheduledEvent);
      events.push(scheduledEvent);
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
 * Convert a SheepsheadEvent to a ReplayEventDto.
 */
function toReplayEventDto(event: SheepsheadEvent, seq: number): ReplayEventDto {
  return {
    eventType: event.type,
    userId: 'userID' in event ? (event.userID as number) : null,
    payload: 'payload' in event ? event.payload : null,
    message: `Event ${seq}`,
    seq,
    createdAt: new Date().toISOString(),
  };
}

describe('Error halts replay at failing index', () => {
  const config = makeConfig();
  const userIDs = [1, 2, 3];
  const participants: ReplayParticipantDto[] = userIDs.map((id, i) => ({
    userId: id,
    seatIndex: i,
    displayName: `Player ${id}`,
    username: `player${id}`,
  }));

  it('replay halts at position K when applyEvent throws at event index K', () => {
    fc.assert(
      fc.property(
        fc.infiniteStream(fc.double({ min: 0, max: 1, noNaN: true })),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (rngStream, kSelector) => {
          const rngIterator = rngStream[Symbol.iterator]();
          const rng = () => rngIterator.next().value;

          // Generate a valid event sequence with at least 3 events
          const validEvents = generateValidEventSequence(config, userIDs, rng, 100);
          if (validEvents.length < 3) return; // Need enough events to inject a failure

          // Choose a random index K to inject the failing event
          const K = pickIndex(kSelector, validEvents.length);

          // Convert valid events to ReplayEventDtos
          const replayEvents: ReplayEventDto[] = validEvents.map((e, i) =>
            toReplayEventDto(e, i + 1),
          );

          // Replace event at index K with an invalid event that will cause applyEvent to throw.
          // Using 're_crack' when no crack exists guarantees a throw.
          replayEvents[K] = {
            eventType: 're_crack',
            userId: userIDs[0],
            payload: null,
            message: `Corrupted event at index ${K}`,
            seq: K + 1,
            createdAt: new Date().toISOString(),
          };

          // Initialize the replay engine
          const engine = new ReplayEngineService();
          engine.initialize('sheepshead', config, participants, replayEvents, userIDs[0]);

          // Navigate to a position past K (try to go to end)
          engine.goToPosition(validEvents.length);

          // Verify: error is set with eventIndex === K
          const error = engine.error();
          expect(error).not.toBeNull();
          expect(error!.eventIndex).toBe(K);

          // Verify: currentPosition halted at K
          expect(engine.currentPosition()).toBe(K);

          // Verify: error message contains useful information
          expect(error!.message).toBeTruthy();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('events beyond the failing index K are never applied', () => {
    fc.assert(
      fc.property(
        fc.infiniteStream(fc.double({ min: 0, max: 1, noNaN: true })),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (rngStream, kSelector) => {
          const rngIterator = rngStream[Symbol.iterator]();
          const rng = () => rngIterator.next().value;

          // Generate a valid event sequence
          const validEvents = generateValidEventSequence(config, userIDs, rng, 100);
          if (validEvents.length < 3) return;

          // Choose a random index K (not the last event, so there are events after K)
          const K = pickIndex(kSelector, validEvents.length - 1);

          // Convert to ReplayEventDtos
          const replayEvents: ReplayEventDto[] = validEvents.map((e, i) =>
            toReplayEventDto(e, i + 1),
          );

          // Replace event at index K with an invalid event
          replayEvents[K] = {
            eventType: 're_crack',
            userId: userIDs[0],
            payload: null,
            message: `Corrupted event at index ${K}`,
            seq: K + 1,
            createdAt: new Date().toISOString(),
          };

          // Spy on the plugin's applyEvent to count calls
          const applyEventSpy = jest.spyOn(SheepsheadPlugin, 'applyEvent');

          const engine = new ReplayEngineService();
          engine.initialize('sheepshead', config, participants, replayEvents, userIDs[0]);

          applyEventSpy.mockClear();

          // Navigate to a position well past K
          engine.goToPosition(validEvents.length);

          // applyEvent should have been called exactly K+1 times:
          // events 0..K-1 succeed (K calls), then event K throws (1 call)
          expect(applyEventSpy).toHaveBeenCalledTimes(K + 1);

          applyEventSpy.mockRestore();
        },
      ),
      { numRuns: 100 },
    );
  });
});
