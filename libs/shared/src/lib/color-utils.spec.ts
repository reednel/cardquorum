import { PALETTE_HUES } from './color-types';
import {
  circularHueDistance,
  hueToHsl,
  isValidPaletteHue,
  minimumDistanceThreshold,
} from './color-utils';

describe('circularHueDistance', () => {
  it('returns 0 for identical hues', () => {
    expect(circularHueDistance(0, 0)).toBe(0);
    expect(circularHueDistance(180, 180)).toBe(0);
  });

  it('returns the shorter arc distance', () => {
    expect(circularHueDistance(10, 350)).toBe(20);
    expect(circularHueDistance(350, 10)).toBe(20);
  });

  it('returns 180 for opposite hues', () => {
    expect(circularHueDistance(0, 180)).toBe(180);
    expect(circularHueDistance(90, 270)).toBe(180);
  });

  it('handles adjacent hues', () => {
    expect(circularHueDistance(0, 1)).toBe(1);
    expect(circularHueDistance(359, 0)).toBe(1);
  });
});

describe('minimumDistanceThreshold', () => {
  it('returns approximately 40 degrees for 2 players', () => {
    const threshold = minimumDistanceThreshold(2);
    expect(threshold).toBeCloseTo(360 / 9, 5);
    expect(threshold).toBe(40);
  });

  it('returns 24 degrees for 8 players', () => {
    const threshold = minimumDistanceThreshold(8);
    expect(threshold).toBeCloseTo(360 / 15, 5);
    expect(threshold).toBe(24);
  });

  it('decreases as player count increases', () => {
    const t2 = minimumDistanceThreshold(2);
    const t4 = minimumDistanceThreshold(4);
    const t8 = minimumDistanceThreshold(8);
    const t16 = minimumDistanceThreshold(16);
    expect(t2).toBeGreaterThan(t4);
    expect(t4).toBeGreaterThan(t8);
    expect(t8).toBeGreaterThan(t16);
  });
});

describe('isValidPaletteHue', () => {
  it('returns true for all palette hues', () => {
    for (const hue of PALETTE_HUES) {
      expect(isValidPaletteHue(hue)).toBe(true);
    }
  });

  it('returns false for non-palette values', () => {
    expect(isValidPaletteHue(10)).toBe(false);
    expect(isValidPaletteHue(359)).toBe(false);
    expect(isValidPaletteHue(-1)).toBe(false);
    expect(isValidPaletteHue(360)).toBe(false);
  });
});

describe('hueToHsl', () => {
  it('returns dark theme string with L=33', () => {
    expect(hueToHsl(200, 'dark')).toBe('hsl(200, 75%, 33%)');
  });

  it('returns light theme string with L=66', () => {
    expect(hueToHsl(200, 'light')).toBe('hsl(200, 75%, 66%)');
  });

  it('handles hue 0', () => {
    expect(hueToHsl(0, 'dark')).toBe('hsl(0, 75%, 33%)');
    expect(hueToHsl(0, 'light')).toBe('hsl(0, 75%, 66%)');
  });
});
