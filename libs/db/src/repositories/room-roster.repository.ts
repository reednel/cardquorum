import { and, asc, count, eq, sql } from 'drizzle-orm';
import { roomRosters, rooms, users } from '../schema';
import { DbInstance } from '../types';

export type RosterSection = 'players' | 'spectators';

export interface RosterMember {
  userId: number;
  username: string;
  displayName: string | null;
  section: RosterSection;
  position: number;
  assignedHue: number | null;
}

export class RoomRosterRepository {
  constructor(private readonly db: DbInstance) {}

  async findByRoom(roomId: number): Promise<RosterMember[]> {
    const rows = await this.db
      .select({
        userId: roomRosters.userId,
        username: users.username,
        displayName: users.displayName,
        section: roomRosters.section,
        position: roomRosters.position,
        assignedHue: roomRosters.assignedHue,
      })
      .from(roomRosters)
      .innerJoin(users, eq(roomRosters.userId, users.id))
      .where(eq(roomRosters.roomId, roomId))
      .orderBy(asc(roomRosters.section), asc(roomRosters.position));

    return rows as RosterMember[];
  }

  async addMember(
    roomId: number,
    userId: number,
    section: RosterSection,
    position: number,
  ): Promise<void> {
    await this.db.insert(roomRosters).values({ roomId, userId, section, position });
  }

  async removeMember(roomId: number, userId: number): Promise<boolean> {
    const rows = await this.db
      .delete(roomRosters)
      .where(and(eq(roomRosters.roomId, roomId), eq(roomRosters.userId, userId)))
      .returning({ id: roomRosters.id });
    return rows.length > 0;
  }

  async replaceRoster(roomId: number, players: number[], spectators: number[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      // Delete all existing roster entries for this room
      await tx.delete(roomRosters).where(eq(roomRosters.roomId, roomId));

      // Insert players
      const values = [
        ...players.map((userId, index) => ({
          roomId,
          userId,
          section: 'players' as const,
          position: index,
        })),
        ...spectators.map((userId, index) => ({
          roomId,
          userId,
          section: 'spectators' as const,
          position: index,
        })),
      ];

      if (values.length > 0) {
        await tx.insert(roomRosters).values(values);
      }
    });
  }

  async countMembers(roomId: number): Promise<number> {
    const [row] = await this.db
      .select({ count: count() })
      .from(roomRosters)
      .where(eq(roomRosters.roomId, roomId));
    return row?.count ?? 0;
  }

  async isMember(roomId: number, userId: number): Promise<boolean> {
    const rows = await this.db
      .select({ id: roomRosters.id })
      .from(roomRosters)
      .where(and(eq(roomRosters.roomId, roomId), eq(roomRosters.userId, userId)))
      .limit(1);
    return rows.length > 0;
  }

  async getRotatePlayers(roomId: number): Promise<boolean> {
    const [row] = await this.db
      .select({ rotatePlayers: rooms.rotatePlayers })
      .from(rooms)
      .where(eq(rooms.id, roomId))
      .limit(1);
    return row?.rotatePlayers ?? false;
  }

  async setRotatePlayers(roomId: number, enabled: boolean): Promise<void> {
    await this.db.update(rooms).set({ rotatePlayers: enabled }).where(eq(rooms.id, roomId));
  }

  async getAssignedHues(
    roomId: number,
  ): Promise<Array<{ userId: number; assignedHue: number | null }>> {
    const rows = await this.db
      .select({
        userId: roomRosters.userId,
        assignedHue: roomRosters.assignedHue,
      })
      .from(roomRosters)
      .where(eq(roomRosters.roomId, roomId));

    return rows;
  }

  async setAssignedHue(roomId: number, userId: number, hue: number): Promise<void> {
    await this.db
      .update(roomRosters)
      .set({ assignedHue: hue })
      .where(and(eq(roomRosters.roomId, roomId), eq(roomRosters.userId, userId)));
  }

  async updateLastVisitedAt(roomId: number, userId: number): Promise<void> {
    await this.db
      .update(roomRosters)
      .set({ lastVisitedAt: sql`now()` })
      .where(and(eq(roomRosters.roomId, roomId), eq(roomRosters.userId, userId)));
  }

  async findRosteredRoomIds(userId: number): Promise<number[]> {
    const rows = await this.db
      .select({ roomId: roomRosters.roomId })
      .from(roomRosters)
      .where(eq(roomRosters.userId, userId));
    return rows.map((r) => r.roomId);
  }
}
