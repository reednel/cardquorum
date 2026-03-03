# Development Workflow

## Running Tasks

Always use Nx to run tasks. This ensures correct build ordering and caching.

```sh
pnpm nx serve frontend      # Starts both frontend (4200) and backend (3000)
pnpm nx serve backend       # Backend only
pnpm nx build backend       # Production build
pnpm nx build frontend      # Production build
pnpm nx test shared         # Test a single project
pnpm nx run-many -t test    # Test all projects
pnpm nx run-many -t lint    # Lint all projects
pnpm nx run-many -t build   # Build all projects
```

## Dev Servers

- **Frontend:** `http://localhost:4200` (Angular dev server with HMR)
- **Backend:** `http://localhost:3000` (NestJS + Fastify)
- **WebSocket:** `ws://localhost:3000/ws` (proxied through frontend at `ws://localhost:4200/ws`)

The frontend's `serve` target depends on `backend:serve`, so `pnpm nx serve frontend` starts both.

## Environment Variables

Required variables (validated at backend startup via Joi):

| Variable       | Required | Default       | Description                            |
| -------------- | -------- | ------------- | -------------------------------------- |
| `DATABASE_URL` | Yes      | —             | Postgres connection string             |
| `REDIS_URL`    | Yes      | —             | Redis connection string                |
| `LOG_LEVEL`    | No       | `info`        | `debug`, `info`, `warn`, or `error`    |
| `PORT`         | No       | `3000`        | Backend listen port                    |
| `NODE_ENV`     | No       | `development` | `development`, `production`, or `test` |

## Pre-commit Hooks

Husky + lint-staged runs on every commit:

- **Prettier** formats `*.{ts,html,css,json,md}`
- **ESLint** fixes `*.ts`

If a commit is rejected, fix the issues and commit again. Don't skip hooks with `--no-verify`.

## Adding a New Backend Module

1. Create the directory under `apps/backend/src/<module-name>/`.
2. Create `<module-name>.module.ts` with `@Module({})`.
3. Add services, controllers, or gateways as needed.
4. Import the module in `apps/backend/src/app/app.module.ts`.
5. Write tests alongside the source files (e.g. `my.service.spec.ts`).

Global modules (DrizzleModule, RedisModule) are available everywhere without explicit imports.

## Adding Shared Contracts

When building a new feature that touches both frontend and backend:

1. Define types and event constants in `libs/shared/src/lib/`.
2. Export them from `libs/shared/src/index.ts`.
3. Import via `@cardquorum/shared` in both apps.

This ensures the wire protocol is typed end-to-end.

## Adding a Frontend Route

Routes are defined in `apps/frontend/src/app/app.routes.ts`. Use lazy loading:

```ts
{
  path: 'my-feature',
  loadComponent: () => import('./my-feature/my-feature').then(m => m.MyFeature),
}
```

## Frontend Conventions

- All components use `ChangeDetectionStrategy.OnPush`
- State management uses Angular signals (`signal()`, `computed()`)
- Use `input()` / `output()` instead of `@Input()` / `@Output()` decorators
- Use `@for` / `@if` / `@switch` control flow (not structural directives)
- Styling with Tailwind CSS v4

## Testing

Tests use Jest (all projects). Run tests for a specific project:

```sh
pnpm nx test engine
pnpm nx test backend
pnpm nx test shared
```

Backend tests mock infrastructure (Drizzle, Redis) and test business logic directly. The gateway spec instantiates the gateway class with mock dependencies rather than bootstrapping the full NestJS app.
