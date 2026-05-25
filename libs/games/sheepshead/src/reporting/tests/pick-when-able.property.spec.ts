import * as fc from 'fast-check';
import type { RatioStat } from '@cardquorum/shared';

/**
 * Reference implementation of buildRatioStat matching the repository's private method.
 */
function buildRatioStat(numerator: number, denominator: number): RatioStat {
  return {
    numerator,
    denominator,
    value: denominator === 0 ? null : numerator / denominator,
  };
}

/**
 * Event types that can appear in game_events for a user within a session.
 * 'pick' and 'pass' are the relevant ones for pick-when-able computation.
 */
type EventType = 'pick' | 'pass' | 'play' | 'bury' | 'call';

interface SessionEvents {
  events: EventType[];
}

/**
 * Computes the pick-when-able RatioStat from session event data.
 * This mirrors the logic in SheepsheadReportRepository.computePickWhenAble:
 * - denominator = number of sessions where the user has at least one 'pick' or 'pass' event
 * - numerator = number of those sessions where the user has a 'pick' event
 */
function computePickWhenAble(sessions: SessionEvents[]): RatioStat {
  let pickOrPassSessions = 0;
  let pickSessions = 0;

  for (const session of sessions) {
    const hasPick = session.events.includes('pick');
    const hasPass = session.events.includes('pass');

    if (hasPick || hasPass) {
      pickOrPassSessions++;
      if (hasPick) {
        pickSessions++;
      }
    }
  }

  return buildRatioStat(pickSessions, pickOrPassSessions);
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const arbEventType: fc.Arbitrary<EventType> = fc.constantFrom(
  'pick',
  'pass',
  'play',
  'bury',
  'call',
);

const arbSessionEvents: fc.Arbitrary<SessionEvents> = fc.record({
  events: fc.array(arbEventType, { minLength: 0, maxLength: 10 }),
});

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe('Pick-when-able computation', () => {
  it('numerator is always less than or equal to denominator', () => {
    fc.assert(
      fc.property(fc.array(arbSessionEvents, { minLength: 0, maxLength: 50 }), (sessions) => {
        const result = computePickWhenAble(sessions);
        expect(result.numerator).toBeLessThanOrEqual(result.denominator);
      }),
      { numRuns: 100 },
    );
  });

  it('sessions with no pick or pass events do not count toward denominator', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            events: fc.array(fc.constantFrom<EventType>('play', 'bury', 'call'), {
              minLength: 0,
              maxLength: 10,
            }),
          }),
          { minLength: 1, maxLength: 30 },
        ),
        (sessions) => {
          const result = computePickWhenAble(sessions);
          expect(result.denominator).toBe(0);
          expect(result.numerator).toBe(0);
          expect(result.value).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('sessions with only pass events count toward denominator but not numerator', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            events: fc
              .array(fc.constantFrom<EventType>('pass', 'play', 'bury', 'call'), {
                minLength: 1,
                maxLength: 10,
              })
              .filter((events) => events.includes('pass') && !events.includes('pick')),
          }),
          { minLength: 1, maxLength: 30 },
        ),
        (sessions) => {
          const result = computePickWhenAble(sessions);
          expect(result.denominator).toBe(sessions.length);
          expect(result.numerator).toBe(0);
          expect(result.value).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('sessions with a pick event count toward both numerator and denominator', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            events: fc
              .array(arbEventType, { minLength: 1, maxLength: 10 })
              .filter((events) => events.includes('pick')),
          }),
          { minLength: 1, maxLength: 30 },
        ),
        (sessions) => {
          const result = computePickWhenAble(sessions);
          // All sessions have a pick event, so all count toward both
          expect(result.denominator).toBe(sessions.length);
          expect(result.numerator).toBe(sessions.length);
          expect(result.value).toBe(1);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('value is null when denominator is zero, otherwise equals numerator divided by denominator', () => {
    fc.assert(
      fc.property(fc.array(arbSessionEvents, { minLength: 0, maxLength: 50 }), (sessions) => {
        const result = computePickWhenAble(sessions);

        if (result.denominator === 0) {
          expect(result.value).toBeNull();
        } else {
          expect(result.value).toBeCloseTo(result.numerator / result.denominator, 10);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('mixed sessions produce correct counts matching manual computation', () => {
    fc.assert(
      fc.property(fc.array(arbSessionEvents, { minLength: 1, maxLength: 50 }), (sessions) => {
        const result = computePickWhenAble(sessions);

        // Manually compute expected values
        const expectedDenominator = sessions.filter(
          (s) => s.events.includes('pick') || s.events.includes('pass'),
        ).length;
        const expectedNumerator = sessions.filter(
          (s) =>
            s.events.includes('pick') && (s.events.includes('pick') || s.events.includes('pass')),
        ).length;

        expect(result.denominator).toBe(expectedDenominator);
        expect(result.numerator).toBe(expectedNumerator);
      }),
      { numRuns: 100 },
    );
  });
});
