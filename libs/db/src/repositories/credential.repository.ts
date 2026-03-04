import { eq, and } from 'drizzle-orm';
import { users, userCredentials } from '../schema';
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
      .where(and(eq(userCredentials.method, method), eq(userCredentials.credential, credential)))
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

    const [user] = await this.db
      .insert(users)
      .values({ username: oidcSubject, displayName })
      .returning();

    await this.db
      .insert(userCredentials)
      .values({ userId: user.id, method: 'oidc', credential: oidcSubject });

    return user;
  }
}
