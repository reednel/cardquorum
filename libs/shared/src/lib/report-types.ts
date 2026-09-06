import { type Type } from '@angular/core';

/** Describes a single report offered by a game plugin. */
export interface ReportDescriptor {
  key: string; // max 64 chars
  label: string; // max 100 chars
  description: string; // max 500 chars
}

/** Filter parameters for report computation. */
export interface ReportFilters {
  variants?: string[];
  startDate?: string; // ISO 8601 YYYY-MM-DD
  endDate?: string; // ISO 8601 YYYY-MM-DD
}

/** Backend interface implemented by each game plugin to compute report data. */
export interface GameReportRepository {
  getAvailableReports(): ReportDescriptor[];
  computeReport(reportKey: string, userId: number, filters: ReportFilters): Promise<unknown>;
}

/** Frontend interface implemented by each game plugin to provide report rendering. */
export interface GameReportPlugin {
  label: string;
  variants: { key: string; label: string }[];
  getReportComponent(): Type<unknown>;
}

/** A ratio-based stat (e.g., win rate, pick rate). */
export interface RatioStat {
  numerator: number;
  denominator: number;
  value: number | null; // null when denominator is 0
}

/** An average-based stat (e.g., avg points, avg score delta). */
export interface AverageStat {
  sum: number;
  count: number;
  value: number | null; // null when count is 0
}

/** A single data point in the score trajectory time series. */
export interface ScoreTrajectoryPoint {
  sessionIndex: number; // 1-based ordinal
  scoreDelta: number;
  cumulativeScore: number;
}

/** Full report payload for Sheepshead. */
export interface SheepsheadReportPayload {
  totalSessions: number;
  statCards: {
    pickRate: RatioStat;
    pickWhenAbleRate: RatioStat;
    winRateAsPicker: RatioStat;
    winRateAsPartner: RatioStat;
    winRateAsOpposition: RatioStat;
    avgPointsAsPicker: AverageStat;
    avgScoreDelta: AverageStat;
    leadFailAceSuccessRate: RatioStat;
  };
  scoreTrajectory: ScoreTrajectoryPoint[];
}
