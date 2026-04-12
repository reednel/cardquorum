import { Injectable } from '@nestjs/common';
import { circularHueDistance, minimumDistanceThreshold } from '@cardquorum/shared';

@Injectable()
export class ColorAssignmentService {
  /**
   * Compute an assigned hue for a player being promoted.
   * Returns a hue integer (0–359).
   *
   * @param preferredHue - The player's preferred hue, or null if no preference.
   * @param occupiedHues - The hues already assigned to other roster members.
   */
  assignHue(preferredHue: number | null, occupiedHues: number[]): number {
    const threshold = minimumDistanceThreshold(occupiedHues.length + 1);

    // If preferred hue is provided and satisfies the threshold, use it.
    if (preferredHue !== null && this.satisfiesThreshold(preferredHue, occupiedHues, threshold)) {
      return preferredHue;
    }

    // Search 0–359 for the candidate closest to the anchor hue that satisfies the threshold.
    // On ties, lower hue wins.
    const anchor = preferredHue ?? 0;
    let bestHue = -1;
    let bestDistance = Infinity;

    for (let hue = 0; hue < 360; hue++) {
      if (!this.satisfiesThreshold(hue, occupiedHues, threshold)) {
        continue;
      }
      const distance = circularHueDistance(hue, anchor);
      if (distance < bestDistance || (distance === bestDistance && hue < bestHue)) {
        bestDistance = distance;
        bestHue = hue;
      }
    }

    return bestHue;
  }

  private satisfiesThreshold(hue: number, occupiedHues: number[], threshold: number): boolean {
    return occupiedHues.every((occupied) => circularHueDistance(hue, occupied) >= threshold);
  }
}
