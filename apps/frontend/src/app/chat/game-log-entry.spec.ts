import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { type GameLogBroadcast } from '@cardquorum/shared';
import { GameLogEntryComponent } from './game-log-entry';
import { SessionBoundaryMarker } from './session-boundary-marker';

const TEST_ENTRY: GameLogBroadcast = {
  sessionId: 1,
  userId: 10,
  eventType: 'card_played',
  message: 'Player played the Queen of Clubs',
  timestamp: '2024-06-15T14:30:00.000Z',
};

const BOUNDARY_ENTRY: GameLogBroadcast = {
  sessionId: 1,
  userId: null,
  eventType: 'game_started',
  message: 'Sheepshead game started',
  timestamp: '2024-06-15T14:00:00.000Z',
};

describe('GameLogEntryComponent', () => {
  let fixture: ComponentFixture<GameLogEntryComponent>;
  let el: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GameLogEntryComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(GameLogEntryComponent);
    fixture.componentRef.setInput('entry', TEST_ENTRY);
    fixture.detectChanges();
    el = fixture.nativeElement;
  });

  it('renders the entry message text', () => {
    const messageEl = el.querySelector('[data-testid="game-log-message"]');
    expect(messageEl?.textContent).toBe(TEST_ENTRY.message);
  });

  it('renders the formatted timestamp', () => {
    const timestampEl = el.querySelector('[data-testid="game-log-timestamp"]');
    const expected = new Date(TEST_ENTRY.timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
    expect(timestampEl?.textContent?.trim()).toBe(expected);
  });

  it('message container has muted text styling classes', () => {
    const container = el.querySelector('[data-testid="game-log-message"]')?.parentElement;
    expect(container?.classList.contains('text-xs')).toBe(true);
    expect(container?.classList.contains('text-text-secondary')).toBe(true);
  });
});

describe('SessionBoundaryMarker', () => {
  let fixture: ComponentFixture<SessionBoundaryMarker>;
  let el: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SessionBoundaryMarker],
    }).compileComponents();

    fixture = TestBed.createComponent(SessionBoundaryMarker);
    fixture.componentRef.setInput('entry', BOUNDARY_ENTRY);
    fixture.detectChanges();
    el = fixture.nativeElement;
  });

  it('host element has role="separator"', () => {
    expect(el.getAttribute('role')).toBe('separator');
  });

  it('message text has font-semibold class', () => {
    const textEl = el.querySelector('[data-testid="session-boundary-text"]');
    expect(textEl?.classList.contains('font-semibold')).toBe(true);
  });
});
