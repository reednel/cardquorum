# Getting Started

## Prerequisites

- Node.js (LTS)
- pnpm
- Docker & Docker Compose

## Initial Setup

1. **Clone and install:**

   ```sh
   git clone https://github.com/reednel/cardquorum.git && cd cardquorum
   pnpm install
   ```

2. **Create your `.env` file** from the template:

   ```sh
   cp .env.template .env
   ```

   The defaults work with the Docker dev containers out of the box:

   ```env
   DATABASE_URL=postgresql://cardquorum:cardquorum@localhost:5432/cardquorum
   AUTH_STRATEGIES=basic
   LOG_LEVEL=debug
   ```

   See [auth.md](auth.md) for OIDC configuration when `AUTH_STRATEGIES` includes `oidc`.

3. **Start Postgres:**

   ```sh
   docker compose -f compose.dev.yml up -d
   ```

4. **Run database migrations:**

   ```sh
   pnpm drizzle-kit migrate --config ./libs/db/drizzle.config.ts
   ```

5. **Start the dev servers:**

   ```sh
   pnpm nx serve
   ```

   The app will be available at `http://localhost:4200`.

## Verifying Everything Works

- **Health check:** `curl http://localhost:3000/api/healthz` should return `{"status":"ok","info":{...}}` with database showing `"up"`.
- **Build:** `pnpm nx run-many -t build`
- **Test:** `pnpm nx run-many -t test`
- **Lint:** `pnpm nx run-many -t lint`
