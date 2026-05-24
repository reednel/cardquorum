import * as fc from 'fast-check';

type TimeUnit = 'seconds' | 'minutes' | 'hours';

const UNIT_FACTORS: Record<TimeUnit, number> = {
  seconds: 1,
  minutes: 60,
  hours: 3600,
};

function computeTurnTimeLimit(value: number, unit: TimeUnit): number {
  return value * UNIT_FACTORS[unit];
}

/**
 * Decompose a total-seconds value into a numeric value and the best-fit unit.
 * Prefers the largest unit that divides evenly; falls back to seconds.
 */
function decomposeTurnTimeLimit(totalSeconds: number): { value: number; unit: TimeUnit } {
  if (totalSeconds % 3600 === 0) {
    return { value: totalSeconds / 3600, unit: 'hours' };
  }
  if (totalSeconds % 60 === 0) {
    return { value: totalSeconds / 60, unit: 'minutes' };
  }
  return { value: totalSeconds, unit: 'seconds' };
}

const validValue = fc.integer({ min: 1, max: 999 });
const validUnit = fc.constantFrom<TimeUnit>('seconds', 'minutes', 'hours');

describe('Turn time limit conversion', () => {
  it('seconds unit returns the value unchanged', () => {
    fc.assert(
      fc.property(validValue, (value) => {
        expect(computeTurnTimeLimit(value, 'seconds')).toBe(value);
      }),
      { numRuns: 100 },
    );
  });

  it('minutes unit returns value multiplied by 60', () => {
    fc.assert(
      fc.property(validValue, (value) => {
        expect(computeTurnTimeLimit(value, 'minutes')).toBe(value * 60);
      }),
      { numRuns: 100 },
    );
  });

  it('hours unit returns value multiplied by 3600', () => {
    fc.assert(
      fc.property(validValue, (value) => {
        expect(computeTurnTimeLimit(value, 'hours')).toBe(value * 3600);
      }),
      { numRuns: 100 },
    );
  });

  it('result is always in range [1, 3596400] for valid inputs', () => {
    fc.assert(
      fc.property(validValue, validUnit, (value, unit) => {
        const result = computeTurnTimeLimit(value, unit);
        expect(result).toBeGreaterThanOrEqual(1);
        expect(result).toBeLessThanOrEqual(3596400);
      }),
      { numRuns: 100 },
    );
  });

  it('result is always a positive integer for valid inputs', () => {
    fc.assert(
      fc.property(validValue, validUnit, (value, unit) => {
        const result = computeTurnTimeLimit(value, unit);
        expect(result).toBeGreaterThan(0);
        expect(Number.isInteger(result)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('round-trip: decompose(compute(value, unit)) returns original value and unit', () => {
    fc.assert(
      fc.property(validValue, validUnit, (value, unit) => {
        const totalSeconds = computeTurnTimeLimit(value, unit);
        const decomposed = decomposeTurnTimeLimit(totalSeconds);

        // For values that divide evenly into the unit, round-trip should be exact
        // The decompose function picks the largest unit that divides evenly,
        // so we only assert exact round-trip when the value doesn't accidentally
        // fit a larger unit.
        if (unit === 'seconds' && totalSeconds % 60 !== 0) {
          expect(decomposed).toEqual({ value, unit: 'seconds' });
        } else if (unit === 'minutes' && totalSeconds % 3600 !== 0) {
          expect(decomposed).toEqual({ value, unit: 'minutes' });
        } else if (unit === 'hours') {
          expect(decomposed).toEqual({ value, unit: 'hours' });
        }

        // In all cases, recomposing should give back the same total seconds
        expect(computeTurnTimeLimit(decomposed.value, decomposed.unit)).toBe(totalSeconds);
      }),
      { numRuns: 100 },
    );
  });
});
