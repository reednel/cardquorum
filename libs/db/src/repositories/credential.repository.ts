import { randomBytes } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { userCredentials, users } from '../schema';
import { DbInstance } from '../types';

export class CredentialRepository {
  constructor(private readonly db: DbInstance) {}

  async findCredentialByUserId(userId: number, method: string): Promise<string | null> {
    const rows = await this.db
      .select({ credential: userCredentials.credential })
      .from(userCredentials)
      .where(and(eq(userCredentials.userId, userId), eq(userCredentials.method, method)))
      .limit(1);
    return rows[0]?.credential ?? null;
  }

  async findUserByCredential(method: string, credential: string) {
    const rows = await this.db
      .select({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        email: users.email,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(userCredentials)
      .innerJoin(users, eq(userCredentials.userId, users.id))
      .where(
        and(
          eq(userCredentials.method, method),
          eq(userCredentials.credential, credential),
          isNull(users.deletedAt),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  async upsertCredential(userId: number, method: string, credential: string) {
    const [row] = await this.db
      .insert(userCredentials)
      .values({ userId, method, credential })
      .onConflictDoUpdate({
        target: [userCredentials.userId, userCredentials.method],
        set: { credential },
      })
      .returning();
    return row;
  }

  async findOrCreateUserByOidc(oidcSubject: string, displayName: string) {
    const existing = await this.findUserByCredential('oidc', oidcSubject);
    if (existing) return existing;

    const username = await this.generateUniqueUsername();

    const [user] = await this.db.insert(users).values({ username, displayName }).returning();

    await this.db
      .insert(userCredentials)
      .values({ userId: user.id, method: 'oidc', credential: oidcSubject });

    return user;
  }

  private async generateUniqueUsername(): Promise<string> {
    for (let i = 0; i < 10; i++) {
      const candidate = 'user_' + randomBytes(4).toString('hex');
      const rows = await this.db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.username, candidate))
        .limit(1);
      if (rows.length === 0) return candidate;
    }
    throw new Error('Failed to generate unique username');
  }

  async deleteAllByUserId(userId: number) {
    await this.db.delete(userCredentials).where(eq(userCredentials.userId, userId));
  }

  async insertCredential(userId: number, method: string, credential: string) {
    const [row] = await this.db
      .insert(userCredentials)
      .values({ userId, method, credential })
      .returning();
    return row;
  }

  async findMethodsByUserId(userId: number): Promise<string[]> {
    const rows = await this.db
      .select({ method: userCredentials.method })
      .from(userCredentials)
      .where(eq(userCredentials.userId, userId));
    return rows.map((r) => r.method);
  }

  async deleteByUserIdAndMethod(userId: number, method: string) {
    await this.db
      .delete(userCredentials)
      .where(and(eq(userCredentials.userId, userId), eq(userCredentials.method, method)));
  }
}
