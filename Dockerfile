# ============================================================
# CardQuorum — single-image production build
# ============================================================
# Build:   docker build -t cardquorum .
# Run:     docker run -p 3000:3000 --env-file .env cardquorum
# ============================================================

# --- Stage 1: Install dependencies ---
FROM node:22-alpine AS deps
RUN corepack enable && corepack prepare pnpm@10 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# --- Stage 2: Build frontend + backend ---
FROM node:22-alpine AS builder
RUN corepack enable && corepack prepare pnpm@10 --activate
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm nx build frontend --configuration=production
RUN pnpm nx build backend

# --- Stage 3: Production runtime ---
FROM node:22-alpine AS runtime
RUN corepack enable && corepack prepare pnpm@10 --activate
WORKDIR /app

# Copy the built backend (includes generated package.json with prod deps)
COPY --from=builder /app/dist/apps/backend ./
# Copy the built frontend SPA
COPY --from=builder /app/dist/apps/frontend/browser ./public
# Copy the full lockfile for deterministic installs
COPY --from=builder /app/pnpm-lock.yaml ./
# Copy the entrypoint script
COPY apps/backend/docker-entrypoint.sh ./

# Install only production dependencies
# Install only production dependencies
RUN pnpm install --prod && chmod +x docker-entrypoint.sh

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/healthz || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]
