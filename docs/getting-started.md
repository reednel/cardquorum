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

   The defaults work with the Docker dev containers out of the box. For basic auth (the default), make sure `JWT_SECRET` is set:

   ```env
   DATABASE_URL=postgresql://cardquorum:cardquorum@localhost:5432/cardquorum
   REDIS_URL=redis://localhost:6379
   AUTH_STRATEGY=basic
   JWT_SECRET=dev-secret-change-me-in-production
   LOG_LEVEL=debug
   ```

3. **Start Postgres and Redis:**

   ```sh
   docker compose -f compose.dev.yml up -d
   ```

4. **Run database migrations:**

   ```sh
   pnpm drizzle-kit migrate --config ./libs/db/drizzle.config.ts
   ```

5. **Register a user:**

   ```sh
   curl -X POST http://localhost:3000/api/auth/register \
     -H 'Content-Type: application/json' \
     -d '{"username":"dev","displayName":"Dev","password":"password"}'
   ```

   This returns a JWT token you can use for WebSocket connections and API calls.

6. **Start the dev servers:**

   ```sh
   pnpm nx serve frontend
   ```

   This automatically starts the backend. The app will be available at `http://localhost:4200`.

## Verifying Everything Works

- **Health check:** `curl http://localhost:3000/api/healthz` should return `{"status":"ok","info":{...}}` with both database and Redis showing `"up"`.
- **Build:** `pnpm nx run-many -t build`
- **Test:** `pnpm nx run-many -t test`
- **Lint:** `pnpm nx run-many -t lint`
