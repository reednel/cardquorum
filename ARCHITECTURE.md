# CardQuorum — Architecture Overview

## What This Is

A generic, FOSS, self-hostable card game engine. Games (Sheepshead, Go Fish, etc.) are implemented as plugins that conform to a shared interface. The engine handles all infrastructure: rooms, lobbies, player management, WebSockets, auth, chat. Plugins handle game-specific rules, state transitions, valid moves, and what each player is allowed to see.

Angular is zoneless (Angular 17+ signals). All state management should use signals and computed() rather than RxJS where possible.

Plugin Architecture

## Auth

Backend validates OIDC JWTs using the jose library against the provider's JWKS endpoint. The application code is provider-agnostic — swapping Authentik for another provider is a config change. Frontend uses angular-oauth2-oidc or a provider SDK.

Authentik is the default self-hosted provider. No passwords or custom auth flows are implemented in this codebase.

## Development Principles

- Careful over fast. Design before code. Understand every file before moving on.
- Tests alongside code.
- Sheepshead rules arevdeterministic. Write tests before or with implementation, not after.
- Explicit contracts first. WebSocket event shapes and API contracts should be defined in libs/shared/ before either end implements them.
- Small reviewable units. One component, one service, one route at a time.

## Tech Stack

- Frontend: Angular 21
- Styling: Tailwind
- Frontend testing: Jest
- PWA: @angular/pwa
- Backend: NestJS (architecture) + Fastify adapter (HTTP) + ws (WebSockets)
- Monorepo: Nx 22
- Package Manager: PNPM
- Database: PostgreSQL + Redis
- Auth: OIDC support
- ORM: Drizzle

## Deployment & Containerization

The application ships as 3 containers managed by Docker Compose:

- app — single image containing the Angular SPA (served as static files by NestJS via @nestjs/serve-static) and the NestJS backend
- postgres — official Postgres 17 image, volume-mounted data
- redis — official Redis 7 Alpine image, volume-mounted data

The app image is built with a multi-stage Dockerfile: Angular and NestJS are built separately in intermediate stages, then only the compiled output is copied into the final production image.

Developer environment: A separate compose.dev.yml runs only Postgres and Redis as containers. The Angular and NestJS apps run natively with hot reload (nx run frontend:serve, nx run backend:serve). No local Postgres or Redis installation required.

Self-hoster experience: docker compose up with a handful of environment variables (database URL, Redis URL, OIDC issuer). No other dependencies.

## CI/CD

### Platform: GitHub Actions (free for public repos, Nx integration built in)

Key concept: nx affected — Nx understands the project dependency graph and only runs tasks for projects touched by a given change. CI stays fast as the monorepo grows.

### Pipeline

#### On every PR

1. Prettier format check — enforces consistent style on AI-generated code
2. ESLint — catches real bugs, enforces Angular/Node patterns
3. TypeScript type check (tsc --noEmit) — first line of defense against plausible-but-broken AI-generated code
4. Unit tests (nx affected --target=test) with coverage report
5. Build verification (nx affected --target=build)
6. npm audit --audit-level=high — fail on new high-severity CVEs

#### On merge to main (everything above, plus)

7. Integration tests — GitHub Actions service containers spin up real Postgres and Redis; covers DB queries, migrations, Redis
   pub/sub, WebSocket lifecycle
8. E2E tests (Playwright) — critical game flows: create room, join room, complete a hand
9. Docker build verification — confirm the multi-stage production image builds and starts

#### Scheduled

10. CodeQL static analysis — catches OWASP-class vulnerabilities (SQL injection, XSS, etc.); free for public repos; especially
    valuable as a check on AI-generated code
11. Renovate — automated dependency update PRs, monorepo-aware

### Pre-Commit Hooks

Husky + lint-staged: Prettier and ESLint run locally on staged files before every commit. Catches common issues before they reach CI.

### Coverage Thresholds

- libs/games/sheepshead - 90% minimum
- libs/engine - 80% minimum
- apps/backend - 70% minimum
- apps/frontend - 60% minimum

Game logic gets the highest threshold — Sheepshead rules are deterministic and edge cases are easy to miss and hard to debug in play.

### Property-Based Testing

fast-check for game logic in libs/games/sheepshead. Describe invariants ("valid move always produces valid state", "scores always sum to zero"), let the library generate hundreds of random inputs to break them. Catches edge cases no human would think to write.

### Branch Protection (main)

Require PR before merging, all status checks must pass, at least one approval, stale reviews dismissed on new commits.

## Environment Configuration

Angular is a SPA with no runtime access to environment variables — values are baked into the bundle at build time. For a self-hosted app this is a problem: if the OIDC issuer URL or API endpoint is build-time, every self-hoster must rebuild the image for their deployment.

Solution: runtime config. NestJS exposes a /api/config endpoint returning public (non-secret) config. Angular fetches it via APP_INITIALIZER before bootstrapping. The Docker image is portable across deployments without rebuilding.

### NestJS Config

@nestjs/config with Joi validation schema. Validates all required variables at startup and refuses to start if any are missing or malformed — fail fast rather than crash mid-request.

## Logging & Health Checks

### Logging

Library: nestjs-pino — Pino is Fastify's native logger; nestjs-pino integrates it with NestJS's standard Logger interface.

Format:

- Development: human-readable via pino-pretty
- Production: JSON to stdout/stderr only — never write to files inside the container; Docker captures stdout, and it's the self-hoster's responsibility to route logs to their preferred aggregator

LOG_LEVEL is an env var (add to .env.template).

Correlation IDs: Each HTTP request and WebSocket connection gets a unique ID included in every log line for that request. Fastify assigns these automatically; nestjs-pino wires them through.

What to log: HTTP requests (automatic), WebSocket lifecycle (connect/disconnect/room join/leave), game lifecycle (started/ended/abnormal termination), auth events, errors with stack traces, app startup/shutdown.

What not to log: Request bodies, game moves, chat content, tokens, secrets, or any PII.

### Health Checks

Library: @nestjs/terminus — standard NestJS health check package.

Endpoint: GET /healthz — returns 200 when healthy, 503 when not, with a JSON body describing each indicator. Used in the Dockerfile HEALTHCHECK directive and in compose.yml to gate the app container behind depends_on: condition: service_healthy for Postgres and Redis.

Checks: database connectivity, Redis connectivity.

#### Graceful Shutdown

NestJS OnApplicationShutdown lifecycle hooks handle SIGTERM from Docker. On shutdown: stop accepting new WebSocket connections, notify connected players, finish in-flight database writes, close the connection pool cleanly.

#### Decisions

- Logging library — nestjs-pino
- Dev log format — pino-pretty
- Prod log format — JSON to stdout
- Log level control — LOG_LEVEL env var
- Correlation IDs — yes, via Fastify request ID
- Health check library — @nestjs/terminus
- Health endpoint — GET /healthz
- Health indicators — database connectivity, Redis connectivity
- Graceful shutdown — NestJS lifecycle hooks, notify players on SIGTERM
