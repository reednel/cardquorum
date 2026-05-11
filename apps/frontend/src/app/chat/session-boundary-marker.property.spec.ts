import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import * as fc from 'fast-check';
import { GameLogBroadcast } from '@cardquorum/shared';
import { SessionBoundaryMarker } from './session-boundary-marker';

/**
 * Validates: Requirements 8.1, 8.4, 8.5
 *
 * For any GameLogBroadcast entry rendered by SessionBoundaryMarker, a "Watch Replay" link
 * SHALL be rendered if and only if the entry's eventType is "game_finished" or "game_abandoned".
 */

const isoDateArb = fc
  .integer({ min: 946684800000, max: 1924991999000 })
  .map((ms) => new Date(ms).toISOString());

const knownEventTypes = [
  'game_started',
  'game_finished',
  'game_abandoned',
  'game_cancelled',
  'card_played',
  'deal',
  'pick',
  'pass',
  'bury',
  'call',
];

const eventTypeArb = fc.oneof(
  fc.constantFrom(...knownEventTypes),
  fc.string({ minLength: 1, maxLength: 30 }),
);

const gameLogBroadcastArb = (eventType: fc.Arbitrary<string>): fc.Arbitrary<GameLogBroadcast> =>
  fc.record({
    sessionId: fc.integer({ min: 1, max: 100000 }),
    userId: fc.oneof(fc.constant(null), fc.integer({ min: 1, max: 10000 })),
    eventType,
    message: fc.string({ minLength: 1, maxLength: 100 }),
    timestamp: isoDateArb,
  });

describe('Replay link visibility', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SessionBoundaryMarker],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  afterEach(() => TestBed.resetTestingModule());

  it('showReplayLink is true if and only if eventType is game_finished or game_abandoned', () => {
    fc.assert(
      fc.property(gameLogBroadcastArb(eventTypeArb), (entry) => {
        const fixture = TestBed.createComponent(SessionBoundaryMarker);
        fixture.componentRef.setInput('entry', entry);
        fixture.detectChanges();

        const expected =
          entry.eventType === 'game_finished' || entry.eventType === 'game_abandoned';
        expect(fixture.componentInstance.showReplayLink()).toBe(expected);
      }),
      { numRuns: 100 },
    );
  });

  it('replay link is always shown for game_finished entries', () => {
    fc.assert(
      fc.property(gameLogBroadcastArb(fc.constant('game_finished')), (entry) => {
        const fixture = TestBed.createComponent(SessionBoundaryMarker);
        fixture.componentRef.setInput('entry', entry);
        fixture.detectChanges();

        expect(fixture.componentInstance.showReplayLink()).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('replay link is always shown for game_abandoned entries', () => {
    fc.assert(
      fc.property(gameLogBroadcastArb(fc.constant('game_abandoned')), (entry) => {
        const fixture = TestBed.createComponent(SessionBoundaryMarker);
        fixture.componentRef.setInput('entry', entry);
        fixture.detectChanges();

        expect(fixture.componentInstance.showReplayLink()).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('replay link is never shown for non-terminal event types', () => {
    const nonReplayEventTypeArb = eventTypeArb.filter(
      (et) => et !== 'game_finished' && et !== 'game_abandoned',
    );

    fc.assert(
      fc.property(gameLogBroadcastArb(nonReplayEventTypeArb), (entry) => {
        const fixture = TestBed.createComponent(SessionBoundaryMarker);
        fixture.componentRef.setInput('entry', entry);
        fixture.detectChanges();

        expect(fixture.componentInstance.showReplayLink()).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});
