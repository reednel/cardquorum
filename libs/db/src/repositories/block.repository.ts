import { and, eq } from 'drizzle-orm';
import { blocks, users } from '../schema';
import { DbInstance } from '../types';

export class BlockRepository {
  constructor(private readonly db: DbInstance) {}

  async create(blockerId: number, blockedId: number) {
    const [row] = await this.db.insert(blocks).values({ blockerId, blockedId }).returning();
    return row;
  }

  async deleteByBlockerAndBlocked(blockerId: number, blockedId: number) {
    const [row] = await this.db
      .delete(blocks)
      .where(and(eq(blocks.blockerId, blockerId), eq(blocks.blockedId, blockedId)))
      .returning({ id: blocks.id });
    return row ?? null;
  }

  async findByBlocker(blockerId: number) {
    return this.db
      .select({
        id: blocks.id,
        blockedId: blocks.blockedId,
        createdAt: blocks.createdAt,
        blockedUsername: users.username,
        blockedDisplayName: users.displayName,
      })
      .from(blocks)
      .innerJoin(users, eq(blocks.blockedId, users.id))
      .where(eq(blocks.blockerId, blockerId));
  }

  async findBlockedIds(blockerId: number): Promise<number[]> {
    const rows = await this.db
      .select({ blockedId: blocks.blockedId })
      .from(blocks)
      .where(eq(blocks.blockerId, blockerId));
    return rows.map((r) => r.blockedId);
  }

  async isBlocked(blockerId: number, blockedId: number): Promise<boolean> {
    const rows = await this.db
      .select({ id: blocks.id })
      .from(blocks)
      .where(and(eq(blocks.blockerId, blockerId), eq(blocks.blockedId, blockedId)))
      .limit(1);
    return rows.length > 0;
  }
}
