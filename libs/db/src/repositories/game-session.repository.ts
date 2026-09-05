import { and, asc, desc, eq, gt, inArray, lt, or, SQL } from 'drizzle-orm';
import { gameParticipants, gameSessions, rooms } from '../schema';
import { DbInstance } from '../types';

export class GameSessionRepository {
  constructor(private readonly db: DbInstance) {}

  async findById(sessionId: number) {
    const rows = await this.db
      .select()
      .from(gameSessions)
      .where(eq(gameSessions.id, sessionId))
      .limit(1);
    return rows[0] ?? null;
  }

  async findByRoomId(roomId: number) {
    return this.db.select().from(gameSessions).where(eq(gameSessions.roomId, roomId));
  }

  async create(data: { roomId: number; gameType: string; config?: unknown; variant?: string }) {
    const [row] = await this.db.insert(gameSessions).values(data).returning();
    return row;
  }

  async updateStore(sessionId: number, store: unknown) {
    const [row] = await this.db
      .update(gameSessions)
      .set({ store })
      .where(eq(gameSessions.id, sessionId))
      .returning();
    return row;
  }

  async updateStatus(sessionId: number, status: string) {
    const [row] = await this.db
      .update(gameSessions)
      .set({ status })
      .where(eq(gameSessions.id, sessionId))
      .returning();
    return row;
  }

  async updateStatusAndTimestamp(
    sessionId: number,
    status: string,
    timestampField: 'startedAt' | 'finishedAt',
  ) {
    const [row] = await this.db
      .update(gameSessions)
      .set({ status, [timestampField]: new Date() })
      .where(eq(gameSessions.id, sessionId))
      .returning();
    return row;
  }

  async findByUserIdPaginated(
    userId: number,
    options: {
      statuses: string[];
      gameType?: string;
      cursor?: string;
      limit: number;
      sortDirection: 'asc' | 'desc';
    },
  ): Promise<{
    sessions: {
      id: number;
      roomId: number | null;
      gameType: string;
      status: string;
      config: unknown;
      store: unknown;
      startedAt: Date | null;
      finishedAt: Date | null;
      createdAt: Date;
      roomName: string | null;
    }[];
    nextCursor: string | null;
  }> {
    const { statuses, gameType, cursor, limit, sortDirection } = options;

    const conditions: SQL[] = [eq(gameParticipants.userId, userId)];

    if (statuses.length > 0) {
      conditions.push(inArray(gameSessions.status, statuses));
    }

    if (gameType) {
      conditions.push(eq(gameSessions.gameType, gameType));
    }

    if (cursor) {
      const decoded = this.decodeCursor(cursor);
      if (decoded) {
        const { startedAt, id } = decoded;
        // For descending: get rows where (startedAt < cursor) OR (startedAt = cursor AND id < cursorId)
        // For ascending: get rows where (startedAt > cursor) OR (startedAt = cursor AND id > cursorId)
        // If startedAt is null (session never started), cursor-based pagination is not applicable.
        if (startedAt !== null) {
          if (sortDirection === 'desc') {
            conditions.push(
              or(
                lt(gameSessions.startedAt, startedAt),
                and(eq(gameSessions.startedAt, startedAt), lt(gameSessions.id, id))!,
              )!,
            );
          } else {
            conditions.push(
              or(
                gt(gameSessions.startedAt, startedAt),
                and(eq(gameSessions.startedAt, startedAt), gt(gameSessions.id, id))!,
              )!,
            );
          }
        }
      }
    }

    const orderBy =
      sortDirection === 'desc'
        ? [desc(gameSessions.startedAt), desc(gameSessions.id)]
        : [asc(gameSessions.startedAt), asc(gameSessions.id)];

    const rows = await this.db
      .select({
        id: gameSessions.id,
        roomId: gameSessions.roomId,
        gameType: gameSessions.gameType,
        status: gameSessions.status,
        config: gameSessions.config,
        store: gameSessions.store,
        startedAt: gameSessions.startedAt,
        finishedAt: gameSessions.finishedAt,
        createdAt: gameSessions.createdAt,
        roomName: rooms.name,
      })
      .from(gameSessions)
      .innerJoin(gameParticipants, eq(gameSessions.id, gameParticipants.sessionId))
      .leftJoin(rooms, eq(gameSessions.roomId, rooms.id))
      .where(and(...conditions))
      .orderBy(...orderBy)
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const sessions = hasMore ? rows.slice(0, limit) : rows;

    let nextCursor: string | null = null;
    if (hasMore && sessions.length > 0) {
      const lastSession = sessions[sessions.length - 1];
      nextCursor = this.encodeCursor(lastSession.startedAt, lastSession.id);
    }

    return { sessions, nextCursor };
  }

  private encodeCursor(startedAt: Date | null, id: number): string {
    const timestamp = startedAt ? startedAt.toISOString() : '';
    return Buffer.from(`${timestamp}|${id}`).toString('base64');
  }

  private decodeCursor(cursor: string): { startedAt: Date | null; id: number } | null {
    try {
      const decoded = Buffer.from(cursor, 'base64').toString('utf-8');
      const separatorIndex = decoded.lastIndexOf('|');
      if (separatorIndex === -1) return null;

      const timestampStr = decoded.slice(0, separatorIndex);
      const idStr = decoded.slice(separatorIndex + 1);
      const id = parseInt(idStr, 10);
      if (isNaN(id)) return null;

      const startedAt = timestampStr ? new Date(timestampStr) : null;
      if (startedAt && isNaN(startedAt.getTime())) return null;

      return { startedAt, id };
    } catch {
      return null;
    }
  }
}
