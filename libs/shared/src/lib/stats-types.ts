import { GameType } from './game-types';

/**
 * Mirrors the PlayerStatRow from @cardquorum/engine.
 * Defined here to avoid a circular dependency (engine already imports from shared).
 */
export interface PlayerStatRow {
  userId: number;
  won: boolean | null;
  scoreDelta: number | null;
}

export interface RoomStatsPlayerDto {
  userId: number;
  displayName: string;
  username: string;
  wins: number;
  losses: number;
  score: number;
  gamesPlayed: number;
}

export interface RoomStatsResponse {
  players: RoomStatsPlayerDto[];
}

export interface PlayerStatsResponse {
  wins: number;
  losses: number;
  score: number;
  gamesPlayed: number;
  breakdown?: Partial<
    Record<
      GameType,
      {
        wins: number;
        losses: number;
        score: number;
        gamesPlayed: number;
      }
    >
  >;
}

export interface StatsQueryParams {
  gameType?: GameType;
  timeRange?: 'all' | 'day' | 'week' | 'month' | 'year';
}
