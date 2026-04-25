import { PALETTE_HUES } from './color-types';

/**
 * Compute the circular hue distance between two hue values.
 * Returns min(|h1 - h2|, 360 - |h1 - h2|).
 */
export function circularHueDistance(h1: number, h2: number): number {
  const diff = Math.abs(h1 - h2);
  return Math.min(diff, 360 - diff);
}

/**
 * Compute the minimum distance threshold for a given number of colors.
 * threshold(n) = 360 / (n + 7) for n ≥ 2.
 * Yields ~40° at n=2, ~24° at n=8, monotonically decreasing.
 */
export function minimumDistanceThreshold(colorCount: number): number {
  return 360 / (colorCount + 7);
}

/**
 * Returns true if the given hue is one of the 18 palette hue values.
 */
export function isValidPaletteHue(hue: number): boolean {
  return (PALETTE_HUES as readonly number[]).includes(hue);
}

/**
 * Build a CSS hsl() color string from a hue integer and theme.
 * S=75, L=66 for dark theme (lighter for contrast), L=33 for light theme (darker for contrast).
 */
export function hueToHsl(hue: number, theme: 'dark' | 'light'): string {
  return `hsl(${hue}, 75%, ${theme === 'dark' ? 66 : 33}%)`;
}
