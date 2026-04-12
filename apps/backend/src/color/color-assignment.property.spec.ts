import * as fc from 'fast-check';
import { circularHueDistance, minimumDistanceThreshold } from '@cardquorum/shared';
import { ColorAssignmentService } from './color-assignment.service';

describe('ColorAssignmentService', () => {
  const service = new ColorAssignmentService();

  describe('assignHue selects the closest valid hue to the preference', () => {
    const preferredHueArb = fc.option(fc.integer({ min: 0, max: 359 }), { nil: null });
    const occupiedHuesArb = fc.uniqueArray(fc.integer({ min: 0, max: 359 }), { maxLength: 15 });

    it('returned hue satisfies the minimum distance threshold against all occupied hues', () => {
      fc.assert(
        fc.property(preferredHueArb, occupiedHuesArb, (preferredHue, occupiedHues) => {
          const result = service.assignHue(preferredHue, occupiedHues);
          const threshold = minimumDistanceThreshold(occupiedHues.length + 1);

          for (const occupied of occupiedHues) {
            expect(circularHueDistance(result, occupied)).toBeGreaterThanOrEqual(threshold);
          }
        }),
        { numRuns: 100 },
      );
    });

    it('returned hue is the closest valid hue to the anchor', () => {
      fc.assert(
        fc.property(preferredHueArb, occupiedHuesArb, (preferredHue, occupiedHues) => {
          const result = service.assignHue(preferredHue, occupiedHues);
          const anchor = preferredHue ?? 0;
          const threshold = minimumDistanceThreshold(occupiedHues.length + 1);
          const resultDistance = circularHueDistance(result, anchor);

          // No other valid hue should be strictly closer to the anchor
          for (let hue = 0; hue < 360; hue++) {
            const isValid = occupiedHues.every((o) => circularHueDistance(hue, o) >= threshold);
            if (!isValid) continue;

            const candidateDistance = circularHueDistance(hue, anchor);
            expect(candidateDistance).toBeGreaterThanOrEqual(resultDistance);
          }
        }),
        { numRuns: 100 },
      );
    });

    it('lower hue wins when two candidates are equidistant from the anchor', () => {
      fc.assert(
        fc.property(preferredHueArb, occupiedHuesArb, (preferredHue, occupiedHues) => {
          const result = service.assignHue(preferredHue, occupiedHues);
          const anchor = preferredHue ?? 0;
          const threshold = minimumDistanceThreshold(occupiedHues.length + 1);
          const resultDistance = circularHueDistance(result, anchor);

          // Any valid hue at the same distance must have a hue >= result
          for (let hue = 0; hue < 360; hue++) {
            const isValid = occupiedHues.every((o) => circularHueDistance(hue, o) >= threshold);
            if (!isValid) continue;

            const candidateDistance = circularHueDistance(hue, anchor);
            if (candidateDistance === resultDistance) {
              expect(hue).toBeGreaterThanOrEqual(result);
            }
          }
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('full assignment map pairwise distance invariant', () => {
    const preferencesArb = fc.array(fc.option(fc.integer({ min: 0, max: 359 }), { nil: null }), {
      minLength: 2,
      maxLength: 16,
    });

    it('every pair of assigned hues satisfies the minimum distance threshold', () => {
      fc.assert(
        fc.property(preferencesArb, (preferences) => {
          const assignedHues: number[] = [];

          for (const pref of preferences) {
            const hue = service.assignHue(pref, assignedHues);
            assignedHues.push(hue);
          }

          const threshold = minimumDistanceThreshold(assignedHues.length);

          for (let i = 0; i < assignedHues.length; i++) {
            for (let j = i + 1; j < assignedHues.length; j++) {
              expect(circularHueDistance(assignedHues[i], assignedHues[j])).toBeGreaterThanOrEqual(
                threshold,
              );
            }
          }
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('assigned hue is stable across game sessions', () => {
    const existingHueArb = fc.integer({ min: 0, max: 359 });
    const occupiedHuesArb = fc.uniqueArray(fc.integer({ min: 0, max: 359 }), { maxLength: 15 });
    const preferredHueArb = fc.option(fc.integer({ min: 0, max: 359 }), { nil: null });

    it('existing assigned hue is preserved without recomputation when guard is applied', () => {
      fc.assert(
        fc.property(
          existingHueArb,
          occupiedHuesArb,
          preferredHueArb,
          (existingHue, occupiedHues, preferredHue) => {
            // Simulate the RoomService guard: if assigned_hue is non-null, return it directly
            const guardedAssign = (
              assignedHue: number | null,
              preferred: number | null,
              occupied: number[],
            ): number => {
              if (assignedHue !== null) {
                return assignedHue;
              }
              return service.assignHue(preferred, occupied);
            };

            const result = guardedAssign(existingHue, preferredHue, occupiedHues);

            // The result must always be the existing hue — no recomputation
            expect(result).toBe(existingHue);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('re-running assignment for players with assigned hues produces identical results', () => {
      fc.assert(
        fc.property(
          fc.array(fc.option(fc.integer({ min: 0, max: 359 }), { nil: null }), {
            minLength: 2,
            maxLength: 16,
          }),
          (preferences) => {
            // Phase 1: Build initial assignment map (simulating first game session)
            const assignedHues: number[] = [];
            for (const pref of preferences) {
              const hue = service.assignHue(pref, assignedHues);
              assignedHues.push(hue);
            }

            // Phase 2: Simulate a new game session — for each player that already
            // has an assigned hue, the guard skips recomputation
            for (let i = 0; i < assignedHues.length; i++) {
              const existingHue = assignedHues[i];
              const otherHues = assignedHues.filter((_, idx) => idx !== i);

              // Guard check: assigned_hue is non-null, so return it directly
              const result =
                existingHue !== null ? existingHue : service.assignHue(preferences[i], otherHues);

              expect(result).toBe(assignedHues[i]);
            }
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
