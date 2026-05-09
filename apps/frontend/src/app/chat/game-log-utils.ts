import { ChatMessagePayload, GameLogBroadcast } from '@cardquorum/shared';

export type FeedMode = 'chat' | 'game-log' | 'all';

export interface FeedItemEntry {
  type: 'chat' | 'game-log';
  timestamp: string;
  data: ChatMessagePayload | GameLogBroadcast;
}

export interface FeedItemDateDivider {
  type: 'date-divider';
  timestamp: string;
  label: string;
}

export type FeedItem = FeedItemEntry | FeedItemDateDivider;

export const SESSION_BOUNDARY_EVENTS = ['game_started', 'game_finished', 'game_abandoned'] as const;

export function isBoundaryEntry(entry: GameLogBroadcast): boolean {
  return SESSION_BOUNDARY_EVENTS.includes(
    entry.eventType as (typeof SESSION_BOUNDARY_EVENTS)[number],
  );
}

export function entryKey(entry: GameLogBroadcast): string {
  return `${entry.sessionId}:${entry.timestamp}:${entry.message}`;
}

export function deduplicateEntries(
  existing: GameLogBroadcast[],
  catchup: GameLogBroadcast[],
): GameLogBroadcast[] {
  const seen = new Set(existing.map(entryKey));
  const merged = [...existing];
  for (const entry of catchup) {
    const key = entryKey(entry);
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(entry);
    }
  }
  return merged;
}

export function prependHistory(
  existing: GameLogBroadcast[],
  history: GameLogBroadcast[],
): GameLogBroadcast[] {
  const seen = new Set(existing.map(entryKey));
  const unique = history.filter((entry) => !seen.has(entryKey(entry)));
  return [...unique, ...existing];
}

export function mergeFeedItems(
  chatMessages: ChatMessagePayload[],
  logEntries: GameLogBroadcast[],
): FeedItemEntry[] {
  const chatItems: FeedItemEntry[] = chatMessages.map((m) => ({
    type: 'chat' as const,
    timestamp: m.sentAt,
    data: m,
  }));
  const logItems: FeedItemEntry[] = logEntries.map((e) => ({
    type: 'game-log' as const,
    timestamp: e.timestamp,
    data: e,
  }));
  return [...chatItems, ...logItems].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );
}

export function deriveFeedItems(
  mode: FeedMode,
  chatMessages: ChatMessagePayload[],
  logEntries: GameLogBroadcast[],
): FeedItem[] {
  let items: FeedItemEntry[];
  if (mode === 'chat') {
    items = chatMessages.map((m) => ({
      type: 'chat' as const,
      timestamp: m.sentAt,
      data: m,
    }));
  } else if (mode === 'game-log') {
    items = logEntries.map((e) => ({
      type: 'game-log' as const,
      timestamp: e.timestamp,
      data: e,
    }));
  } else {
    items = mergeFeedItems(chatMessages, logEntries);
  }
  return insertDateDividers(items);
}

/** Format a date divider label: "Today", "Yesterday", or "Weekday, Month Day" / "Month Day, Year". */
export function dateDividerLabel(date: Date): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffMs = today.getTime() - target.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';

  const sameYear = date.getFullYear() === now.getFullYear();
  if (sameYear) {
    return date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  }
  return date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}

/** Insert date divider items between entries when the calendar date changes. */
export function insertDateDividers(items: FeedItemEntry[]): FeedItem[] {
  if (items.length === 0) return [];

  const result: FeedItem[] = [];
  let lastDateStr = '';

  for (const item of items) {
    const date = new Date(item.timestamp);
    const dateStr = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

    if (dateStr !== lastDateStr) {
      result.push({
        type: 'date-divider',
        timestamp: item.timestamp,
        label: dateDividerLabel(date),
      });
      lastDateStr = dateStr;
    }

    result.push(item);
  }

  return result;
}
