# Database

CardQuorum uses PostgreSQL with [Drizzle ORM](https://orm.drizzle.team/) for schema definition, migrations, and queries.

## Schema

Schema files live in `libs/db/src/schema/` and are barrel-exported from `@cardquorum/db`. Drizzle Kit discovers them via the glob in the config.

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

Located at `libs/db/drizzle.config.ts` (run from repo root). Reads `DATABASE_URL` from the environment.

```ts
schema: './libs/db/src/schema/*.ts';
out: './libs/db/migrations';
```

## Repositories

All database query logic lives behind repository classes in `libs/db/src/repositories/`. Services instantiate repositories with the Drizzle db instance:

```ts
import { Inject, Injectable } from '@nestjs/common';
import { MessageRepository } from '@cardquorum/db';
import { DRIZZLE } from '../drizzle/drizzle.module';

@Injectable()
export class ChatService {
  private readonly messages: MessageRepository;

  constructor(@Inject(DRIZZLE) db: any) {
    this.messages = new MessageRepository(db);
  }

  async saveMessage(roomId: string, senderUserId: string, senderNickname: string, content: string) {
    return this.messages.insert(roomId, senderUserId, senderNickname, content);
  }
}
```

Available repositories:

- **`RoomRepository`** — `findById`, `create`, `ensureExists`
- **`MessageRepository`** — `insert`, `findByRoomId`

## Common Operations

### Adding or modifying a table

1. Create or edit a file in `libs/db/src/schema/`.
2. Export it from `schema/index.ts`.
3. Generate a migration:

   ```sh
   pnpm drizzle-kit generate --config ./libs/db/drizzle.config.ts --name describe-your-change
   ```

4. Inspect the generated SQL in `libs/db/migrations/`. Drizzle Kit generates one SQL file per migration.
5. Apply it:

   ```sh
   pnpm drizzle-kit migrate --config ./libs/db/drizzle.config.ts
   ```

### Checking migration status

```sh
pnpm drizzle-kit check --config ./libs/db/drizzle.config.ts
```

### Resetting the dev database

The fastest way is to tear down and recreate the Docker volume:

```sh
docker compose -f compose.dev.yml down -v
docker compose -f compose.dev.yml up -d
pnpm drizzle-kit migrate --config ./libs/db/drizzle.config.ts
```
