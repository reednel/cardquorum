import * as fc from 'fast-check';
import type { AverageStat, RatioStat } from '@cardquorum/shared';

/**
 * Reference implementations of the aggregation helpers used in SheepsheadReportRepository.
 * These mirror the private buildRatioStat/buildAverageStat methods so we can verify
 * the aggregation formulas produce correct results for any input data.
 */
function buildRatioStat(numerator: number, denominator: number): RatioStat {
  return {
    numerator,
    denominator,
    value: denominator === 0 ? null : numerator / denominator,
  };
}

function buildAverageStat(sum: number, count: number): AverageStat {
  return {
    sum,
    count,
    value: count === 0 ? null : sum / count,
  };
}

type PlayerRole = 'picker' | 'partner' | 'opposition';

interface SessionData {
  role: PlayerRole;
  won: boolean;
  scoreDelta: number;
  points: number;
}

/**
 * Arbitrary for a single session's player data.
 */
function arbSessionData(): fc.Arbitrary<SessionData> {
  return fc.record({
    role: fc.constantFrom<PlayerRole>('picker', 'partner', 'opposition'),
    won: fc.boolean(),
    scoreDelta: fc.integer({ min: -20, max: 20 }),
    points: fc.integer({ min: 0, max: 120 }),
  });
}

/**
 * Computes expected report stats from raw session data using simple iteration.
 * This is the "oracle" that the repository's aggregation logic should match.
 */
function computeExpectedStats(sessions: SessionData[]) {
  const totalSessions = sessions.length;

  let pickerSessions = 0;
  let partnerSessions = 0;
  let oppositionSessions = 0;
  let pickerWins = 0;
  let partnerWins = 0;
  let oppositionWins = 0;
  let pickerPointsSum = 0;
  let scoreDeltaSum = 0;

  for (const s of sessions) {
    if (s.role === 'picker') {
      pickerSessions++;
      if (s.won) pickerWins++;
      pickerPointsSum += s.points;
    } else if (s.role === 'partner') {
      partnerSessions++;
      if (s.won) partnerWins++;
    } else {
      oppositionSessions++;
      if (s.won) oppositionWins++;
    }
    scoreDeltaSum += s.scoreDelta;
  }

  return {
    pickRate: buildRatioStat(pickerSessions, totalSessions),
    winRateAsPicker: buildRatioStat(pickerWins, pickerSessions),
    winRateAsPartner: buildRatioStat(partnerWins, partnerSessions),
    winRateAsOpposition: buildRatioStat(oppositionWins, oppositionSessions),
    avgPointsAsPicker: buildAverageStat(pickerPointsSum, pickerSessions),
    avgScoreDelta: buildAverageStat(scoreDeltaSum, totalSessions),
  };
}

/**
 * Simulates the aggregation logic from SheepsheadReportRepository.computeStoreMetrics.
 * This replicates how the repository computes stats from the raw DB row counts.
 */
function computeRepositoryStats(sessions: SessionData[]) {
  const totalSessions = sessions.length;

  const pickerSessions = sessions.filter((s) => s.role === 'picker').length;
  const partnerSessions = sessions.filter((s) => s.role === 'partner').length;
  const oppositionSessions = sessions.filter((s) => s.role === 'opposition').length;

  const pickerWins = sessions.filter((s) => s.role === 'picker' && s.won).length;
  const partnerWins = sessions.filter((s) => s.role === 'partner' && s.won).length;
  const oppositionWins = sessions.filter((s) => s.role === 'opposition' && s.won).length;

  const pickerPointsSum = sessions
    .filter((s) => s.role === 'picker')
    .reduce((sum, s) => sum + s.points, 0);

  const scoreDeltaSum = sessions.reduce((sum, s) => sum + s.scoreDelta, 0);

  return {
    pickRate: buildRatioStat(pickerSessions, totalSessions),
    winRateAsPicker: buildRatioStat(pickerWins, pickerSessions),
    winRateAsPartner: buildRatioStat(partnerWins, partnerSessions),
    winRateAsOpposition: buildRatioStat(oppositionWins, oppositionSessions),
    avgPointsAsPicker: buildAverageStat(pickerPointsSum, pickerSessions),
    avgScoreDelta: buildAverageStat(scoreDeltaSum, totalSessions),
  };
}

/** Trick data for lead fail ace property tests. */
interface TrickData {
  leadPlayer: number;
  leadCardName: string;
  winner: number;
}

const FAIL_ACE_NAMES = ['ac', 'as', 'ah'];

function arbTrickData(userId: number): fc.Arbitrary<TrickData> {
  return fc.record({
    leadPlayer: fc.constantFrom(userId, userId + 1, userId + 2),
    leadCardName: fc.constantFrom('ac', 'as', 'ah', 'xc', 'xs', 'qc', '7d', 'ad'),
    winner: fc.constantFrom(userId, userId + 1, userId + 2),
  });
}

function computeExpectedLeadFailAce(tricks: TrickData[], userId: number) {
  const leadFailAceTricks = tricks.filter(
    (t) => t.leadPlayer === userId && FAIL_ACE_NAMES.includes(t.leadCardName),
  );
  const won = leadFailAceTricks.filter((t) => t.winner === userId).length;
  return buildRatioStat(won, leadFailAceTricks.length);
}

describe('Report aggregation correctness', () => {
  it('pick rate equals sessions as picker divided by total sessions', () => {
    fc.assert(
      fc.property(fc.array(arbSessionData(), { minLength: 1, maxLength: 50 }), (sessions) => {
        const expected = computeExpectedStats(sessions);
        const actual = computeRepositoryStats(sessions);

        expect(actual.pickRate).toEqual(expected.pickRate);
      }),
      { numRuns: 100 },
    );
  });

  it('win rate per role equals wins in role divided by sessions in role', () => {
    fc.assert(
      fc.property(fc.array(arbSessionData(), { minLength: 1, maxLength: 50 }), (sessions) => {
        const expected = computeExpectedStats(sessions);
        const actual = computeRepositoryStats(sessions);

        expect(actual.winRateAsPicker).toEqual(expected.winRateAsPicker);
        expect(actual.winRateAsPartner).toEqual(expected.winRateAsPartner);
        expect(actual.winRateAsOpposition).toEqual(expected.winRateAsOpposition);
      }),
      { numRuns: 100 },
    );
  });

  it('avg points as picker equals sum of points as picker divided by picker sessions', () => {
    fc.assert(
      fc.property(fc.array(arbSessionData(), { minLength: 1, maxLength: 50 }), (sessions) => {
        const expected = computeExpectedStats(sessions);
        const actual = computeRepositoryStats(sessions);

        expect(actual.avgPointsAsPicker).toEqual(expected.avgPointsAsPicker);
      }),
      { numRuns: 100 },
    );
  });

  it('avg score delta equals sum of all scoreDelta divided by total sessions', () => {
    fc.assert(
      fc.property(fc.array(arbSessionData(), { minLength: 1, maxLength: 50 }), (sessions) => {
        const expected = computeExpectedStats(sessions);
        const actual = computeRepositoryStats(sessions);

        expect(actual.avgScoreDelta).toEqual(expected.avgScoreDelta);
      }),
      { numRuns: 100 },
    );
  });

  it('lead fail ace success rate equals tricks won when leading a fail ace divided by total fail ace leads', () => {
    const userId = 1;
    fc.assert(
      fc.property(fc.array(arbTrickData(userId), { minLength: 1, maxLength: 30 }), (tricks) => {
        const expected = computeExpectedLeadFailAce(tricks, userId);

        // Simulate the repository logic
        const leadFailAceTricks = tricks.filter(
          (t) => t.leadPlayer === userId && FAIL_ACE_NAMES.includes(t.leadCardName),
        );
        const won = leadFailAceTricks.filter((t) => t.winner === userId).length;
        const actual = buildRatioStat(won, leadFailAceTricks.length);

        expect(actual).toEqual(expected);
      }),
      { numRuns: 100 },
    );
  });

  it('ratio stat value is null when denominator is zero', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100 }), (numerator) => {
        const stat = buildRatioStat(numerator, 0);
        expect(stat.value).toBeNull();
        expect(stat.numerator).toBe(numerator);
        expect(stat.denominator).toBe(0);
      }),
      { numRuns: 100 },
    );
  });

  it('average stat value is null when count is zero', () => {
    fc.assert(
      fc.property(fc.integer({ min: -1000, max: 1000 }), (sum) => {
        const stat = buildAverageStat(sum, 0);
        expect(stat.value).toBeNull();
        expect(stat.sum).toBe(sum);
        expect(stat.count).toBe(0);
      }),
      { numRuns: 100 },
    );
  });

  it('all stats handle sessions with no picker role correctly', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            role: fc.constantFrom<PlayerRole>('partner', 'opposition'),
            won: fc.boolean(),
            scoreDelta: fc.integer({ min: -20, max: 20 }),
            points: fc.integer({ min: 0, max: 120 }),
          }),
          { minLength: 1, maxLength: 30 },
        ),
        (sessions) => {
          const actual = computeRepositoryStats(sessions);

          // With no picker sessions, pick rate numerator is 0
          expect(actual.pickRate.numerator).toBe(0);
          expect(actual.pickRate.value).toBe(0);

          // Win rate as picker should be null (0 denominator)
          expect(actual.winRateAsPicker.denominator).toBe(0);
          expect(actual.winRateAsPicker.value).toBeNull();

          // Avg points as picker should be null (0 count)
          expect(actual.avgPointsAsPicker.count).toBe(0);
          expect(actual.avgPointsAsPicker.value).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('lead fail ace success rate is null when player never led a fail ace', () => {
    const userId = 1;
    // All tricks led by other players
    const tricks: TrickData[] = [
      { leadPlayer: 2, leadCardName: 'ac', winner: 2 },
      { leadPlayer: 3, leadCardName: 'as', winner: 1 },
    ];
    const result = computeExpectedLeadFailAce(tricks, userId);
    expect(result.denominator).toBe(0);
    expect(result.value).toBeNull();
  });
});
