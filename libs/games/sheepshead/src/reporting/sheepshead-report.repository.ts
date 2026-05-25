import { and, eq, gte, inArray, isNotNull, lte, sql, SQL } from 'drizzle-orm';
import { DbInstance, gameEvents, gameParticipants, gameSessions } from '@cardquorum/db';
import {
  AverageStat,
  GameReportRepository,
  RatioStat,
  ReportDescriptor,
  ReportFilters,
  ScoreTrajectoryPoint,
  SheepsheadReportPayload,
} from '@cardquorum/shared';

export class SheepsheadReportRepository implements GameReportRepository {
  constructor(private readonly db: DbInstance) {}

  getAvailableReports(): ReportDescriptor[] {
    return [
      {
        key: 'default',
        label: 'Sheepshead Report',
        description: 'Personal Sheepshead performance statistics and score trajectory.',
      },
    ];
  }

  async computeReport(
    reportKey: string,
    userId: number,
    filters: ReportFilters,
  ): Promise<SheepsheadReportPayload> {
    if (reportKey !== 'default') {
      throw new Error(`Report key '${reportKey}' not recognized`);
    }

    const baseConditions = this.buildBaseConditions(userId, filters);

    try {
      const [storeMetrics, pickWhenAble, leadFailAceSuccess, scoreTrajectory] = await Promise.all([
        this.computeStoreMetrics(userId, baseConditions),
        this.computePickWhenAble(userId, baseConditions),
        this.computeLeadFailAceSuccess(userId, baseConditions),
        this.computeScoreTrajectory(userId, baseConditions),
      ]);

      return {
        totalSessions: storeMetrics.totalSessions,
        statCards: {
          pickRate: storeMetrics.pickRate,
          pickWhenAbleRate: pickWhenAble,
          winRateAsPicker: storeMetrics.winRateAsPicker,
          winRateAsPartner: storeMetrics.winRateAsPartner,
          winRateAsOpposition: storeMetrics.winRateAsOpposition,
          avgPointsAsPicker: storeMetrics.avgPointsAsPicker,
          avgScoreDelta: storeMetrics.avgScoreDelta,
          leadFailAceSuccessRate: leadFailAceSuccess,
        },
        scoreTrajectory,
      };
    } catch (err) {
      console.error('[SheepsheadReportRepository] computeReport failed:', err);
      throw err;
    }
  }

  private buildBaseConditions(userId: number, filters: ReportFilters): SQL[] {
    const conditions: SQL[] = [
      eq(gameParticipants.userId, userId),
      eq(gameSessions.gameType, 'sheepshead'),
      eq(gameSessions.status, 'finished'),
      isNotNull(gameSessions.finishedAt),
    ];

    if (filters.variants && filters.variants.length > 0) {
      conditions.push(inArray(gameSessions.variant, filters.variants));
    }

    if (filters.startDate) {
      conditions.push(gte(gameSessions.finishedAt, new Date(filters.startDate)));
    }

    if (filters.endDate) {
      // endDate is inclusive, so we use end of day
      const endOfDay = new Date(filters.endDate + 'T23:59:59.999Z');
      conditions.push(lte(gameSessions.finishedAt, endOfDay));
    }

    return conditions;
  }

  private async computeStoreMetrics(userId: number, baseConditions: SQL[]) {
    const rows = await this.db.execute<{
      total_sessions: string;
      picker_sessions: string;
      partner_sessions: string;
      opposition_sessions: string;
      picker_wins: string;
      partner_wins: string;
      opposition_wins: string;
      picker_points_sum: string | null;
      picker_points_count: string;
      score_delta_sum: string | null;
      score_delta_count: string;
    }>(
      sql`
        SELECT
          count(*)::int AS total_sessions,
          count(*) FILTER (WHERE (player_entry.elem->>'role') = 'picker')::int AS picker_sessions,
          count(*) FILTER (WHERE (player_entry.elem->>'role') = 'partner')::int AS partner_sessions,
          count(*) FILTER (WHERE (player_entry.elem->>'role') = 'opposition')::int AS opposition_sessions,
          count(*) FILTER (WHERE (player_entry.elem->>'role') = 'picker' AND (player_entry.elem->>'won')::boolean = true)::int AS picker_wins,
          count(*) FILTER (WHERE (player_entry.elem->>'role') = 'partner' AND (player_entry.elem->>'won')::boolean = true)::int AS partner_wins,
          count(*) FILTER (WHERE (player_entry.elem->>'role') = 'opposition' AND (player_entry.elem->>'won')::boolean = true)::int AS opposition_wins,
          sum(CASE WHEN (player_entry.elem->>'role') = 'picker' AND player_entry.elem->>'points' IS NOT NULL THEN (player_entry.elem->>'points')::numeric ELSE NULL END) AS picker_points_sum,
          count(*) FILTER (WHERE (player_entry.elem->>'role') = 'picker' AND player_entry.elem->>'points' IS NOT NULL)::int AS picker_points_count,
          sum(CASE WHEN player_entry.elem->>'scoreDelta' IS NOT NULL THEN (player_entry.elem->>'scoreDelta')::numeric ELSE NULL END) AS score_delta_sum,
          count(*) FILTER (WHERE player_entry.elem->>'scoreDelta' IS NOT NULL)::int AS score_delta_count
        FROM ${gameSessions}
        INNER JOIN ${gameParticipants} ON ${gameParticipants.sessionId} = ${gameSessions.id}
        CROSS JOIN LATERAL (
          SELECT elem
          FROM jsonb_array_elements(${gameSessions.store}->'players') AS elem
          WHERE (elem->>'userID')::int = ${userId}
        ) AS player_entry
        WHERE ${and(...baseConditions)}
      `,
    );

    const row = rows[0];
    const totalSessions = Number(row?.total_sessions ?? 0);
    const pickerSessions = Number(row?.picker_sessions ?? 0);
    const partnerSessions = Number(row?.partner_sessions ?? 0);
    const oppositionSessions = Number(row?.opposition_sessions ?? 0);
    const pickerWins = Number(row?.picker_wins ?? 0);
    const partnerWins = Number(row?.partner_wins ?? 0);
    const oppositionWins = Number(row?.opposition_wins ?? 0);
    const pickerPointsSum = row?.picker_points_sum != null ? Number(row.picker_points_sum) : 0;
    const pickerPointsCount = Number(row?.picker_points_count ?? 0);
    const scoreDeltaSum = row?.score_delta_sum != null ? Number(row.score_delta_sum) : 0;
    const scoreDeltaCount = Number(row?.score_delta_count ?? 0);

    return {
      totalSessions,
      pickRate: this.buildRatioStat(pickerSessions, totalSessions),
      winRateAsPicker: this.buildRatioStat(pickerWins, pickerSessions),
      winRateAsPartner: this.buildRatioStat(partnerWins, partnerSessions),
      winRateAsOpposition: this.buildRatioStat(oppositionWins, oppositionSessions),
      avgPointsAsPicker: this.buildAverageStat(pickerPointsSum, pickerPointsCount),
      avgScoreDelta: this.buildAverageStat(scoreDeltaSum, scoreDeltaCount),
    };
  }

  private async computePickWhenAble(userId: number, baseConditions: SQL[]): Promise<RatioStat> {
    const rows = await this.db.execute<{
      pick_sessions: string;
      pick_or_pass_sessions: string;
    }>(
      sql`
        SELECT
          count(DISTINCT CASE WHEN ${gameEvents.eventType} = 'pick' THEN ${gameEvents.sessionId} END)::int AS pick_sessions,
          count(DISTINCT ${gameEvents.sessionId})::int AS pick_or_pass_sessions
        FROM ${gameEvents}
        INNER JOIN ${gameSessions} ON ${gameSessions.id} = ${gameEvents.sessionId}
        INNER JOIN ${gameParticipants} ON ${gameParticipants.sessionId} = ${gameSessions.id}
        WHERE ${and(...baseConditions)}
          AND ${gameEvents.userId} = ${userId}
          AND ${gameEvents.eventType} IN ('pick', 'pass')
      `,
    );

    const row = rows[0];
    const pickSessions = Number(row?.pick_sessions ?? 0);
    const pickOrPassSessions = Number(row?.pick_or_pass_sessions ?? 0);

    return this.buildRatioStat(pickSessions, pickOrPassSessions);
  }

  private async computeLeadFailAceSuccess(
    userId: number,
    baseConditions: SQL[],
  ): Promise<RatioStat> {
    // For each session's tricks, count how many times this user led with a fail ace
    // and how many of those they won.
    // Fail aces are: ac (ace of clubs), as (ace of spades), ah (ace of hearts).
    const rows = await this.db.execute<{
      lead_fail_ace_total: string;
      lead_fail_ace_won: string;
    }>(
      sql`
        SELECT
          count(*)::int AS lead_fail_ace_total,
          count(*) FILTER (WHERE (trick.elem->>'winner')::int = ${userId})::int AS lead_fail_ace_won
        FROM ${gameSessions}
        INNER JOIN ${gameParticipants} ON ${gameParticipants.sessionId} = ${gameSessions.id}
        CROSS JOIN LATERAL jsonb_array_elements(${gameSessions.store}->'tricks') AS trick(elem)
        WHERE ${and(...baseConditions)}
          AND ${gameSessions.store}->'tricks' IS NOT NULL
          AND (trick.elem->'plays'->0->'player')::int = ${userId}
          AND (trick.elem->'plays'->0->'card'->>'name') IN ('ac', 'as', 'ah')
      `,
    );

    const row = rows[0];
    const total = Number(row?.lead_fail_ace_total ?? 0);
    const won = Number(row?.lead_fail_ace_won ?? 0);

    return this.buildRatioStat(won, total);
  }

  private async computeScoreTrajectory(
    userId: number,
    baseConditions: SQL[],
  ): Promise<ScoreTrajectoryPoint[]> {
    const rows = await this.db.execute<{
      score_delta: string;
    }>(
      sql`
        SELECT (player_entry.elem->>'scoreDelta')::numeric AS score_delta
        FROM ${gameSessions}
        INNER JOIN ${gameParticipants} ON ${gameParticipants.sessionId} = ${gameSessions.id}
        CROSS JOIN LATERAL (
          SELECT elem
          FROM jsonb_array_elements(${gameSessions.store}->'players') AS elem
          WHERE (elem->>'userID')::int = ${userId}
        ) AS player_entry
        WHERE ${and(...baseConditions)}
          AND player_entry.elem->>'scoreDelta' IS NOT NULL
        ORDER BY ${gameSessions.finishedAt} ASC, ${gameSessions.id} ASC
      `,
    );

    let cumulativeScore = 0;
    return rows.map((row, index) => {
      const scoreDelta = Number(row.score_delta);
      cumulativeScore += scoreDelta;
      return {
        sessionIndex: index + 1,
        scoreDelta,
        cumulativeScore,
      };
    });
  }

  private buildRatioStat(numerator: number, denominator: number): RatioStat {
    return {
      numerator,
      denominator,
      value: denominator === 0 ? null : numerator / denominator,
    };
  }

  private buildAverageStat(sum: number, count: number): AverageStat {
    return {
      sum,
      count,
      value: count === 0 ? null : sum / count,
    };
  }
}
