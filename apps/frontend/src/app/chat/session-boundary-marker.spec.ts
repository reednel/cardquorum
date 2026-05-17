import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import type { GameLogBroadcast, GameTablePlugin, UserIdentity } from '@cardquorum/shared';
import * as gameRegistry from '../game/game-registry';
import { GameService } from '../game/game.service';
import { SummaryApiService } from '../game/summary-api.service';
import { SessionBoundaryMarker } from './session-boundary-marker';

@Component({
  selector: 'app-mock-summary',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div data-testid="mock-summary-content">Mock Summary</div>`,
})
class MockSummaryComponent {
  readonly store = input<unknown>();
  readonly participants = input<UserIdentity[]>();
}

const FINISHED_ENTRY: GameLogBroadcast = {
  sessionId: 42,
  userId: 1,
  eventType: 'game_finished',
  message: 'Game finished',
  timestamp: '2024-01-01T00:00:00.000Z',
};

const STARTED_ENTRY: GameLogBroadcast = {
  sessionId: 42,
  userId: 1,
  eventType: 'game_started',
  message: 'Game started',
  timestamp: '2024-01-01T00:00:00.000Z',
};

describe('SessionBoundaryMarker summary link', () => {
  let fixture: ComponentFixture<SessionBoundaryMarker>;
  let el: HTMLElement;
  let mockGameService: { gameType: ReturnType<typeof signal<string | null>> };
  let mockSummaryApiService: { getSummaryData: jest.Mock };

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
  }

  beforeEach(async () => {
    mockGameService = { gameType: signal<string | null>('sheepshead') };
    mockSummaryApiService = { getSummaryData: jest.fn() };

    await TestBed.configureTestingModule({
      imports: [SessionBoundaryMarker, MockSummaryComponent],
      providers: [
        provideRouter([]),
        { provide: GameService, useValue: mockGameService },
        { provide: SummaryApiService, useValue: mockSummaryApiService },
      ],
    }).compileComponents();
  });

  afterEach(() => TestBed.resetTestingModule());

  function createComponent(entry: GameLogBroadcast = FINISHED_ENTRY) {
    fixture = TestBed.createComponent(SessionBoundaryMarker);
    el = fixture.nativeElement;
    fixture.componentRef.setInput('entry', entry);
    fixture.detectChanges();
  }

  describe('summary link visibility', () => {
    it('is visible when the plugin provides getSummaryComponent', () => {
      setupPlugins(true);
      createComponent();

      expect(el.querySelector('[data-testid="summary-link"]')).toBeTruthy();
    });

    it('is not visible when the plugin does not provide getSummaryComponent', () => {
      setupPlugins(false);
      createComponent();

      expect(el.querySelector('[data-testid="summary-link"]')).toBeNull();
    });

    it('is not visible for non-terminal event types', () => {
      setupPlugins(true);
      createComponent(STARTED_ENTRY);

      expect(el.querySelector('[data-testid="summary-link"]')).toBeNull();
    });
  });

  describe('summary link placement', () => {
    it('appears after the Replay link in the DOM', () => {
      setupPlugins(true);
      createComponent();

      const container = el.querySelector('.flex');
      const children = Array.from(container!.children);
      const replayLink = children.find((c) => c.tagName === 'A');
      const summaryLink = el.querySelector('[data-testid="summary-link"]');

      expect(replayLink).toBeTruthy();
      expect(summaryLink).toBeTruthy();

      const replayIndex = children.indexOf(replayLink!);
      const summaryIndex = children.indexOf(summaryLink!);
      expect(summaryIndex).toBeGreaterThan(replayIndex);
    });
  });

  describe('loading state', () => {
    it('shows loading indicator while summary data is being fetched', () => {
      setupPlugins(true);
      mockSummaryApiService.getSummaryData.mockReturnValue(
        new Observable(() => {
          /*  */
        }),
      );
      createComponent();

      const summaryLink = el.querySelector('[data-testid="summary-link"]') as HTMLButtonElement;
      summaryLink.click();
      fixture.detectChanges();

      expect(el.querySelector('[data-testid="summary-loading"]')).toBeTruthy();
    });
  });

  describe('error state', () => {
    it('displays error message when the fetch fails', () => {
      setupPlugins(true);
      mockSummaryApiService.getSummaryData.mockReturnValue(
        throwError(() => new Error('Network error')),
      );
      createComponent();

      const summaryLink = el.querySelector('[data-testid="summary-link"]') as HTMLButtonElement;
      summaryLink.click();
      fixture.detectChanges();

      expect(el.querySelector('[data-testid="summary-error"]')).toBeTruthy();
    });

    it('does not render GameSummaryShell when there is an error', () => {
      setupPlugins(true);
      mockSummaryApiService.getSummaryData.mockReturnValue(
        throwError(() => new Error('Network error')),
      );
      createComponent();

      const summaryLink = el.querySelector('[data-testid="summary-link"]') as HTMLButtonElement;
      summaryLink.click();
      fixture.detectChanges();

      expect(el.querySelector('app-game-summary-shell')).toBeNull();
    });
  });
});
