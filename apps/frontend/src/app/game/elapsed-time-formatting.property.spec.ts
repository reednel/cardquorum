import * as fc from 'fast-check';

/**
 * Pure formatting logic extracted from ForceAbandonModal.formattedElapsed computed.
 *
 * Given a non-negative integer of elapsed seconds, returns a string in "M:SS" format
 * where M is total minutes (no leading zero) and SS is remaining seconds (zero-padded to 2 digits).
 */
function formatElapsedTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const ss = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${ss}`;
}

/** Arbitrary for non-negative integers representing elapsed seconds. */
const arbElapsedSeconds = fc.integer({ min: 0, max: 999999 });

describe('Elapsed time formatting', () => {
  it('output always matches the pattern /^\\d+:\\d{2}$/', () => {
    fc.assert(
      fc.property(arbElapsedSeconds, (seconds) => {
        const result = formatElapsedTime(seconds);
        expect(result).toMatch(/^\d+:\d{2}$/);
      }),
      { numRuns: 100 },
    );
  });

  it('parsing back: M * 60 + SS equals the original input seconds', () => {
    fc.assert(
      fc.property(arbElapsedSeconds, (seconds) => {
        const result = formatElapsedTime(seconds);
        const [mStr, ssStr] = result.split(':');
        const m = parseInt(mStr, 10);
        const ss = parseInt(ssStr, 10);
        expect(m * 60 + ss).toBe(seconds);
      }),
      { numRuns: 100 },
    );
  });

  it('SS is always in range [0, 59]', () => {
    fc.assert(
      fc.property(arbElapsedSeconds, (seconds) => {
        const result = formatElapsedTime(seconds);
        const ssStr = result.split(':')[1];
        const ss = parseInt(ssStr, 10);
        expect(ss).toBeGreaterThanOrEqual(0);
        expect(ss).toBeLessThanOrEqual(59);
      }),
      { numRuns: 100 },
    );
  });

  it('M has no leading zeros (unless M is 0)', () => {
    fc.assert(
      fc.property(arbElapsedSeconds, (seconds) => {
        const result = formatElapsedTime(seconds);
        const mStr = result.split(':')[0];
        if (mStr !== '0') {
          expect(mStr[0]).not.toBe('0');
        }
      }),
      { numRuns: 100 },
    );
  });

  it('specific edge cases format correctly', () => {
    expect(formatElapsedTime(0)).toBe('0:00');
    expect(formatElapsedTime(59)).toBe('0:59');
    expect(formatElapsedTime(60)).toBe('1:00');
    expect(formatElapsedTime(3661)).toBe('61:01');
  });
});
