# Deployment

CardQuorum ships as a single Docker image containing both the API backend and the Angular frontend. The backend serves the SPA directly — no separate web server is needed.

## Quick Start

```sh
git clone https://github.com/reednel/cardquorum.git
cd cardquorum
cp .env.template .env  # edit with real values
docker compose up --build -d
```

The app will be available at `http://localhost:3000`.

## Architecture

```
┌──────────────────────────────────┐
│         cardquorum (app)         │
│                                  │
│  NestJS serves:                  │
│    /api/*    → REST + WebSocket  │
│    /*        → Angular SPA       │
│                                  │
│  On startup:                     │
│    1. Run Drizzle migrations     │
│    2. Start server on :3000      │
└──────────────┬───────────────────┘
               │
       ┌───────▼───────┐
       │   PostgreSQL   │
       └───────────────┘
```

## Configuration

All configuration is done through environment variables. See `.env.template` for the full list.

| Variable            | Required         | Default    | Description                                                        |
| ------------------- | ---------------- | ---------- | ------------------------------------------------------------------ |
| `POSTGRES_PASSWORD` | Yes (Docker)     | `changeme` | Password for the Postgres container                                |
| `DATABASE_URL`      | Yes (non-Docker) | —          | Full Postgres connection string (composed automatically in Docker) |
| `AUTH_STRATEGIES`   | No               | `basic`    | Comma-separated list: `basic`, `oidc`                              |
| `LOG_LEVEL`         | No               | `info`     | `debug`, `info`, `warn`, `error`                                   |
| `PORT`              | No               | `3000`     | Port the app listens on                                            |

When using `docker-compose.yml`, you only need to set `POSTGRES_PASSWORD` — the compose file constructs `DATABASE_URL` from it automatically.

### OIDC Authentication

If `AUTH_STRATEGIES` includes `oidc`, these additional variables are required:

| Variable             | Description                                                      |
| -------------------- | ---------------------------------------------------------------- |
| `OIDC_ISSUER`        | OIDC provider URL                                                |
| `OIDC_CLIENT_ID`     | Client ID                                                        |
| `OIDC_CLIENT_SECRET` | Client secret                                                    |
| `OIDC_REDIRECT_URI`  | Callback URL (e.g. `https://your-domain/api/auth/oidc/callback`) |

## Database Migrations

Migrations run automatically on every container start. If the database is already up to date, this is a no-op. If new migrations exist (from an image update), they are applied before the server begins accepting traffic.

Migration files are bundled into the image at build time from `libs/db/migrations/`.

## Updating

```sh
git pull
docker compose up --build -d
```

Docker layer caching makes rebuilds fast — only changed layers are rebuilt. Migrations are applied automatically on restart.

## Reverse Proxy (Optional)

For a public-facing deployment, put a reverse proxy in front for TLS termination. Example with Caddy:

```
cardquorum.example.com {
    reverse_proxy localhost:3000
}
```

The app handles WebSocket upgrades on `/ws`, which Caddy proxies automatically.

## Building the Image Manually

```sh
docker build -t cardquorum .
docker run -p 3000:3000 --env-file .env cardquorum
```

## Health Check

The container includes a built-in health check that hits `GET /api/healthz`. This endpoint verifies the database connection is alive. Docker will mark the container as unhealthy if this fails.
