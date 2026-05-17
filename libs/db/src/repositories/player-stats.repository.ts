import { and, count, desc, eq, gte, inArray, sql, SQL } from 'drizzle-orm';
import { NewPlayerStat, playerStats, roomRosters, users } from '../schema';
import { DbInstance } from '../types';

export interface AggregatedPlayerStats {
  userId: number;
  displayName: string | null;
  username: string;
  wins: number;
  losses: number;
  score: number;
  gamesPlayed: number;
}

export class PlayerStatsRepository {
  constructor(private readonly db: DbInstance) {}

  async bulkInsert(rows: NewPlayerStat[]): Promise<void> {
    if (rows.length === 0) return;
    await this.db.insert(playerStats).values(rows);
  }

  async aggregateByRoom(
    roomId: number,
    memberUserIds: number[],
    filters: { gameType?: string; since?: Date },
  ): Promise<AggregatedPlayerStats[]> {
    if (memberUserIds.length === 0) return [];

    const conditions: SQL[] = [
      eq(playerStats.roomId, roomId),
      inArray(playerStats.userId, memberUserIds),
    ];

    if (filters.gameType) {
      conditions.push(eq(playerStats.gameType, filters.gameType));
    }

    if (filters.since) {
      conditions.push(gte(playerStats.createdAt, filters.since));
    }

    const rows = await this.db
      .select({
        userId: playerStats.userId,
        displayName: users.displayName,
        username: users.username,
        wins: sql<number>`count(*) filter (where ${playerStats.won} = true)`.as('wins'),
        losses: sql<number>`count(*) filter (where ${playerStats.won} = false)`.as('losses'),
        score: sql<number>`coalesce(sum(${playerStats.scoreDelta}), 0)`.as('score'),
        gamesPlayed: count().as('games_played'),
      })
      .from(playerStats)
      .innerJoin(
        roomRosters,
        and(eq(roomRosters.userId, playerStats.userId), eq(roomRosters.roomId, playerStats.roomId)),
      )
      .innerJoin(users, eq(users.id, playerStats.userId))
      .where(and(...conditions))
      .groupBy(playerStats.userId, users.displayName, users.username)
      .orderBy(desc(sql`coalesce(sum(${playerStats.scoreDelta}), 0)`));

    return rows.map((row) => ({
      userId: row.userId,
      displayName: row.displayName,
      username: row.username,
      wins: Number(row.wins),
      losses: Number(row.losses),
      score: Number(row.score),
      gamesPlayed: Number(row.gamesPlayed),
    }));
  }

  async aggregateByUser(
    userId: number,
    filters: { gameType?: string; since?: Date },
  ): Promise<AggregatedPlayerStats> {
    const conditions: SQL[] = [eq(playerStats.userId, userId)];

    if (filters.gameType) {
      conditions.push(eq(playerStats.gameType, filters.gameType));
    }

    if (filters.since) {
      conditions.push(gte(playerStats.createdAt, filters.since));
    }

    const [row] = await this.db
      .select({
        userId: playerStats.userId,
        wins: sql<number>`count(*) filter (where ${playerStats.won} = true)`.as('wins'),
        losses: sql<number>`count(*) filter (where ${playerStats.won} = false)`.as('losses'),
        score: sql<number>`coalesce(sum(${playerStats.scoreDelta}), 0)`.as('score'),
        gamesPlayed: count().as('games_played'),
      })
      .from(playerStats)
      .where(and(...conditions))
      .groupBy(playerStats.userId);

    if (!row) {
      return {
        userId,
        displayName: null,
        username: '',
        wins: 0,
        losses: 0,
        score: 0,
        gamesPlayed: 0,
      };
    }

    return {
      userId: row.userId,
      displayName: null,
      username: '',
      wins: Number(row.wins),
      losses: Number(row.losses),
      score: Number(row.score),
      gamesPlayed: Number(row.gamesPlayed),
    };
  }

  async aggregateByUserGrouped(
    userId: number,
    filters: { gameType?: string; since?: Date },
  ): Promise<Map<string, AggregatedPlayerStats>> {
    const conditions: SQL[] = [eq(playerStats.userId, userId)];

    if (filters.gameType) {
      conditions.push(eq(playerStats.gameType, filters.gameType));
    }

    if (filters.since) {
      conditions.push(gte(playerStats.createdAt, filters.since));
    }

    const rows = await this.db
      .select({
        userId: playerStats.userId,
        gameType: playerStats.gameType,
        wins: sql<number>`count(*) filter (where ${playerStats.won} = true)`.as('wins'),
        losses: sql<number>`count(*) filter (where ${playerStats.won} = false)`.as('losses'),
        score: sql<number>`coalesce(sum(${playerStats.scoreDelta}), 0)`.as('score'),
        gamesPlayed: count().as('games_played'),
      })
      .from(playerStats)
      .where(and(...conditions))
      .groupBy(playerStats.userId, playerStats.gameType);

    const result = new Map<string, AggregatedPlayerStats>();

    for (const row of rows) {
      result.set(row.gameType, {
        userId: row.userId,
        displayName: null,
        username: '',
        wins: Number(row.wins),
        losses: Number(row.losses),
        score: Number(row.score),
        gamesPlayed: Number(row.gamesPlayed),
      });
    }

    return result;
  }
}
