import * as fc from 'fast-check';
import { PALETTE_HUES } from './color-types';
import { circularHueDistance, isValidPaletteHue, minimumDistanceThreshold } from './color-utils';

describe('Palette hue validation', () => {
  it('isValidPaletteHue returns true iff the integer is a multiple of 20 in [0, 340]', () => {
    fc.assert(
      fc.property(fc.integer({ min: -100, max: 500 }), (n) => {
        const isMultipleOf20InRange = Number.isInteger(n) && n >= 0 && n <= 340 && n % 20 === 0;
        expect(isValidPaletteHue(n)).toBe(isMultipleOf20InRange);
      }),
      { numRuns: 200 },
    );
  });

  it('PALETTE_HUES contains exactly 18 entries', () => {
    expect(PALETTE_HUES).toHaveLength(18);
  });

  it('every PALETTE_HUES entry is a valid integer in [0, 359] at steps of 20', () => {
    for (const hue of PALETTE_HUES) {
      expect(Number.isInteger(hue)).toBe(true);
      expect(hue).toBeGreaterThanOrEqual(0);
      expect(hue).toBeLessThanOrEqual(359);
      expect(hue % 20).toBe(0);
    }
  });

  it('PALETTE_HUES entries match the expected sequence [0, 20, 40, …, 340]', () => {
    const expected = Array.from({ length: 18 }, (_, i) => i * 20);
    expect([...PALETTE_HUES]).toEqual(expected);
  });
});

describe('Circular hue distance is a metric', () => {
  const hue = fc.integer({ min: 0, max: 359 });

  it('identity: distance from a hue to itself is zero', () => {
    fc.assert(
      fc.property(hue, (h) => {
        expect(circularHueDistance(h, h)).toBe(0);
      }),
      { numRuns: 100 },
    );
  });

  it('symmetry: distance is the same regardless of argument order', () => {
    fc.assert(
      fc.property(hue, hue, (h1, h2) => {
        expect(circularHueDistance(h1, h2)).toBe(circularHueDistance(h2, h1));
      }),
      { numRuns: 100 },
    );
  });

  it('non-negativity: distance is always greater than or equal to zero', () => {
    fc.assert(
      fc.property(hue, hue, (h1, h2) => {
        expect(circularHueDistance(h1, h2)).toBeGreaterThanOrEqual(0);
      }),
      { numRuns: 100 },
    );
  });
});

describe('Minimum distance threshold is monotonically decreasing', () => {
  it('larger player count always yields a smaller threshold', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 127 }),
        fc.integer({ min: 1, max: 128 }),
        (n1, offset) => {
          const n2 = Math.min(n1 + offset, 128);
          fc.pre(n2 > n1);
          expect(minimumDistanceThreshold(n1)).toBeGreaterThan(minimumDistanceThreshold(n2));
        },
      ),
      { numRuns: 200 },
    );
  });
});
