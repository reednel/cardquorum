import * as fc from 'fast-check';
import { ChatMessagePayload, GameLogBroadcast } from '@cardquorum/shared';
import {
  deduplicateEntries,
  deriveFeedItems,
  entryKey,
  FeedMode,
  isBoundaryEntry,
  mergeFeedItems,
  prependHistory,
  SESSION_BOUNDARY_EVENTS,
} from './game-log-utils';

// --- Custom Arbitraries ---

const isoDateArb = fc
  .integer({ min: 946684800000, max: 1924991999000 }) // 2000-01-01 to 2030-12-31 in ms
  .map((ms) => new Date(ms).toISOString());

const chatMessageArb: fc.Arbitrary<ChatMessagePayload> = fc.record({
  id: fc.integer({ min: 1, max: 100000 }),
  roomId: fc.integer({ min: 1, max: 1000 }),
  senderUserId: fc.integer({ min: 1, max: 10000 }),
  senderDisplayName: fc.string({ minLength: 1, maxLength: 20 }),
  content: fc.string({ minLength: 1, maxLength: 100 }),
  sentAt: isoDateArb,
});

const gameLogBroadcastArb: fc.Arbitrary<GameLogBroadcast> = fc.record({
  sessionId: fc.integer({ min: 1, max: 100000 }),
  userId: fc.oneof(fc.constant(null), fc.integer({ min: 1, max: 10000 })),
  eventType: fc.string({ minLength: 1, maxLength: 30 }),
  message: fc.string({ minLength: 1, maxLength: 100 }),
  timestamp: isoDateArb,
});

const feedModeArb: fc.Arbitrary<FeedMode> = fc.constantFrom('chat', 'game-log', 'all');

// --- Property Tests ---

describe('Feed mode filtering returns only matching item types', () => {
  it('chat mode returns only chat content items', () => {
    fc.assert(
      fc.property(
        fc.array(chatMessageArb, { minLength: 0, maxLength: 10 }),
        fc.array(gameLogBroadcastArb, { minLength: 0, maxLength: 10 }),
        (chatMessages, logEntries) => {
          const items = deriveFeedItems('chat', chatMessages, logEntries);
          const contentItems = items.filter((item) => item.type !== 'date-divider');
          expect(contentItems.every((item) => item.type === 'chat')).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('game-log mode returns only game-log content items', () => {
    fc.assert(
      fc.property(
        fc.array(chatMessageArb, { minLength: 0, maxLength: 10 }),
        fc.array(gameLogBroadcastArb, { minLength: 0, maxLength: 10 }),
        (chatMessages, logEntries) => {
          const items = deriveFeedItems('game-log', chatMessages, logEntries);
          const contentItems = items.filter((item) => item.type !== 'date-divider');
          expect(contentItems.every((item) => item.type === 'game-log')).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('all mode returns content items from both chat and game-log sources', () => {
    fc.assert(
      fc.property(
        fc.array(chatMessageArb, { minLength: 0, maxLength: 10 }),
        fc.array(gameLogBroadcastArb, { minLength: 0, maxLength: 10 }),
        (chatMessages, logEntries) => {
          const items = deriveFeedItems('all', chatMessages, logEntries);
          const contentItems = items.filter((item) => item.type !== 'date-divider');
          const chatCount = contentItems.filter((item) => item.type === 'chat').length;
          const logCount = contentItems.filter((item) => item.type === 'game-log').length;
          expect(chatCount).toBe(chatMessages.length);
          expect(logCount).toBe(logEntries.length);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('chat mode content count matches input chat messages count', () => {
    fc.assert(
      fc.property(
        fc.array(chatMessageArb, { minLength: 0, maxLength: 10 }),
        fc.array(gameLogBroadcastArb, { minLength: 0, maxLength: 10 }),
        (chatMessages, logEntries) => {
          const items = deriveFeedItems('chat', chatMessages, logEntries);
          const contentItems = items.filter((item) => item.type !== 'date-divider');
          expect(contentItems.length).toBe(chatMessages.length);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('game-log mode content count matches input log entries count', () => {
    fc.assert(
      fc.property(
        fc.array(chatMessageArb, { minLength: 0, maxLength: 10 }),
        fc.array(gameLogBroadcastArb, { minLength: 0, maxLength: 10 }),
        (chatMessages, logEntries) => {
          const items = deriveFeedItems('game-log', chatMessages, logEntries);
          const contentItems = items.filter((item) => item.type !== 'date-divider');
          expect(contentItems.length).toBe(logEntries.length);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('for any mode, every returned item has a valid type', () => {
    fc.assert(
      fc.property(
        feedModeArb,
        fc.array(chatMessageArb, { minLength: 0, maxLength: 10 }),
        fc.array(gameLogBroadcastArb, { minLength: 0, maxLength: 10 }),
        (mode, chatMessages, logEntries) => {
          const items = deriveFeedItems(mode, chatMessages, logEntries);
          expect(
            items.every(
              (item) =>
                item.type === 'chat' || item.type === 'game-log' || item.type === 'date-divider',
            ),
          ).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('All-mode feed is chronologically ordered', () => {
  it('mergeFeedItems returns items sorted by timestamp in ascending order', () => {
    fc.assert(
      fc.property(
        fc.array(chatMessageArb, { minLength: 0, maxLength: 10 }),
        fc.array(gameLogBroadcastArb, { minLength: 0, maxLength: 10 }),
        (chatMessages, logEntries) => {
          const items = mergeFeedItems(chatMessages, logEntries);
          for (let i = 0; i < items.length - 1; i++) {
            const current = new Date(items[i].timestamp).getTime();
            const next = new Date(items[i + 1].timestamp).getTime();
            expect(current).toBeLessThanOrEqual(next);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('deriveFeedItems in all mode returns items sorted by timestamp in ascending order', () => {
    fc.assert(
      fc.property(
        fc.array(chatMessageArb, { minLength: 0, maxLength: 10 }),
        fc.array(gameLogBroadcastArb, { minLength: 0, maxLength: 10 }),
        (chatMessages, logEntries) => {
          const items = deriveFeedItems('all', chatMessages, logEntries);
          for (let i = 0; i < items.length - 1; i++) {
            const current = new Date(items[i].timestamp).getTime();
            const next = new Date(items[i + 1].timestamp).getTime();
            expect(current).toBeLessThanOrEqual(next);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('Boundary entry classification', () => {
  const boundaryEventArb = fc.constantFrom('game_started', 'game_finished', 'game_abandoned');

  const nonBoundaryGameLogBroadcastArb: fc.Arbitrary<GameLogBroadcast> = gameLogBroadcastArb.filter(
    (entry) =>
      !SESSION_BOUNDARY_EVENTS.includes(
        entry.eventType as (typeof SESSION_BOUNDARY_EVENTS)[number],
      ),
  );

  it('entries with eventType in SESSION_BOUNDARY_EVENTS are classified as boundary entries', () => {
    fc.assert(
      fc.property(
        gameLogBroadcastArb.chain((entry) =>
          boundaryEventArb.map((eventType) => ({ ...entry, eventType })),
        ),
        (entry) => {
          expect(isBoundaryEntry(entry)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('entries with eventType NOT in SESSION_BOUNDARY_EVENTS are not classified as boundary entries', () => {
    fc.assert(
      fc.property(nonBoundaryGameLogBroadcastArb, (entry) => {
        expect(isBoundaryEntry(entry)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('isBoundaryEntry returns true if and only if eventType is one of the three boundary events', () => {
    fc.assert(
      fc.property(gameLogBroadcastArb, (entry) => {
        const expected =
          entry.eventType === 'game_started' ||
          entry.eventType === 'game_finished' ||
          entry.eventType === 'game_abandoned';
        expect(isBoundaryEntry(entry)).toBe(expected);
      }),
      { numRuns: 100 },
    );
  });
});

describe('Catch-up deduplication produces no duplicates', () => {
  it('after deduplication, no two entries share the same composite key', () => {
    fc.assert(
      fc.property(
        fc.array(gameLogBroadcastArb, { minLength: 1, maxLength: 10 }),
        fc.array(gameLogBroadcastArb, { minLength: 0, maxLength: 10 }),
        (existing, catchup) => {
          const result = deduplicateEntries(existing, catchup);
          const keys = result.map(entryKey);
          const uniqueKeys = new Set(keys);
          expect(keys.length).toBe(uniqueKeys.size);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('all entries from existing are preserved in the result', () => {
    fc.assert(
      fc.property(
        fc.array(gameLogBroadcastArb, { minLength: 1, maxLength: 10 }),
        fc.array(gameLogBroadcastArb, { minLength: 0, maxLength: 10 }),
        (existing, catchup) => {
          const result = deduplicateEntries(existing, catchup);
          const resultKeys = new Set(result.map(entryKey));
          for (const entry of existing) {
            expect(resultKeys.has(entryKey(entry))).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('new entries from catchup that do not overlap are added to the result', () => {
    fc.assert(
      fc.property(
        fc.array(gameLogBroadcastArb, { minLength: 1, maxLength: 10 }),
        fc.array(gameLogBroadcastArb, { minLength: 1, maxLength: 10 }),
        (existing, catchup) => {
          const existingKeys = new Set(existing.map(entryKey));
          const nonOverlapping = catchup.filter((e) => !existingKeys.has(entryKey(e)));
          const result = deduplicateEntries(existing, catchup);
          const resultKeys = new Set(result.map(entryKey));
          for (const entry of nonOverlapping) {
            expect(resultKeys.has(entryKey(entry))).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('result length is at most existing.length + catchup.length and less when there are overlaps', () => {
    fc.assert(
      fc.property(
        fc
          .array(gameLogBroadcastArb, { minLength: 1, maxLength: 10 })
          .chain((existing) =>
            fc.tuple(
              fc.constant(existing),
              fc.array(gameLogBroadcastArb, { minLength: 0, maxLength: 5 }),
              fc.subarray(existing, { minLength: 1 }),
            ),
          ),
        ([existing, freshCatchup, overlapping]) => {
          const catchup = [...freshCatchup, ...overlapping];
          const result = deduplicateEntries(existing, catchup);
          // Result length is at most existing + catchup
          expect(result.length).toBeLessThanOrEqual(existing.length + catchup.length);
          // Since overlapping entries exist, result should be strictly less than the sum
          // (unless freshCatchup also has duplicates with existing)
          const existingKeys = new Set(existing.map(entryKey));
          const actualOverlapCount = catchup.filter((e) => existingKeys.has(entryKey(e))).length;
          if (actualOverlapCount > 0) {
            expect(result.length).toBeLessThan(existing.length + catchup.length);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('History prepend maintains chronological order', () => {
  // Generate entries with timestamps in a specific range, then sort by timestamp
  const earlyIsoDateArb = fc
    .integer({ min: 946684800000, max: 1135814400000 }) // 2000-01-01 to 2006-01-01
    .map((ms) => new Date(ms).toISOString());

  const lateIsoDateArb = fc
    .integer({ min: 1135814400001, max: 1924991999000 }) // 2006-01-01 to 2030-12-31
    .map((ms) => new Date(ms).toISOString());

  const historyEntryArb: fc.Arbitrary<GameLogBroadcast> = fc.record({
    sessionId: fc.integer({ min: 1, max: 100000 }),
    userId: fc.oneof(fc.constant(null), fc.integer({ min: 1, max: 10000 })),
    eventType: fc.string({ minLength: 1, maxLength: 30 }),
    message: fc.string({ minLength: 1, maxLength: 100 }),
    timestamp: earlyIsoDateArb,
  });

  const existingEntryArb: fc.Arbitrary<GameLogBroadcast> = fc.record({
    sessionId: fc.integer({ min: 1, max: 100000 }),
    userId: fc.oneof(fc.constant(null), fc.integer({ min: 1, max: 10000 })),
    eventType: fc.string({ minLength: 1, maxLength: 30 }),
    message: fc.string({ minLength: 1, maxLength: 100 }),
    timestamp: lateIsoDateArb,
  });

  const sortByTimestamp = (entries: GameLogBroadcast[]) =>
    [...entries].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  it('history entries appear before existing entries in the result', () => {
    fc.assert(
      fc.property(
        fc.array(historyEntryArb, { minLength: 1, maxLength: 10 }),
        fc.array(existingEntryArb, { minLength: 1, maxLength: 10 }),
        (historyRaw, existingRaw) => {
          const history = sortByTimestamp(historyRaw);
          const existing = sortByTimestamp(existingRaw);
          const result = prependHistory(existing, history);

          // First history.length items should be the history entries
          const prependedPart = result.slice(0, history.length);
          const existingPart = result.slice(history.length);

          expect(prependedPart).toEqual(history);
          expect(existingPart).toEqual(existing);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('total length equals history.length + existing.length with no entries lost', () => {
    fc.assert(
      fc.property(
        fc.array(historyEntryArb, { minLength: 0, maxLength: 10 }),
        fc.array(existingEntryArb, { minLength: 0, maxLength: 10 }),
        (historyRaw, existingRaw) => {
          const history = sortByTimestamp(historyRaw);
          const existing = sortByTimestamp(existingRaw);
          const result = prependHistory(existing, history);

          expect(result.length).toBe(history.length + existing.length);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('when both inputs are sorted by timestamp, the result maintains chronological order', () => {
    fc.assert(
      fc.property(
        fc.array(historyEntryArb, { minLength: 0, maxLength: 10 }),
        fc.array(existingEntryArb, { minLength: 0, maxLength: 10 }),
        (historyRaw, existingRaw) => {
          const history = sortByTimestamp(historyRaw);
          const existing = sortByTimestamp(existingRaw);
          const result = prependHistory(existing, history);

          for (let i = 0; i < result.length - 1; i++) {
            const current = new Date(result[i].timestamp).getTime();
            const next = new Date(result[i + 1].timestamp).getTime();
            expect(current).toBeLessThanOrEqual(next);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('Entry append accumulation preserves order', () => {
  it('appending entries one at a time preserves their original order', () => {
    fc.assert(
      fc.property(fc.array(gameLogBroadcastArb, { minLength: 1, maxLength: 20 }), (entries) => {
        let accumulated: GameLogBroadcast[] = [];
        for (const entry of entries) {
          accumulated = [...accumulated, entry];
        }
        for (let i = 0; i < entries.length; i++) {
          expect(accumulated[i]).toEqual(entries[i]);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('no entries are lost during sequential append operations', () => {
    fc.assert(
      fc.property(fc.array(gameLogBroadcastArb, { minLength: 0, maxLength: 20 }), (entries) => {
        let accumulated: GameLogBroadcast[] = [];
        for (const entry of entries) {
          accumulated = [...accumulated, entry];
        }
        for (const entry of entries) {
          expect(accumulated).toContainEqual(entry);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('the final array length equals the number of appended entries', () => {
    fc.assert(
      fc.property(fc.array(gameLogBroadcastArb, { minLength: 0, maxLength: 20 }), (entries) => {
        let accumulated: GameLogBroadcast[] = [];
        for (const entry of entries) {
          accumulated = [...accumulated, entry];
        }
        expect(accumulated.length).toBe(entries.length);
      }),
      { numRuns: 100 },
    );
  });
});
