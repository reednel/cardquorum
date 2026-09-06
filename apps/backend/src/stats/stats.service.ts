import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  type PlayerStatsRepository,
  type RoomRepository,
  type RoomRosterRepository,
} from '@cardquorum/db';
import {
  type PlayerStatRow,
  type PlayerStatsResponse,
  type RoomStatsResponse,
  type StatsQueryParams,
} from '@cardquorum/shared';

/**
 * Resolves a time range preset string to a Date representing the start of the range.
 * Returns null for 'all' or any unrecognized value (treated as no filter).
 */
function resolveTimeRange(timeRange: string | undefined): Date | null {
  if (!timeRange || timeRange === 'all') return null;

  const now = Date.now();

  switch (timeRange) {
    case 'day':
      return new Date(now - 24 * 60 * 60 * 1000);
    case 'week':
      return new Date(now - 7 * 24 * 60 * 60 * 1000);
    case 'month':
      return new Date(now - 30 * 24 * 60 * 60 * 1000);
    case 'year':
      return new Date(now - 365 * 24 * 60 * 60 * 1000);
    default:
      return null;
  }
}

@Injectable()
export class StatsService {
  private readonly logger = new Logger(StatsService.name);

  constructor(
    private readonly playerStatsRepo: PlayerStatsRepository,
    private readonly roomRosterRepo: RoomRosterRepository,
    private readonly roomRepo: RoomRepository,
  ) {}

  /**
   * Writes stats rows to the database for a completed game session.
   * Logs errors without throwing — stats failures must not block game completion.
   * Duplicate inserts (unique constraint violations) are logged as warnings and treated as idempotent.
   */
  async writeStats(
    sessionId: number,
    roomId: number,
    gameType: string,
    rows: PlayerStatRow[],
  ): Promise<void> {
    if (rows.length === 0) return;

    try {
      const dbRows = rows.map((row) => ({
        userId: row.userId,
        sessionId,
        roomId,
        gameType,
        won: row.won,
        scoreDelta: row.scoreDelta,
      }));

      await this.playerStatsRepo.bulkInsert(dbRows);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);

      // Unique constraint violation (PostgreSQL error code 23505)
      if (
        message.includes('unique') ||
        message.includes('duplicate') ||
        message.includes('23505')
      ) {
        this.logger.warn(
          `Duplicate stats insert for session ${sessionId} (idempotent): ${message}`,
        );
      } else {
        this.logger.error(`Failed to write stats for session ${sessionId}: ${message}`);
      }
    }
  }

  /**
   * Returns aggregated room stats for all current members.
   * Throws 404 if the room does not exist, 403 if the requesting user is not a member.
   */
  async getRoomStats(
    roomId: number,
    userId: number,
    filters: StatsQueryParams,
  ): Promise<RoomStatsResponse> {
    // Check room existence
    const room = await this.roomRepo.findById(roomId);
    if (!room) {
      throw new NotFoundException(`Room ${roomId} not found`);
    }

    // Check membership
    const isMember = await this.roomRosterRepo.isMember(roomId, userId);
    if (!isMember) {
      throw new ForbiddenException('You are not a member of this room');
    }

    // Get current roster member IDs
    const rosterMembers = await this.roomRosterRepo.findByRoom(roomId);
    const memberUserIds = rosterMembers.map((m) => m.userId);

    // Resolve filters
    const since = resolveTimeRange(filters.timeRange);
    const gameType = filters.gameType || undefined;

    // Query aggregated stats
    const aggregated = await this.playerStatsRepo.aggregateByRoom(roomId, memberUserIds, {
      gameType,
      since: since ?? undefined,
    });

    return {
      players: aggregated.map((row) => ({
        userId: row.userId,
        displayName: row.displayName ?? row.username,
        username: row.username,
        wins: row.wins,
        losses: row.losses,
        score: row.score,
        gamesPlayed: row.gamesPlayed,
      })),
    };
  }

  /**
   * Returns aggregated player stats for the authenticated user, with optional breakdown by game type.
   */
  async getPlayerStats(userId: number, filters: StatsQueryParams): Promise<PlayerStatsResponse> {
    const since = resolveTimeRange(filters.timeRange);
    const gameType = filters.gameType || undefined;

    const repoFilters = {
      gameType,
      since: since ?? undefined,
    };

    // Get overall aggregation
    const overall = await this.playerStatsRepo.aggregateByUser(userId, repoFilters);

    // Get breakdown by game type
    const grouped = await this.playerStatsRepo.aggregateByUserGrouped(userId, repoFilters);

    const breakdown: PlayerStatsResponse['breakdown'] = {};
    for (const [type, stats] of grouped) {
      breakdown[type as keyof typeof breakdown] = {
        wins: stats.wins,
        losses: stats.losses,
        score: stats.score,
        gamesPlayed: stats.gamesPlayed,
      };
    }

    return {
      wins: overall.wins,
      losses: overall.losses,
      score: overall.score,
      gamesPlayed: overall.gamesPlayed,
      breakdown: Object.keys(breakdown).length > 0 ? breakdown : undefined,
    };
  }
}
