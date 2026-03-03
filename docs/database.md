# Database

CardQuorum uses PostgreSQL with [Drizzle ORM](https://orm.drizzle.team/) for schema definition, migrations, and queries.

## Schema

Schema files live in `apps/backend/src/drizzle/schema/` and are barrel-exported from `schema/index.ts`. Drizzle Kit discovers them via the glob in the config.

Current tables:

### `rooms`

| Column       | Type           | Notes                           |
| ------------ | -------------- | ------------------------------- |
| `id`         | `uuid`         | PK, default `gen_random_uuid()` |
| `name`       | `varchar(255)` | Not null                        |
| `created_at` | `timestamptz`  | Not null, default `now()`       |

### `messages`

| Column            | Type           | Notes                           |
| ----------------- | -------------- | ------------------------------- |
| `id`              | `uuid`         | PK, default `gen_random_uuid()` |
| `room_id`         | `uuid`         | FK → `rooms.id`, cascade delete |
| `sender_user_id`  | `uuid`         | Not null                        |
| `sender_nickname` | `varchar(255)` | Not null                        |
| `content`         | `text`         | Not null                        |
| `sent_at`         | `timestamptz`  | Not null, default `now()`       |

## Drizzle Kit Config

Located at `apps/backend/drizzle.config.ts` (run from repo root). Reads `DATABASE_URL` from the environment.

```ts
schema: './apps/backend/src/drizzle/schema/*.ts';
out: './apps/backend/drizzle/migrations';
```

## Common Operations

### Adding or modifying a table

1. Create or edit a file in `apps/backend/src/drizzle/schema/`.
2. Export it from `schema/index.ts`.
3. Generate a migration:

   ```sh
   pnpm drizzle-kit generate --config ./apps/backend/drizzle.config.ts --name describe-your-change
   ```

4. Inspect the generated SQL in `apps/backend/drizzle/migrations/`. Drizzle Kit generates one SQL file per migration.
5. Apply it:

   ```sh
   pnpm drizzle-kit migrate --config ./apps/backend/drizzle.config.ts
   ```

### Checking migration status

```sh
pnpm drizzle-kit check --config ./apps/backend/drizzle.config.ts
```

### Resetting the dev database

The fastest way is to tear down and recreate the Docker volume:

```sh
docker compose -f compose.dev.yml down -v
docker compose -f compose.dev.yml up -d
pnpm drizzle-kit migrate --config ./apps/backend/drizzle.config.ts
```

### Using the Drizzle instance in services

Inject the `DRIZZLE` token:

```ts
import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE } from '../drizzle/drizzle.module';
import { rooms } from '../drizzle/schema';

@Injectable()
export class MyService {
  constructor(@Inject(DRIZZLE) private readonly db: any) {}

  async findRoom(id: string) {
    return this.db.select().from(rooms).where(eq(rooms.id, id));
  }
}
```

The Drizzle module is global, so no need to import it in your feature module.
