import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { WS_EMIT, WS_EVENT, type GameLogBroadcast } from '@cardquorum/shared';
import { RoomContextService } from '../room/room-context.service';
import { WebSocketService } from '../websocket.service';
import { GameLogService } from './game-log.service';

describe('GameLogService', () => {
  let service: GameLogService;
  let handlers: Map<string, (data: unknown) => void>;
  let connectCallbacks: (() => void)[];
  let mockWs: {
    on: jest.Mock;
    send: jest.Mock;
    onConnect: jest.Mock;
    connected: ReturnType<typeof signal<boolean>>;
  };
  let roomIdSignal: ReturnType<typeof signal<number | null>>;
  let mockRoomContext: { currentRoomId: ReturnType<typeof signal<number | null>> };

  beforeEach(() => {
    handlers = new Map<string, (data: unknown) => void>();
    connectCallbacks = [];

    mockWs = {
      on: jest.fn((event: string, handler: (data: unknown) => void) => {
        handlers.set(event, handler);
        return jest.fn();
      }),
      send: jest.fn(),
      onConnect: jest.fn((cb: () => void) => {
        connectCallbacks.push(cb);
        return jest.fn();
      }),
      connected: signal(false),
    };

    roomIdSignal = signal<number | null>(1);
    mockRoomContext = {
      currentRoomId: roomIdSignal,
    };

    TestBed.configureTestingModule({
      providers: [
        GameLogService,
        { provide: WebSocketService, useValue: mockWs },
        { provide: RoomContextService, useValue: mockRoomContext },
      ],
    });

    service = TestBed.inject(GameLogService);
  });

  function makeEntry(overrides: Partial<GameLogBroadcast> = {}): GameLogBroadcast {
    return {
      sessionId: 1,
      userId: 10,
      eventType: 'card_played',
      message: 'Player played a card',
      timestamp: '2024-01-15T10:00:00.000Z',
      ...overrides,
    };
  }

  describe('WebSocket subscriptions on construction', () => {
    it('subscribes to game-log:entry event', () => {
      expect(mockWs.on).toHaveBeenCalledWith(WS_EMIT.GAME_LOG_ENTRY, expect.any(Function));
    });

    it('subscribes to game-log:catchup event', () => {
      expect(mockWs.on).toHaveBeenCalledWith(WS_EMIT.GAME_LOG_CATCHUP, expect.any(Function));
    });

    it('subscribes to game-log:history event', () => {
      expect(mockWs.on).toHaveBeenCalledWith(WS_EMIT.GAME_LOG_HISTORY, expect.any(Function));
    });

    it('registers an onConnect callback', () => {
      expect(mockWs.onConnect).toHaveBeenCalledWith(expect.any(Function));
    });
  });

  describe('appending entries on game-log:entry', () => {
    it('appends a valid entry to the entries signal', () => {
      const entry = makeEntry();
      handlers.get(WS_EMIT.GAME_LOG_ENTRY)!(entry);

      expect(service.entries()).toEqual([entry]);
    });

    it('appends multiple entries in order', () => {
      const entry1 = makeEntry({ message: 'First', timestamp: '2024-01-15T10:00:00.000Z' });
      const entry2 = makeEntry({ message: 'Second', timestamp: '2024-01-15T10:01:00.000Z' });

      handlers.get(WS_EMIT.GAME_LOG_ENTRY)!(entry1);
      handlers.get(WS_EMIT.GAME_LOG_ENTRY)!(entry2);

      expect(service.entries()).toEqual([entry1, entry2]);
    });

    it('ignores entries with null message', () => {
      const entry = makeEntry({ message: null as unknown as string });
      handlers.get(WS_EMIT.GAME_LOG_ENTRY)!(entry);

      expect(service.entries()).toEqual([]);
    });

    it('ignores entries with null timestamp', () => {
      const entry = makeEntry({ timestamp: null as unknown as string });
      handlers.get(WS_EMIT.GAME_LOG_ENTRY)!(entry);

      expect(service.entries()).toEqual([]);
    });
  });

  describe('deduplication on game-log:catchup', () => {
    it('merges catchup entries with existing entries', () => {
      const existing = makeEntry({ message: 'Existing' });
      handlers.get(WS_EMIT.GAME_LOG_ENTRY)!(existing);

      const catchup = [makeEntry({ message: 'New from catchup' })];
      handlers.get(WS_EMIT.GAME_LOG_CATCHUP)!({ entries: catchup });

      expect(service.entries().length).toBe(2);
      expect(service.entries()[0].message).toBe('Existing');
      expect(service.entries()[1].message).toBe('New from catchup');
    });

    it('does not duplicate entries with the same composite key', () => {
      const entry = makeEntry({
        sessionId: 5,
        message: 'Duplicate',
        timestamp: '2024-01-15T10:00:00.000Z',
      });
      handlers.get(WS_EMIT.GAME_LOG_ENTRY)!(entry);

      const catchup = [
        makeEntry({ sessionId: 5, message: 'Duplicate', timestamp: '2024-01-15T10:00:00.000Z' }),
      ];
      handlers.get(WS_EMIT.GAME_LOG_CATCHUP)!({ entries: catchup });

      expect(service.entries().length).toBe(1);
    });

    it('filters out catchup entries with null message', () => {
      const catchup = [
        makeEntry({ message: 'Valid' }),
        makeEntry({ message: null as unknown as string }),
      ];
      handlers.get(WS_EMIT.GAME_LOG_CATCHUP)!({ entries: catchup });

      expect(service.entries().length).toBe(1);
      expect(service.entries()[0].message).toBe('Valid');
    });
  });

  describe('prepending on game-log:history response', () => {
    it('prepends history entries before existing entries', () => {
      const existing = makeEntry({ message: 'Recent', timestamp: '2024-01-15T12:00:00.000Z' });
      handlers.get(WS_EMIT.GAME_LOG_ENTRY)!(existing);

      const history = [makeEntry({ message: 'Older', timestamp: '2024-01-15T08:00:00.000Z' })];
      handlers.get(WS_EMIT.GAME_LOG_HISTORY)!({ entries: history });

      expect(service.entries().length).toBe(2);
      expect(service.entries()[0].message).toBe('Older');
      expect(service.entries()[1].message).toBe('Recent');
    });

    it('sets loading to false after receiving history', () => {
      // Trigger a history request to set loading to true
      service.requestHistory();
      expect(service.loading()).toBe(true);

      handlers.get(WS_EMIT.GAME_LOG_HISTORY)!({ entries: [makeEntry()] });
      expect(service.loading()).toBe(false);
    });

    it('filters out history entries with null message or timestamp', () => {
      const history = [
        makeEntry({ message: 'Valid', timestamp: '2024-01-15T08:00:00.000Z' }),
        makeEntry({ message: null as unknown as string }),
        makeEntry({ timestamp: null as unknown as string }),
      ];
      handlers.get(WS_EMIT.GAME_LOG_HISTORY)!({ entries: history });

      expect(service.entries().length).toBe(1);
      expect(service.entries()[0].message).toBe('Valid');
    });
  });

  describe('exhausted state on empty history response', () => {
    it('sets exhausted to true when history response is empty', () => {
      expect(service.exhausted()).toBe(false);

      handlers.get(WS_EMIT.GAME_LOG_HISTORY)!({ entries: [] });

      expect(service.exhausted()).toBe(true);
    });

    it('does not set exhausted when history response has entries', () => {
      handlers.get(WS_EMIT.GAME_LOG_HISTORY)!({ entries: [makeEntry()] });

      expect(service.exhausted()).toBe(false);
    });

    it('sets loading to false even on empty response', () => {
      service.requestHistory();
      expect(service.loading()).toBe(true);

      handlers.get(WS_EMIT.GAME_LOG_HISTORY)!({ entries: [] });

      expect(service.loading()).toBe(false);
    });
  });

  describe('clearEntries resets all state', () => {
    it('clears entries signal', () => {
      handlers.get(WS_EMIT.GAME_LOG_ENTRY)!(makeEntry());
      expect(service.entries().length).toBe(1);

      service.clearEntries();

      expect(service.entries()).toEqual([]);
    });

    it('resets loading to false', () => {
      service.requestHistory();
      expect(service.loading()).toBe(true);

      service.clearEntries();

      expect(service.loading()).toBe(false);
    });

    it('resets exhausted to false', () => {
      handlers.get(WS_EMIT.GAME_LOG_HISTORY)!({ entries: [] });
      expect(service.exhausted()).toBe(true);

      service.clearEntries();

      expect(service.exhausted()).toBe(false);
    });
  });

  describe('requestHistory sends correct pagination payload', () => {
    it('sends history request with roomId and default pageSize', () => {
      service.requestHistory();

      expect(mockWs.send).toHaveBeenCalledWith(WS_EVENT.GAME_LOG_HISTORY, {
        roomId: 1,
        pageSize: 50,
      });
    });

    it('includes cursor when history has been loaded previously', () => {
      const history = [
        makeEntry({ id: 100, sessionId: 42, timestamp: '2024-01-15T09:00:00.000Z' }),
        makeEntry({ id: 99, sessionId: 42, timestamp: '2024-01-15T08:00:00.000Z' }),
      ];
      handlers.get(WS_EMIT.GAME_LOG_HISTORY)!({ entries: history });

      mockWs.send.mockClear();
      service.requestHistory();

      expect(mockWs.send).toHaveBeenCalledWith(WS_EVENT.GAME_LOG_HISTORY, {
        roomId: 1,
        pageSize: 50,
        cursor: 99,
      });
    });

    it('does not send when roomId is null', () => {
      roomIdSignal.set(null);
      mockWs.send.mockClear();

      service.requestHistory();

      expect(mockWs.send).not.toHaveBeenCalled();
    });

    it('sets loading to true when request is sent', () => {
      expect(service.loading()).toBe(false);

      service.requestHistory();

      expect(service.loading()).toBe(true);
    });
  });

  describe('onConnect callback behavior', () => {
    it('preserves entries and requests history when reconnecting with an active room', () => {
      handlers.get(WS_EMIT.GAME_LOG_ENTRY)!(makeEntry());
      expect(service.entries().length).toBe(1);

      mockWs.send.mockClear();
      connectCallbacks[0]();

      expect(service.entries().length).toBe(1);
      expect(service.loading()).toBe(true);
      expect(mockWs.send).toHaveBeenCalledWith(WS_EVENT.GAME_LOG_HISTORY, {
        roomId: 1,
        pageSize: 50,
      });
    });

    it('resets exhausted state on reconnect', () => {
      handlers.get(WS_EMIT.GAME_LOG_HISTORY)!({ entries: [] });
      expect(service.exhausted()).toBe(true);

      connectCallbacks[0]();

      expect(service.exhausted()).toBe(false);
    });

    it('does not request history when roomId is null', () => {
      handlers.get(WS_EMIT.GAME_LOG_ENTRY)!(makeEntry());
      roomIdSignal.set(null);

      mockWs.send.mockClear();
      connectCallbacks[0]();

      expect(service.entries().length).toBe(1);
      expect(mockWs.send).not.toHaveBeenCalled();
    });
  });
});
