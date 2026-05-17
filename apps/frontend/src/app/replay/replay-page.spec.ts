import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';
import type {
  GameTablePlugin,
  ReplayDataResponse,
  SummaryDataResponse,
  UserIdentity,
} from '@cardquorum/shared';
import { AuthService } from '../auth/auth.service';
import * as gameRegistry from '../game/game-registry';
import { SummaryApiService } from '../game/summary-api.service';
import { ReplayApiService } from './replay-api.service';
import { ReplayEngineService } from './replay-engine.service';
import { ReplayPage } from './replay-page';

@Component({
  selector: 'app-mock-summary',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div data-testid="mock-summary-content">Mock</div>`,
})
class MockSummaryComponent {
  readonly store = input<unknown>();
  readonly participants = input<UserIdentity[]>();
}

/** Dummy table component to prevent the real SheepsheadTable from rendering. */
@Component({
  selector: 'app-mock-game-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div data-testid="mock-game-table">Mock Table</div>`,
})
class MockGameTableComponent {
  readonly myUserID = input<number>();
  readonly members = input<unknown[]>();
  readonly isOwner = input<boolean>();
  readonly autostart = input<boolean>();
  readonly canStartNext = input<boolean>();
  readonly startNextGame = input<unknown>();
  readonly state = input<unknown>();
  readonly validActions = input<string[]>();
  readonly config = input<unknown>();
  readonly colorMap = input<unknown>();
  readonly actionDispatcher = input<unknown>();
}

const MOCK_SUMMARY_DATA: SummaryDataResponse = {
  sessionId: 1,
  gameType: 'sheepshead',
  store: { tricks: [], players: [] },
  participants: [
    { userId: 1, displayName: 'Alice', username: 'alice', seatIndex: 0 },
    { userId: 2, displayName: 'Bob', username: 'bob', seatIndex: 1 },
  ],
};

describe('ReplayPage summary integration', () => {
  let fixture: ComponentFixture<ReplayPage>;
  let el: HTMLElement;
  let mockReplayEngine: {
    currentPosition: ReturnType<typeof signal<number>>;
    totalEvents: ReturnType<typeof signal<number>>;
    playerView: ReturnType<typeof signal<unknown>>;
    currentEventMessage: ReturnType<typeof signal<string | null>>;
    error: ReturnType<typeof signal<unknown>>;
    initialize: jest.Mock;
    stepForward: jest.Mock;
    stepBackward: jest.Mock;
    jumpToStart: jest.Mock;
    jumpToEnd: jest.Mock;
    goToPosition: jest.Mock;
  };
  let mockReplayApi: { getReplayData: jest.Mock; getSessions: jest.Mock };
  let mockSummaryApi: { getSummaryData: jest.Mock };
  let mockAuth: { user: ReturnType<typeof signal> };
  let paramMapSubject: BehaviorSubject<{
    get: (key: string) => string | null;
    has: (key: string) => boolean;
    getAll: (key: string) => string[];
    keys: string[];
  }>;

  function setupPlugins(withSummary: boolean) {
    const plugin: Partial<GameTablePlugin> = {
      getCardAsset: jest.fn(),
      getLegalCards: jest.fn(),
      getActiveOverlay: jest.fn(),
      buildPlayCardEvent: jest.fn(),
      buildBuryEvent: jest.fn(),
      getCurrentTrick: jest.fn(),
      getPlayerSeats: jest.fn(),
      getStatusInfo: jest.fn(),
      getMyHand: jest.fn(),
      getBlindCards: jest.fn(),
      getBuryCount: jest.fn(),
      buildMoveEvent: jest.fn(),
      getDefaultTarget: jest.fn(),
    };
    if (withSummary) {
      plugin.getSummaryComponent = () => MockSummaryComponent;
    }
    Object.defineProperty(gameRegistry, 'GAME_TABLE_PLUGINS', {
      value: { sheepshead: plugin },
      writable: true,
      configurable: true,
    });
    // Replace the real SheepsheadTable with a mock to avoid rendering game-specific logic
    Object.defineProperty(gameRegistry, 'GAME_TABLE_COMPONENTS', {
      value: { sheepshead: MockGameTableComponent },
      writable: true,
      configurable: true,
    });
  }

  beforeEach(async () => {
    jest.useFakeTimers();

    mockReplayEngine = {
      currentPosition: signal(0),
      totalEvents: signal(0),
      playerView: signal(null),
      currentEventMessage: signal(null),
      error: signal(null),
      initialize: jest.fn(),
      stepForward: jest.fn(),
      stepBackward: jest.fn(),
      jumpToStart: jest.fn(),
      jumpToEnd: jest.fn(),
      goToPosition: jest.fn(),
    };

    mockReplayApi = {
      getReplayData: jest.fn().mockReturnValue(
        of({
          sessionId: 1,
          gameType: 'sheepshead',
          config: {},
          status: 'finished',
          startedAt: '2024-01-01T00:00:00.000Z',
          finishedAt: '2024-01-01T01:00:00.000Z',
          colorMap: { 1: 120, 2: 240 },
          participants: [
            { userId: 1, seatIndex: 0, displayName: 'Alice', username: 'alice' },
            { userId: 2, seatIndex: 1, displayName: 'Bob', username: 'bob' },
          ],
          events: [],
        } satisfies ReplayDataResponse),
      ),
      getSessions: jest.fn().mockReturnValue(of({ sessions: [], nextCursor: null })),
    };

    mockSummaryApi = {
      getSummaryData: jest.fn().mockReturnValue(of(MOCK_SUMMARY_DATA)),
    };

    mockAuth = {
      user: signal({ userId: 1, username: 'alice', displayName: 'Alice' }),
    };

    // Start with no session selected to avoid rendering the replay table
    paramMapSubject = new BehaviorSubject({
      get: (_key: string) => null as string | null,
      has: (_key: string) => false,
      getAll: (_key: string) => [] as string[],
      keys: [] as string[],
    });

    await TestBed.configureTestingModule({
      imports: [ReplayPage, MockSummaryComponent, MockGameTableComponent],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        { provide: ReplayApiService, useValue: mockReplayApi },
        { provide: SummaryApiService, useValue: mockSummaryApi },
        { provide: AuthService, useValue: mockAuth },
        {
          provide: ActivatedRoute,
          useValue: { queryParamMap: paramMapSubject.asObservable() },
        },
      ],
    })
      .overrideComponent(ReplayPage, {
        set: {
          providers: [{ provide: ReplayEngineService, useValue: mockReplayEngine }],
        },
      })
      .compileComponents();
  });

  afterEach(() => {
    jest.useRealTimers();
    TestBed.resetTestingModule();
  });

  function createComponent() {
    fixture = TestBed.createComponent(ReplayPage);
    el = fixture.nativeElement;
    fixture.detectChanges();
  }

  /**
   * Simulate loading a session by emitting a session param and setting up
   * the component's internal state as if replay data was loaded successfully.
   * This avoids rendering the actual game table (which requires full game state).
   */
  function simulateReplayLoaded() {
    // Emit session param to trigger data loading
    paramMapSubject.next({
      get: (key: string) => (key === 'session' ? '1' : null),
      has: (key: string) => key === 'session',
      getAll: (key: string) => (key === 'session' ? ['1'] : []),
      keys: ['session'],
    });
    fixture.detectChanges();
  }

  describe('auto-display at final position', () => {
    it('shows summary overlay after 500ms when at final position with score phase', () => {
      setupPlugins(true);
      createComponent();
      simulateReplayLoaded();

      // Simulate reaching final position with score phase
      mockReplayEngine.totalEvents.set(5);
      mockReplayEngine.currentPosition.set(5);
      mockReplayEngine.playerView.set({ phase: 'score', players: [] });
      fixture.detectChanges();

      // Before 500ms, overlay should not be visible
      expect(el.querySelector('app-game-summary-shell')).toBeNull();

      // After 500ms, overlay should appear
      jest.advanceTimersByTime(500);
      fixture.detectChanges();

      expect(el.querySelector('app-game-summary-shell')).toBeTruthy();
    });

    it('does not show summary overlay before 500ms delay completes', () => {
      setupPlugins(true);
      createComponent();
      simulateReplayLoaded();

      mockReplayEngine.totalEvents.set(5);
      mockReplayEngine.currentPosition.set(5);
      mockReplayEngine.playerView.set({ phase: 'score', players: [] });
      fixture.detectChanges();

      jest.advanceTimersByTime(300);
      fixture.detectChanges();

      expect(el.querySelector('app-game-summary-shell')).toBeNull();
    });

    it('does not show summary overlay when not at final position', () => {
      setupPlugins(true);
      createComponent();
      simulateReplayLoaded();

      mockReplayEngine.totalEvents.set(5);
      mockReplayEngine.currentPosition.set(3);
      mockReplayEngine.playerView.set({ phase: 'score', players: [] });
      fixture.detectChanges();

      jest.advanceTimersByTime(500);
      fixture.detectChanges();

      expect(el.querySelector('app-game-summary-shell')).toBeNull();
    });

    it('does not show summary overlay when phase is not score', () => {
      setupPlugins(true);
      createComponent();
      simulateReplayLoaded();

      mockReplayEngine.totalEvents.set(5);
      mockReplayEngine.currentPosition.set(5);
      mockReplayEngine.playerView.set({ phase: 'play', players: [] });
      fixture.detectChanges();

      jest.advanceTimersByTime(500);
      fixture.detectChanges();

      expect(el.querySelector('app-game-summary-shell')).toBeNull();
    });
  });

  describe('hide on backward navigation and re-display on return', () => {
    it('hides overlay when navigating backward from final position', () => {
      setupPlugins(true);
      createComponent();
      simulateReplayLoaded();

      // Reach final position
      mockReplayEngine.totalEvents.set(5);
      mockReplayEngine.currentPosition.set(5);
      mockReplayEngine.playerView.set({ phase: 'score', players: [] });
      fixture.detectChanges();
      jest.advanceTimersByTime(500);
      fixture.detectChanges();

      expect(el.querySelector('app-game-summary-shell')).toBeTruthy();

      // Navigate backward
      mockReplayEngine.currentPosition.set(4);
      mockReplayEngine.playerView.set({ phase: 'play', players: [] });
      fixture.detectChanges();

      expect(el.querySelector('app-game-summary-shell')).toBeNull();
    });

    it('re-displays overlay when returning to final position after navigating away', () => {
      setupPlugins(true);
      createComponent();
      simulateReplayLoaded();

      // Reach final position
      mockReplayEngine.totalEvents.set(5);
      mockReplayEngine.currentPosition.set(5);
      mockReplayEngine.playerView.set({ phase: 'score', players: [] });
      fixture.detectChanges();
      jest.advanceTimersByTime(500);
      fixture.detectChanges();

      expect(el.querySelector('app-game-summary-shell')).toBeTruthy();

      // Navigate backward
      mockReplayEngine.currentPosition.set(4);
      mockReplayEngine.playerView.set({ phase: 'play', players: [] });
      fixture.detectChanges();

      expect(el.querySelector('app-game-summary-shell')).toBeNull();

      // Return to final position
      mockReplayEngine.currentPosition.set(5);
      mockReplayEngine.playerView.set({ phase: 'score', players: [] });
      fixture.detectChanges();
      jest.advanceTimersByTime(500);
      fixture.detectChanges();

      expect(el.querySelector('app-game-summary-shell')).toBeTruthy();
    });
  });

  describe('Summary button visibility and autoplay behavior', () => {
    it('exposes summaryComponent as non-null when plugin provides getSummaryComponent', () => {
      setupPlugins(true);
      createComponent();
      simulateReplayLoaded();

      expect(fixture.componentInstance['summaryComponent']()).not.toBeNull();
    });

    it('exposes summaryComponent as null when plugin does not provide getSummaryComponent', () => {
      setupPlugins(false);
      createComponent();
      simulateReplayLoaded();

      expect(fixture.componentInstance['summaryComponent']()).toBeNull();
    });

    it('shows summary overlay when onSummaryButtonClick is called', () => {
      setupPlugins(true);
      createComponent();
      simulateReplayLoaded();

      fixture.componentInstance['onSummaryButtonClick']();
      fixture.detectChanges();

      expect(el.querySelector('app-game-summary-shell')).toBeTruthy();
    });

    it('resumes autoplay on dismiss if it was paused by the overlay', () => {
      setupPlugins(true);
      createComponent();
      simulateReplayLoaded();

      // Simulate that autoplay was paused by the overlay
      fixture.componentInstance['autoplayPausedByOverlay'] = true;
      fixture.componentInstance['summaryOverlayVisible'].set(true);
      fixture.detectChanges();

      expect(el.querySelector('app-game-summary-shell')).toBeTruthy();

      // Dismiss the summary
      fixture.componentInstance['dismissSummary']();
      fixture.detectChanges();

      expect(el.querySelector('app-game-summary-shell')).toBeNull();
      expect(fixture.componentInstance['autoplayPausedByOverlay']).toBe(false);
    });

    it('does not attempt to resume autoplay on dismiss if it was not paused by the overlay', () => {
      setupPlugins(true);
      createComponent();
      simulateReplayLoaded();

      // Simulate overlay opened without autoplay running
      fixture.componentInstance['autoplayPausedByOverlay'] = false;
      fixture.componentInstance['summaryOverlayVisible'].set(true);
      fixture.detectChanges();

      expect(el.querySelector('app-game-summary-shell')).toBeTruthy();

      fixture.componentInstance['dismissSummary']();
      fixture.detectChanges();

      expect(el.querySelector('app-game-summary-shell')).toBeNull();
      expect(fixture.componentInstance['autoplayPausedByOverlay']).toBe(false);
    });
  });
});
