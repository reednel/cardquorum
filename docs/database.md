# Database

CardQuorum uses PostgreSQL with [Drizzle ORM](https://orm.drizzle.team/) for schema definition, migrations, and queries.

## Schema

Schema files live in `libs/db/src/schema/` and are barrel-exported from `@cardquorum/db`. Drizzle Kit discovers them via the glob in the config.

Current tables:

### `users`

| Column         | Type           | Notes                     |
| -------------- | -------------- | ------------------------- |
| `id`           | `serial`       | PK, auto-increment        |
| `username`     | `varchar(255)` | Not null, unique          |
| `display_name` | `varchar(255)` | Not null                  |
| `email`        | `varchar(255)` | Nullable                  |
| `created_at`   | `timestamptz`  | Not null, default `now()` |
| `updated_at`   | `timestamptz`  | Not null, default `now()` |

### `user_credentials`

| Column       | Type           | Notes                                     |
| ------------ | -------------- | ----------------------------------------- |
| `id`         | `serial`       | PK, auto-increment                        |
| `user_id`    | `integer`      | FK → `users.id`, cascade delete, not null |
| `method`     | `varchar(10)`  | Not null (`'basic'` or `'oidc'`)          |
| `credential` | `varchar(255)` | Not null                                  |
| `created_at` | `timestamptz`  | Not null, default `now()`                 |

**Constraints:** `UNIQUE(user_id, method)`, partial unique index on `credential WHERE method = 'oidc'`

### `rooms`

| Column       | Type           | Notes                                                                  |
| ------------ | -------------- | ---------------------------------------------------------------------- |
| `id`         | `serial`       | PK, auto-increment                                                     |
| `name`       | `varchar(255)` | Not null, unique                                                       |
| `owner_id`   | `integer`      | FK → `users.id`, cascade delete, not null                              |
| `visibility` | `varchar(20)`  | Not null, default `'public'` (`public`, `friends-only`, `invite-only`) |
| `created_at` | `timestamptz`  | Not null, default `now()`                                              |
| `updated_at` | `timestamptz`  | Not null, default `now()`                                              |

### `messages`

| Column                | Type           | Notes                           |
| --------------------- | -------------- | ------------------------------- |
| `id`                  | `serial`       | PK, auto-increment              |
| `room_id`             | `integer`      | FK → `rooms.id`, cascade delete |
| `sender_user_id`      | `integer`      | FK → `users.id`, not null       |
| `sender_display_name` | `varchar(255)` | Not null                        |
| `content`             | `text`         | Not null                        |
| `sent_at`             | `timestamptz`  | Not null, default `now()`       |

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

  async saveMessage(
    roomId: number,
    senderUserId: number,
    senderDisplayName: string,
    content: string,
  ) {
    return this.messages.insert(roomId, senderUserId, senderDisplayName, content);
  }
}
```

Available repositories:

- **`RoomRepository`** — `findById`, `findAll`, `create`, `update`, `delete`
- **`MessageRepository`** — `insert`, `findByRoomId`
- **`UserRepository`** — `findById`, `findByUsername`, `create`
- **`CredentialRepository`** — `findCredentialByUserId`, `findUserByCredential`, `upsertCredential`, `findOrCreateUserByOidc`

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
