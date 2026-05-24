import * as fc from 'fast-check';

/**
 * Pure validation function mirroring the server's turn time limit validation logic.
 * Accepts null (unlimited) or integers in [1, 3596400]. Rejects everything else.
 */
function isValidTurnTimeLimit(value: unknown): boolean {
  if (value === null) return true;
  if (typeof value !== 'number') return false;
  if (!Number.isInteger(value)) return false;
  return value >= 1 && value <= 3596400;
}

describe('Turn time limit validation', () => {
  it('null is always accepted', () => {
    expect(isValidTurnTimeLimit(null)).toBe(true);
  });

  it('any integer in [1, 3596400] is accepted', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 3596400 }), (value) => {
        expect(isValidTurnTimeLimit(value)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('any integer outside [1, 3596400] is rejected', () => {
    const outOfRangeInt = fc.oneof(
      fc.integer({ min: -1_000_000, max: 0 }),
      fc.integer({ min: 3596401, max: 10_000_000 }),
    );

    fc.assert(
      fc.property(outOfRangeInt, (value) => {
        expect(isValidTurnTimeLimit(value)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('non-integer numbers are rejected', () => {
    const nonInteger = fc
      .double({ min: -1e6, max: 1e6, noNaN: true })
      .filter((n) => !Number.isInteger(n));

    fc.assert(
      fc.property(nonInteger, (value) => {
        expect(isValidTurnTimeLimit(value)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('non-numeric values are rejected', () => {
    const nonNumeric = fc.oneof(
      fc.string(),
      fc.boolean(),
      fc.constant(undefined),
      fc.object(),
      fc.array(fc.anything()),
    );

    fc.assert(
      fc.property(nonNumeric, (value) => {
        expect(isValidTurnTimeLimit(value)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});
