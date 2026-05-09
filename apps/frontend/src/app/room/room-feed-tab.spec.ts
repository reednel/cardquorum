import { signal, WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChatMessagePayload, GameLogBroadcast } from '@cardquorum/shared';
import { ChatService } from '../chat/chat.service';
import { GameLogService } from '../chat/game-log.service';
import { WebSocketService } from '../websocket.service';
import { RoomContextService } from './room-context.service';
import { RoomFeedTab } from './room-feed-tab';

const CHAT_MSG: ChatMessagePayload = {
  id: 1,
  roomId: 1,
  senderUserId: 10,
  senderDisplayName: 'Alice',
  content: 'Hello!',
  sentAt: '2024-06-15T14:00:00.000Z',
};

const CHAT_MSG_2: ChatMessagePayload = {
  id: 2,
  roomId: 1,
  senderUserId: 11,
  senderDisplayName: 'Bob',
  content: 'Hi there!',
  sentAt: '2024-06-15T14:02:00.000Z',
};

const LOG_ENTRY: GameLogBroadcast = {
  sessionId: 1,
  userId: 10,
  eventType: 'card_played',
  message: 'Alice played a card',
  timestamp: '2024-06-15T14:01:00.000Z',
};

const BOUNDARY_ENTRY: GameLogBroadcast = {
  sessionId: 1,
  userId: null,
  eventType: 'game_started',
  message: 'Game started',
  timestamp: '2024-06-15T13:59:00.000Z',
};

describe('RoomFeedTab', () => {
  let fixture: ComponentFixture<RoomFeedTab>;
  let el: HTMLElement;
  let chatMessages: WritableSignal<ChatMessagePayload[]>;
  let gameLogEntries: WritableSignal<GameLogBroadcast[]>;
  let loadingSignal: WritableSignal<boolean>;
  let exhaustedSignal: WritableSignal<boolean>;
  let mockChatService: Record<string, unknown>;
  let mockGameLogService: Record<string, unknown>;

  beforeEach(async () => {
    localStorage.removeItem('cq_feed_mode');
    chatMessages = signal<ChatMessagePayload[]>([]);
    gameLogEntries = signal<GameLogBroadcast[]>([]);
    loadingSignal = signal(false);
    exhaustedSignal = signal(false);

    mockChatService = {
      messages: chatMessages.asReadonly(),
      sendMessage: jest.fn(),
      clearMessages: jest.fn(),
    };

    mockGameLogService = {
      entries: gameLogEntries.asReadonly(),
      loading: loadingSignal.asReadonly(),
      exhausted: exhaustedSignal.asReadonly(),
      requestHistory: jest.fn(),
      clearEntries: jest.fn(),
    };

    const mockWs = {
      on: jest.fn(() => jest.fn()),
      send: jest.fn(),
      onConnect: jest.fn(() => jest.fn()),
      connected: signal(false),
    };

    const mockRoomContext = {
      currentRoomId: signal<number | null>(1),
      members: signal([]),
      roomDeleted: signal(null),
      joinError: signal(null),
    };

    await TestBed.configureTestingModule({
      imports: [RoomFeedTab],
      providers: [
        { provide: ChatService, useValue: mockChatService },
        { provide: GameLogService, useValue: mockGameLogService },
        { provide: WebSocketService, useValue: mockWs },
        { provide: RoomContextService, useValue: mockRoomContext },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(RoomFeedTab);
    fixture.detectChanges();
    el = fixture.nativeElement;
  });

  it('defaults to all mode showing both chat and game log', () => {
    chatMessages.set([CHAT_MSG, CHAT_MSG_2]);
    gameLogEntries.set([LOG_ENTRY]);
    fixture.detectChanges();

    // Chat messages should be visible
    expect(el.textContent).toContain(CHAT_MSG.content);
    expect(el.textContent).toContain(CHAT_MSG_2.content);

    // Game log entries should also be visible
    const gameLogElements = el.querySelectorAll('app-game-log-entry');
    expect(gameLogElements.length).toBe(1);
  });

  it('in chat mode shows only chat messages', () => {
    fixture.componentRef.setInput('feedMode', 'chat');
    chatMessages.set([CHAT_MSG, CHAT_MSG_2]);
    gameLogEntries.set([LOG_ENTRY]);
    fixture.detectChanges();

    // Chat messages should be visible
    expect(el.textContent).toContain(CHAT_MSG.content);
    expect(el.textContent).toContain(CHAT_MSG_2.content);

    // Game log entries should NOT be visible
    const gameLogElements = el.querySelectorAll('app-game-log-entry');
    expect(gameLogElements.length).toBe(0);
  });

  it('in game-log mode hides chat messages and input form', () => {
    fixture.componentRef.setInput('feedMode', 'game-log');
    chatMessages.set([CHAT_MSG]);
    gameLogEntries.set([LOG_ENTRY]);
    fixture.detectChanges();

    // Chat messages should be hidden
    expect(el.textContent).not.toContain(CHAT_MSG.content);

    // Game log entries should be visible
    const gameLogElements = el.querySelectorAll('app-game-log-entry');
    expect(gameLogElements.length).toBe(1);

    // Input form should be hidden
    const input = el.querySelector('#message-input');
    expect(input).toBeNull();
  });

  it('in all mode shows interleaved items', () => {
    fixture.componentRef.setInput('feedMode', 'all');
    chatMessages.set([CHAT_MSG]);
    gameLogEntries.set([LOG_ENTRY, BOUNDARY_ENTRY]);
    fixture.detectChanges();

    // Both chat and game log content should be visible
    expect(el.textContent).toContain(CHAT_MSG.content);
    expect(el.textContent).toContain(LOG_ENTRY.message);
    expect(el.textContent).toContain(BOUNDARY_ENTRY.message);
  });

  it('loading indicator appears when loading signal is true', () => {
    loadingSignal.set(true);
    fixture.detectChanges();

    const indicator = el.querySelector('[data-testid="loading-indicator"]');
    expect(indicator).toBeTruthy();
  });

  it('loading indicator is hidden when loading signal is false', () => {
    loadingSignal.set(false);
    fixture.detectChanges();

    const indicator = el.querySelector('[data-testid="loading-indicator"]');
    expect(indicator).toBeNull();
  });

  it('auto-scrolls to bottom when new items arrive and already at bottom', (done) => {
    const container = el.querySelector('[role="log"]') as HTMLElement;
    // Simulate being at the bottom
    Object.defineProperty(container, 'scrollHeight', { value: 200, configurable: true });
    Object.defineProperty(container, 'scrollTop', {
      value: 190,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(container, 'clientHeight', { value: 200, configurable: true });

    // Trigger scroll to register "at bottom" state
    container.dispatchEvent(new Event('scroll'));

    // Add new messages
    chatMessages.set([CHAT_MSG]);
    fixture.detectChanges();

    // The component uses setTimeout(0) for auto-scroll, so wait a tick
    setTimeout(() => {
      // scrollTop should have been set to scrollHeight (auto-scroll)
      expect(container.scrollTop).toBe(container.scrollHeight);
      done();
    }, 10);
  });

  it('does not auto-scroll when user has scrolled up', () => {
    const container = el.querySelector('[role="log"]') as HTMLElement;
    // Simulate being scrolled up (not at bottom)
    Object.defineProperty(container, 'scrollHeight', { value: 500, configurable: true });
    Object.defineProperty(container, 'scrollTop', {
      value: 100,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(container, 'clientHeight', { value: 200, configurable: true });

    // Trigger scroll to register "not at bottom" state
    container.dispatchEvent(new Event('scroll'));

    const scrollTopBefore = container.scrollTop;

    // Add new messages
    chatMessages.set([CHAT_MSG, CHAT_MSG_2]);
    fixture.detectChanges();

    // scrollTop should not have been changed synchronously
    expect(container.scrollTop).toBe(scrollTopBefore);
  });
});
