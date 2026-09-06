import * as fc from 'fast-check';
import { type ScoreTrajectoryPoint } from '@cardquorum/shared';

// ---------------------------------------------------------------------------
// Reference implementation — mirrors the repository's computeScoreTrajectory
// mapping logic (the pure computation after DB rows are fetched).
// ---------------------------------------------------------------------------

function computeTrajectory(scoreDeltas: number[]): ScoreTrajectoryPoint[] {
  let cumulativeScore = 0;
  return scoreDeltas.map((scoreDelta, index) => {
    cumulativeScore += scoreDelta;
    return { sessionIndex: index + 1, scoreDelta, cumulativeScore };
  });
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const arbScoreDeltas = fc.array(fc.integer({ min: -200, max: 200 }), {
  minLength: 0,
  maxLength: 50,
});

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe('Score trajectory computation', () => {
  it('each point has a 1-based sessionIndex matching its position', () => {
    fc.assert(
      fc.property(arbScoreDeltas, (deltas) => {
        const trajectory = computeTrajectory(deltas);

        expect(trajectory).toHaveLength(deltas.length);

        for (let i = 0; i < trajectory.length; i++) {
          expect(trajectory[i].sessionIndex).toBe(i + 1);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('each point cumulativeScore equals the running sum of scoreDeltas up to that point', () => {
    fc.assert(
      fc.property(arbScoreDeltas, (deltas) => {
        const trajectory = computeTrajectory(deltas);

        let runningSum = 0;
        for (let i = 0; i < trajectory.length; i++) {
          runningSum += deltas[i];
          expect(trajectory[i].cumulativeScore).toBe(runningSum);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('the final cumulativeScore equals the total sum of all scoreDeltas', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: -200, max: 200 }), { minLength: 1, maxLength: 50 }),
        (deltas) => {
          const trajectory = computeTrajectory(deltas);
          const totalSum = deltas.reduce((acc, d) => acc + d, 0);

          expect(trajectory[trajectory.length - 1].cumulativeScore).toBe(totalSum);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('each point preserves the original scoreDelta value', () => {
    fc.assert(
      fc.property(arbScoreDeltas, (deltas) => {
        const trajectory = computeTrajectory(deltas);

        for (let i = 0; i < trajectory.length; i++) {
          expect(trajectory[i].scoreDelta).toBe(deltas[i]);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('output length always equals input length', () => {
    fc.assert(
      fc.property(arbScoreDeltas, (deltas) => {
        const trajectory = computeTrajectory(deltas);
        expect(trajectory).toHaveLength(deltas.length);
      }),
      { numRuns: 100 },
    );
  });
});
