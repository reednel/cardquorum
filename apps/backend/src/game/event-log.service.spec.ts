import * as fc from 'fast-check';
import { EventBufferEntry, EventLogService } from './event-log.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createService(): EventLogService {
  const mockGameEventRepo = {
    batchInsert: jest.fn().mockResolvedValue(undefined),
    findByRoomId: jest.fn().mockResolvedValue([]),
    findBySessionId: jest.fn().mockResolvedValue([]),
  } as any;

  const mockGameParticipantRepo = {
    batchInsert: jest.fn().mockResolvedValue(undefined),
    findByUserId: jest.fn().mockResolvedValue([]),
    findBySessionId: jest.fn().mockResolvedValue([]),
  } as any;

  return new EventLogService(mockGameEventRepo, mockGameParticipantRepo);
}

// Arbitrary for generating a GameEventBase-compatible event
const gameEventArb = fc.record({
  type: fc.stringMatching(/^[a-z_]{1,20}$/),
  userID: fc.option(fc.integer({ min: 1, max: 100_000 }), { nil: undefined }),
  payload: fc.option(fc.dictionary(fc.string({ minLength: 1, maxLength: 5 }), fc.integer()), {
    nil: undefined,
  }),
});

describe('Event buffer maintains sequential ordering', () => {
  it('for any sequence of N events, the buffer contains exactly N entries with seq [1..N]', () => {
    const service = createService();

    fc.assert(
      fc.property(
        fc.array(gameEventArb, { minLength: 1, maxLength: 50 }),
        fc.integer({ min: 1, max: 1000 }), // roomId
        fc.integer({ min: 1, max: 10000 }), // sessionId
        (events, roomId, sessionId) => {
          const buffer: EventBufferEntry[] = [];

          for (const event of events) {
            service.bufferEvent(buffer, event, `msg-${event.type}`, roomId, sessionId);
          }

          // Buffer has exactly N entries
          expect(buffer.length).toBe(events.length);

          // Seq values form [1, 2, 3, ..., N] in insertion order
          const seqValues = buffer.map((entry) => entry.seq);
          const expected = events.map((_, i) => i + 1);
          expect(seqValues).toEqual(expected);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('an empty event sequence produces an empty buffer', () => {
    const service = createService();

    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1000 }),
        fc.integer({ min: 1, max: 10000 }),
        (roomId, sessionId) => {
          const buffer: EventBufferEntry[] = [];
          // No events applied
          expect(buffer.length).toBe(0);

          // Adding one event starts at seq 1
          service.bufferEvent(buffer, { type: 'test' }, null, roomId, sessionId);
          expect(buffer[0].seq).toBe(1);
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('Buffered message equals the provided message value', () => {
  it('the message field in each buffer entry equals the message passed to bufferEvent', () => {
    const service = createService();

    fc.assert(
      fc.property(
        fc.array(
          fc.tuple(
            gameEventArb,
            fc.option(fc.string({ minLength: 1, maxLength: 200 }), { nil: null }),
          ),
          { minLength: 1, maxLength: 30 },
        ),
        fc.integer({ min: 1, max: 1000 }), // roomId
        fc.integer({ min: 1, max: 10000 }), // sessionId
        (eventMessagePairs, roomId, sessionId) => {
          const buffer: EventBufferEntry[] = [];

          for (const [event, message] of eventMessagePairs) {
            service.bufferEvent(buffer, event, message, roomId, sessionId);
          }

          // Each buffer entry's message matches what was passed in
          for (let i = 0; i < eventMessagePairs.length; i++) {
            const [, expectedMessage] = eventMessagePairs[i];
            expect(buffer[i].message).toBe(expectedMessage);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('null messages are stored as null in the buffer', () => {
    const service = createService();

    fc.assert(
      fc.property(
        gameEventArb,
        fc.integer({ min: 1, max: 1000 }),
        fc.integer({ min: 1, max: 10000 }),
        (event, roomId, sessionId) => {
          const buffer: EventBufferEntry[] = [];
          service.bufferEvent(buffer, event, null, roomId, sessionId);
          expect(buffer[0].message).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('Catch-up payload contains only visible entries ordered by seq', () => {
  it('getCatchUpEntries returns only non-null message entries, ordered by ascending seq', () => {
    const service = createService();

    fc.assert(
      fc.property(
        fc.array(
          fc.tuple(
            gameEventArb,
            fc.option(fc.string({ minLength: 1, maxLength: 200 }), { nil: null }),
          ),
          { minLength: 0, maxLength: 40 },
        ),
        fc.integer({ min: 1, max: 1000 }), // roomId
        fc.integer({ min: 1, max: 10000 }), // sessionId
        (eventMessagePairs, roomId, sessionId) => {
          const buffer: EventBufferEntry[] = [];

          for (const [event, message] of eventMessagePairs) {
            service.bufferEvent(buffer, event, message, roomId, sessionId);
          }

          const catchUp = service.getCatchUpEntries(buffer);

          // Only entries with non-null messages are included
          const expectedCount = eventMessagePairs.filter(([, msg]) => msg !== null).length;
          expect(catchUp.length).toBe(expectedCount);

          // All entries have non-null message
          for (const entry of catchUp) {
            expect(entry.message).not.toBeNull();
            expect(typeof entry.message).toBe('string');
          }

          // Entries are ordered by ascending seq (which corresponds to insertion order)
          for (let i = 1; i < catchUp.length; i++) {
            // Since catch-up entries come from a sequentially ordered buffer,
            // their position in the result should maintain ascending order
            // We verify this by checking the entries match the filtered buffer order
          }

          // Each entry includes the required fields
          for (const entry of catchUp) {
            expect(entry).toHaveProperty('sessionId');
            expect(entry).toHaveProperty('userId');
            expect(entry).toHaveProperty('eventType');
            expect(entry).toHaveProperty('message');
            expect(entry).toHaveProperty('timestamp');
            expect(entry.sessionId).toBe(sessionId);
          }

          // Verify ordering: catch-up entries should appear in the same order
          // as they appear in the buffer (ascending seq)
          const nonNullBufferEntries = buffer.filter((e) => e.message !== null);
          for (let i = 0; i < catchUp.length; i++) {
            expect(catchUp[i].eventType).toBe(nonNullBufferEntries[i].eventType);
            expect(catchUp[i].userId).toBe(nonNullBufferEntries[i].userId);
            expect(catchUp[i].timestamp).toBe(nonNullBufferEntries[i].createdAt.toISOString());
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('returns empty array when all events have null messages', () => {
    const service = createService();

    fc.assert(
      fc.property(
        fc.array(gameEventArb, { minLength: 1, maxLength: 20 }),
        fc.integer({ min: 1, max: 1000 }),
        fc.integer({ min: 1, max: 10000 }),
        (events, roomId, sessionId) => {
          const buffer: EventBufferEntry[] = [];

          for (const event of events) {
            service.bufferEvent(buffer, event, null, roomId, sessionId);
          }

          const catchUp = service.getCatchUpEntries(buffer);
          expect(catchUp).toEqual([]);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('returns all entries when all events have non-null messages', () => {
    const service = createService();

    fc.assert(
      fc.property(
        fc.array(fc.tuple(gameEventArb, fc.string({ minLength: 1, maxLength: 100 })), {
          minLength: 1,
          maxLength: 20,
        }),
        fc.integer({ min: 1, max: 1000 }),
        fc.integer({ min: 1, max: 10000 }),
        (eventMessagePairs, roomId, sessionId) => {
          const buffer: EventBufferEntry[] = [];

          for (const [event, message] of eventMessagePairs) {
            service.bufferEvent(buffer, event, message, roomId, sessionId);
          }

          const catchUp = service.getCatchUpEntries(buffer);
          expect(catchUp.length).toBe(eventMessagePairs.length);
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('Synthetic termination event seq follows last real event', () => {
  const terminationTypes = ['game_finished', 'game_abandoned', 'game_cancelled'] as const;

  it('after N real events, synthetic termination event has seq = N + 1', () => {
    const service = createService();

    fc.assert(
      fc.property(
        fc.array(gameEventArb, { minLength: 1, maxLength: 50 }),
        fc.constantFrom(...terminationTypes),
        fc.integer({ min: 1, max: 1000 }),
        fc.integer({ min: 1, max: 10000 }),
        (realEvents, terminationType, roomId, sessionId) => {
          const buffer: EventBufferEntry[] = [];

          // Buffer N real events
          for (const event of realEvents) {
            service.bufferEvent(buffer, event, `msg-${event.type}`, roomId, sessionId);
          }

          const N = realEvents.length;

          // Buffer synthetic termination event
          service.bufferEvent(
            buffer,
            { type: terminationType },
            `Game ${terminationType.replace('game_', '')}`,
            roomId,
            sessionId,
          );

          // Synthetic event should have seq = N + 1
          const syntheticEntry = buffer[buffer.length - 1];
          expect(syntheticEntry.eventType).toBe(terminationType);
          expect(syntheticEntry.seq).toBe(N + 1);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('with game_started as first event, after N real events, synthetic termination has seq = N + 2', () => {
    const service = createService();

    fc.assert(
      fc.property(
        fc.array(gameEventArb, { minLength: 1, maxLength: 50 }),
        fc.constantFrom(...terminationTypes),
        fc.integer({ min: 1, max: 1000 }),
        fc.integer({ min: 1, max: 10000 }),
        (realEvents, terminationType, roomId, sessionId) => {
          const buffer: EventBufferEntry[] = [];

          // Buffer game_started as seq 1
          service.bufferEvent(buffer, { type: 'game_started' }, 'Game started', roomId, sessionId);

          // Buffer N real gameplay events
          for (const event of realEvents) {
            service.bufferEvent(buffer, event, `msg-${event.type}`, roomId, sessionId);
          }

          const N = realEvents.length;

          // Buffer synthetic termination event
          service.bufferEvent(
            buffer,
            { type: terminationType },
            `Game ${terminationType.replace('game_', '')}`,
            roomId,
            sessionId,
          );

          // game_started is seq 1, N real events are seq 2..N+1, termination is seq N + 2
          const syntheticEntry = buffer[buffer.length - 1];
          expect(syntheticEntry.eventType).toBe(terminationType);
          expect(syntheticEntry.seq).toBe(N + 2);
        },
      ),
      { numRuns: 100 },
    );
  });
});
