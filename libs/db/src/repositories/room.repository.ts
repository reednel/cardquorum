import { and, count, desc, eq, ilike, inArray, ne, notInArray, or, sql } from 'drizzle-orm';
import { roomRosters, rooms, users } from '../schema';
import { DbInstance } from '../types';

export class RoomRepository {
  constructor(private readonly db: DbInstance) {}

  async findById(roomId: number) {
    const rows = await this.db
      .select({
        id: rooms.id,
        name: rooms.name,
        description: rooms.description,
        ownerId: rooms.ownerId,
        ownerDisplayName: users.displayName,
        ownerUsername: users.username,
        visibility: rooms.visibility,
        memberLimit: rooms.memberLimit,
        rotationMode: rooms.rotationMode,
        createdAt: rooms.createdAt,
        updatedAt: rooms.updatedAt,
      })
      .from(rooms)
      .innerJoin(users, eq(rooms.ownerId, users.id))
      .where(eq(rooms.id, roomId))
      .limit(1);
    return rows[0] ?? null;
  }

  async findAll(visibility?: string) {
    const query = this.db
      .select({
        id: rooms.id,
        name: rooms.name,
        description: rooms.description,
        ownerId: rooms.ownerId,
        ownerDisplayName: users.displayName,
        ownerUsername: users.username,
        visibility: rooms.visibility,
        memberLimit: rooms.memberLimit,
        createdAt: rooms.createdAt,
        updatedAt: rooms.updatedAt,
      })
      .from(rooms)
      .innerJoin(users, eq(rooms.ownerId, users.id));

    if (visibility) {
      return query.where(eq(rooms.visibility, visibility));
    }
    return query;
  }

  async create(
    name: string,
    ownerId: number,
    visibility = 'public',
    memberLimit?: number | null,
    description?: string | null,
  ) {
    const values: {
      name: string;
      ownerId: number;
      visibility: string;
      memberLimit?: number | null;
      description?: string | null;
    } = {
      name,
      ownerId,
      visibility,
    };
    if (memberLimit != null && memberLimit > 0) {
      values.memberLimit = memberLimit;
    }
    if (description !== undefined) {
      values.description = description;
    }
    const [row] = await this.db.insert(rooms).values(values).returning();
    return row;
  }

  async update(
    roomId: number,
    fields: {
      name?: string;
      visibility?: string;
      rotationMode?: string;
      description?: string | null;
    },
  ) {
    const [row] = await this.db
      .update(rooms)
      .set({ ...fields, updatedAt: sql`now()` })
      .where(eq(rooms.id, roomId))
      .returning();
    return row ?? null;
  }

  async delete(roomId: number) {
    const [row] = await this.db
      .delete(rooms)
      .where(eq(rooms.id, roomId))
      .returning({ id: rooms.id });
    return row ?? null;
  }

  async findIdsByOwner(ownerId: number): Promise<number[]> {
    const rows = await this.db
      .select({ id: rooms.id })
      .from(rooms)
      .where(eq(rooms.ownerId, ownerId));
    return rows.map((r) => r.id);
  }

  async deleteByOwner(ownerId: number) {
    return this.db.delete(rooms).where(eq(rooms.ownerId, ownerId)).returning({ id: rooms.id });
  }

  async findMemberships(userId: number) {
    return this.db
      .select({
        id: rooms.id,
        name: rooms.name,
        description: rooms.description,
        ownerId: rooms.ownerId,
        ownerDisplayName: users.displayName,
        ownerUsername: users.username,
        visibility: rooms.visibility,
        memberLimit: rooms.memberLimit,
        createdAt: rooms.createdAt,
        updatedAt: rooms.updatedAt,
      })
      .from(roomRosters)
      .innerJoin(rooms, eq(roomRosters.roomId, rooms.id))
      .innerJoin(users, eq(rooms.ownerId, users.id))
      .where(eq(roomRosters.userId, userId))
      .orderBy(desc(roomRosters.lastVisitedAt));
  }

  async findDiscoverablePublic(
    userId: number,
    bannedRoomIds: number[],
    blockedIds: number[],
    rosteredRoomIds: number[],
    offset: number,
    limit: number,
  ): Promise<{ rooms: Awaited<ReturnType<RoomRepository['findAll']>>; total: number }> {
    const conditions = [eq(rooms.visibility, 'public'), ne(rooms.ownerId, userId)];

    const excludedRoomIds = [...new Set([...bannedRoomIds, ...rosteredRoomIds])];
    if (excludedRoomIds.length > 0) {
      conditions.push(notInArray(rooms.id, excludedRoomIds));
    }
    if (blockedIds.length > 0) {
      conditions.push(notInArray(rooms.ownerId, blockedIds));
    }

    const where = and(...conditions)!;

    const [countResult, data] = await Promise.all([
      this.db.select({ count: count() }).from(rooms).where(where),
      this.db
        .select({
          id: rooms.id,
          name: rooms.name,
          description: rooms.description,
          ownerId: rooms.ownerId,
          ownerDisplayName: users.displayName,
          ownerUsername: users.username,
          visibility: rooms.visibility,
          memberLimit: rooms.memberLimit,
          createdAt: rooms.createdAt,
          updatedAt: rooms.updatedAt,
        })
        .from(rooms)
        .innerJoin(users, eq(rooms.ownerId, users.id))
        .where(where)
        .orderBy(desc(rooms.createdAt))
        .offset(offset)
        .limit(limit),
    ]);

    return { rooms: data, total: countResult[0]?.count ?? 0 };
  }

  async findDiscoverablePrivate(
    userId: number,
    friendIds: number[],
    invitedRoomIds: number[],
    bannedRoomIds: number[],
    blockedIds: number[],
    rosteredRoomIds: number[],
  ) {
    // Build the visibility conditions:
    // friends-only rooms where owner is a friend, OR invite-only rooms where user is invited
    const visibilityConditions: ReturnType<typeof eq>[] = [];

    if (friendIds.length > 0) {
      visibilityConditions.push(
        and(eq(rooms.visibility, 'friends-only'), inArray(rooms.ownerId, friendIds))!,
      );
    }
    if (invitedRoomIds.length > 0) {
      visibilityConditions.push(
        and(eq(rooms.visibility, 'invite-only'), inArray(rooms.id, invitedRoomIds))!,
      );
    }

    // If no friends and no invites, no private rooms are discoverable
    if (visibilityConditions.length === 0) {
      return [];
    }

    const conditions = [or(...visibilityConditions)!];

    // Exclude rooms the user owns (they'd be on the roster already typically)
    conditions.push(ne(rooms.ownerId, userId));

    const excludedRoomIds = [...new Set([...bannedRoomIds, ...rosteredRoomIds])];
    if (excludedRoomIds.length > 0) {
      conditions.push(notInArray(rooms.id, excludedRoomIds));
    }
    if (blockedIds.length > 0) {
      conditions.push(notInArray(rooms.ownerId, blockedIds));
    }

    return this.db
      .select({
        id: rooms.id,
        name: rooms.name,
        description: rooms.description,
        ownerId: rooms.ownerId,
        ownerDisplayName: users.displayName,
        ownerUsername: users.username,
        visibility: rooms.visibility,
        memberLimit: rooms.memberLimit,
        createdAt: rooms.createdAt,
        updatedAt: rooms.updatedAt,
      })
      .from(rooms)
      .innerJoin(users, eq(rooms.ownerId, users.id))
      .where(and(...conditions))
      .orderBy(desc(rooms.createdAt));
  }

  async searchDiscoverable(
    userId: number,
    query: string,
    friendIds: number[],
    invitedRoomIds: number[],
    bannedRoomIds: number[],
    blockedIds: number[],
    rosteredRoomIds: number[],
  ) {
    const escaped = query.replace(/[%_]/g, '\\$&');

    // Build visibility filter: public OR (friends-only with friend owner) OR (invite-only with invite)
    const visibilityConditions: ReturnType<typeof eq>[] = [eq(rooms.visibility, 'public')];

    if (friendIds.length > 0) {
      visibilityConditions.push(
        and(eq(rooms.visibility, 'friends-only'), inArray(rooms.ownerId, friendIds))!,
      );
    }
    if (invitedRoomIds.length > 0) {
      visibilityConditions.push(
        and(eq(rooms.visibility, 'invite-only'), inArray(rooms.id, invitedRoomIds))!,
      );
    }

    const conditions = [
      or(...visibilityConditions)!,
      ilike(rooms.name, `%${escaped}%`),
      ne(rooms.ownerId, userId),
    ];

    const excludedRoomIds = [...new Set([...bannedRoomIds, ...rosteredRoomIds])];
    if (excludedRoomIds.length > 0) {
      conditions.push(notInArray(rooms.id, excludedRoomIds));
    }
    if (blockedIds.length > 0) {
      conditions.push(notInArray(rooms.ownerId, blockedIds));
    }

    return this.db
      .select({
        id: rooms.id,
        name: rooms.name,
        description: rooms.description,
        ownerId: rooms.ownerId,
        ownerDisplayName: users.displayName,
        ownerUsername: users.username,
        visibility: rooms.visibility,
        memberLimit: rooms.memberLimit,
        createdAt: rooms.createdAt,
        updatedAt: rooms.updatedAt,
      })
      .from(rooms)
      .innerJoin(users, eq(rooms.ownerId, users.id))
      .where(and(...conditions))
      .orderBy(desc(rooms.createdAt));
  }
}
