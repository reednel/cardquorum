import { eq } from 'drizzle-orm';
import { users } from '../schema';
import { DbInstance } from '../types';

export class UserRepository {
  constructor(private readonly db: DbInstance) {}

  async findById(id: number) {
    const rows = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    return rows[0] ?? null;
  }

  async findByUsername(username: string) {
    const rows = await this.db.select().from(users).where(eq(users.username, username)).limit(1);
    return rows[0] ?? null;
  }

  async create(data: { username: string; displayName: string; email?: string }) {
    const [row] = await this.db.insert(users).values(data).returning();
    return row;
  }
}
