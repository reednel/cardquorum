import { moveItemInArray } from '@angular/cdk/drag-drop';
import * as fc from 'fast-check';
import {
  computeBiasedPosition,
  computeCardPositions,
  computeScaleFactor,
  deterministicSeed,
} from './card-stack-layout';

describe('computeCardPositions', () => {
  describe('card count preservation', () => {
    it('returns exactly as many positions as the input count', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 52 }),
          fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
          fc.double({ min: 0, max: 360, noNaN: true, noDefaultInfinity: true }),
          fc.double({ min: 20, max: 200, noNaN: true, noDefaultInfinity: true }),
          fc.double({ min: 20, max: 200, noNaN: true, noDefaultInfinity: true }),
          (count, spread, spreadAngle, cardWidth, cardHeight) => {
            const positions = computeCardPositions({
              count,
              spread,
              spreadAngle,
              cardWidth,
              cardHeight,
            });
            expect(positions.length).toBe(count);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe('arc layout angular span', () => {
    it('rotation span between first and last card equals the specified spreadAngle', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 2, max: 13 }),
          fc.double({ min: 1, max: 360, noNaN: true, noDefaultInfinity: true }),
          fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
          fc.double({ min: 20, max: 200, noNaN: true, noDefaultInfinity: true }),
          (count, spreadAngle, spread, cardWidth) => {
            const positions = computeCardPositions({
              count,
              spread,
              spreadAngle,
              cardWidth,
              cardHeight: 100,
            });

            const firstRotation = positions[0].rotation;
            const lastRotation = positions[positions.length - 1].rotation;
            const actualSpan = lastRotation - firstRotation;

            expect(actualSpan).toBeCloseTo(spreadAngle, 8);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe('spread step proportionality', () => {
    it('horizontal distance between adjacent cards equals spread * cardWidth for straight-line layout', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 2, max: 52 }),
          fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
          fc.double({ min: 20, max: 200, noNaN: true, noDefaultInfinity: true }),
          (count, spread, cardWidth) => {
            const positions = computeCardPositions({
              count,
              spread,
              spreadAngle: 0,
              cardWidth,
              cardHeight: 100,
            });

            const expectedStep = spread * cardWidth;

            for (let i = 1; i < positions.length; i++) {
              const actualStep = positions[i].x - positions[i - 1].x;
              expect(actualStep).toBeCloseTo(expectedStep, 8);
            }
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});

describe('computeBiasedPosition', () => {
  describe('biased placement determinism', () => {
    it('same inputs always produce identical x, y, and rotation', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.integer({ min: 1, max: 10000 }),
          fc.integer({ min: 2, max: 8 }),
          fc.integer({ min: 0, max: 7 }),
          fc.double({ min: 20, max: 200, noNaN: true, noDefaultInfinity: true }),
          fc.double({ min: 20, max: 200, noNaN: true, noDefaultInfinity: true }),
          (cardName, playerID, seatCount, playerIndexRaw, cardWidth, cardHeight) => {
            const playerIndex = playerIndexRaw % seatCount;
            const params = { cardName, playerID, seatCount, playerIndex, cardWidth, cardHeight };

            const pos1 = computeBiasedPosition(params);
            const pos2 = computeBiasedPosition(params);

            expect(pos1.x).toBe(pos2.x);
            expect(pos1.y).toBe(pos2.y);
            expect(pos1.rotation).toBe(pos2.rotation);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('different card names or player IDs produce different positions with high probability', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              cardName: fc.string({ minLength: 1, maxLength: 20 }),
              playerID: fc.integer({ min: 1, max: 10000 }),
            }),
            { minLength: 10, maxLength: 20 },
          ),
          (entries) => {
            const positions = entries.map(({ cardName, playerID }) =>
              computeBiasedPosition({
                cardName,
                playerID,
                seatCount: 4,
                playerIndex: 0,
                cardWidth: 72,
                cardHeight: 100,
              }),
            );

            // Check that not all positions are identical
            const allSameX = positions.every((p) => p.x === positions[0].x);
            const allSameY = positions.every((p) => p.y === positions[0].y);
            const allSameRot = positions.every((p) => p.rotation === positions[0].rotation);

            // With 10+ distinct random inputs, it's astronomically unlikely all match
            expect(allSameX && allSameY && allSameRot).toBe(false);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe('deterministicSeed consistency', () => {
    it('same cardName and playerID always produce the same seed', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.integer({ min: 0, max: 10000 }),
          (cardName, playerID) => {
            const seed1 = deterministicSeed(cardName, playerID);
            const seed2 = deterministicSeed(cardName, playerID);
            expect(seed1).toBe(seed2);
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});

describe('computeScaleFactor', () => {
  describe('scale factor correctness', () => {
    it('returns min(1, containerWidth / naturalWidth) and stays in (0, 1]', () => {
      fc.assert(
        fc.property(
          fc.double({ min: 50, max: 2000, noNaN: true, noDefaultInfinity: true }),
          fc.double({ min: 50, max: 2000, noNaN: true, noDefaultInfinity: true }),
          (naturalWidth, containerWidth) => {
            const result = computeScaleFactor(naturalWidth, containerWidth);
            const expected = Math.min(1, containerWidth / naturalWidth);

            expect(result).toBeCloseTo(expected, 10);
            expect(result).toBeGreaterThan(0);
            expect(result).toBeLessThanOrEqual(1);
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});

describe('moveItemInArray reorder permutation', () => {
  it('produces a valid permutation with the moved card at the target index and leaves the original unmodified', () => {
    const uniqueCardNames = fc
      .array(fc.string({ minLength: 1, maxLength: 10 }), { minLength: 2, maxLength: 13 })
      .filter((arr) => new Set(arr).size === arr.length);

    fc.assert(
      fc.property(
        uniqueCardNames.chain((cards) =>
          fc.tuple(
            fc.constant(cards),
            fc.integer({ min: 0, max: cards.length - 1 }),
            fc.integer({ min: 0, max: cards.length - 1 }),
          ),
        ),
        ([cards, sourceIndex, targetIndex]) => {
          const original = [...cards];
          const reordered = [...cards];

          moveItemInArray(reordered, sourceIndex, targetIndex);

          // Original array is unmodified
          expect(original).toEqual(cards);

          // Result has the same length
          expect(reordered.length).toBe(cards.length);

          // Result is a permutation of the original (same elements, same count)
          const sortedOriginal = [...cards].sort();
          const sortedReordered = [...reordered].sort();
          expect(sortedReordered).toEqual(sortedOriginal);

          // The card originally at source index is now at target index
          expect(reordered[targetIndex]).toBe(cards[sourceIndex]);
        },
      ),
      { numRuns: 100 },
    );
  });
});
