# Authentication

CardQuorum uses opaque Postgres-backed sessions with HttpOnly cookies. The `AUTH_STRATEGIES` env var selects which login methods are active; session management is shared across strategies. A deployment can enable `basic`, `oidc`, or both (`basic,oidc`).

## Session Management

All strategies converge to the same session model:

1. User authenticates (login/register or OIDC callback)
2. Backend creates a session row in the `sessions` table (opaque ID via `randomBytes(32).toString('base64url')`, 7-day expiry)
3. Response includes `Set-Cookie: cq_session=<id>; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800` (`Secure` flag added in production)
4. Browser sends the cookie automatically on all requests (including `/api` and `/ws` WebSocket upgrades)
5. On logout, the session is deleted from the DB and the cookie is cleared

## Strategies

### Basic Auth (default)

Self-contained username/password authentication.

**Required env vars:**

```env
AUTH_STRATEGIES=basic
```

**Flow:**

1. Register: `POST /api/auth/register` with `{ username, displayName, password }`
2. Login: `POST /api/auth/login` with `{ username, password }`
3. Both return `UserIdentity` (`{ userId, displayName }`) in the response body and set the session cookie
4. Check identity: `GET /api/auth/me` (reads session cookie)
5. Logout: `POST /api/auth/logout` (deletes session, clears cookie)

When `basic` is not in `AUTH_STRATEGIES`, the register and login endpoints return 404.

### OIDC

Delegates authentication to an external OpenID Connect provider (e.g., Auth0, Authentik) using the backend-driven Authorization Code Flow. The backend holds the client secret and handles all token exchange server-side.

**Required env vars:**

```env
AUTH_STRATEGIES=oidc
OIDC_ISSUER=https://your-provider/application/o/cardquorum/
OIDC_CLIENT_ID=your-client-id
OIDC_CLIENT_SECRET=your-client-secret
OIDC_REDIRECT_URI=http://localhost:4200/api/auth/oidc/callback
```

`OIDC_REDIRECT_URI` must point to the origin users access. In development, that's the Angular dev server (port 4200) which proxies `/api` to the backend. The callback redirect to `/` then lands on the Angular app, not the backend. In production with a single origin (reverse proxy), use that origin.

**Flow:**

1. On startup, `AuthService.initOidc()` fetches the provider's `/.well-known/openid-configuration` discovery document and caches the `authorization_endpoint`, `token_endpoint`, and `jwks_uri`. This makes the code provider-agnostic (Authentik, Auth0, etc. all put these at different paths).
2. User clicks "Sign in with SSO" on the login page, which navigates to `GET /api/auth/oidc/login`
3. Backend generates a random `state`, stores it in a short-lived cookie (`cq_oidc_state`, `SameSite=Lax`, 5-minute expiry), and redirects the browser to the discovered `authorization_endpoint`
4. User authenticates with the OIDC provider
5. Provider redirects back to `GET /api/auth/oidc/callback` with `code` and `state` query params
6. Backend validates `state` matches the cookie, exchanges the `code` for tokens at the discovered `token_endpoint` (server-to-server), and verifies the ID token (signature via discovered JWKS, issuer, audience)
7. On first login, a local user record is created automatically (`user_credentials` with `method = 'oidc'`)
8. Backend creates a session, sets the `cq_session` cookie, clears the OIDC state cookie, and redirects to `/`

The OIDC state cookie uses `SameSite=Lax` (not `Strict`) because the callback is a cross-site redirect from the OIDC provider — `Strict` would prevent the browser from sending the cookie.

When `oidc` is not in `AUTH_STRATEGIES`, the OIDC endpoints return 404.

### Enabling Both

```env
AUTH_STRATEGIES=basic,oidc
OIDC_ISSUER=...
OIDC_CLIENT_ID=...
OIDC_CLIENT_SECRET=...
OIDC_REDIRECT_URI=...
```

The login page shows both the username/password form and an SSO button. The frontend queries `GET /api/auth/strategies` (unguarded) to determine which options to render.

## Credential Storage

Auth credentials are stored in the `user_credentials` table, separate from the `users` table. Each row has a `method` discriminator (`'basic'` or `'oidc'`) and a `credential` value (password hash or OIDC subject). This supports multiple auth methods per user and cleaner separation of concerns.

## WebSocket Authentication

The browser sends cookies automatically on WebSocket upgrade requests. The `WsAuthGuard` manually parses the `cq_session` cookie from the raw `IncomingMessage.headers.cookie` header (since `@fastify/cookie` only decorates `FastifyRequest` objects, not the raw HTTP upgrade request).

**Behavior:**

- Connections without a valid session cookie are rejected with close code `4001` (Unauthorized)
- On successful auth, the user's identity is attached to the connection
- Each WebSocket connection gets a unique connection ID (`conn-N`) for multi-tab support
- The frontend handles `4001` close code by calling `auth.logout()` instead of reconnecting

## HTTP Authentication

REST endpoints that require authentication use `HttpAuthGuard`, a NestJS `CanActivate` guard. It reads the `cq_session` cookie from `request.cookies` (parsed by `@fastify/cookie`), validates it via `SessionService`, and attaches the `UserIdentity` to the request at `request.user`.

Usage in controllers:

```ts
@UseGuards(HttpAuthGuard)
@Controller('rooms')
export class RoomController {
  @Get()
  list(@Req() request: FastifyRequest) {
    const user = (request as any)[REQUEST_USER_KEY] as UserIdentity;
    // ...
  }
}
```

## Frontend Session Hydration

The frontend has no access to the session cookie (HttpOnly). Identity is hydrated in two ways:

1. **On login/register**: the response body contains `UserIdentity`, which is set into the `_user` signal
2. **On page refresh**: an `APP_INITIALIZER` calls `GET /api/auth/me`. If the cookie is valid, the server returns the user identity; if not (401), the user remains unauthenticated and the route guard redirects to `/login`
3. **On OIDC callback**: the browser arrives at `/` with the session cookie already set; the `APP_INITIALIZER` picks up the user via `GET /api/auth/me`

The `APP_INITIALIZER` also calls `GET /api/auth/strategies` to populate the strategies signal, which controls whether the SSO button appears on the login page.

## Key Files

| File                                                | Purpose                                           |
| --------------------------------------------------- | ------------------------------------------------- |
| `apps/backend/src/auth/auth.service.ts`             | Register/login/oidcCallback business logic        |
| `apps/backend/src/auth/auth.controller.ts`          | HTTP endpoints (login/register/logout/me/oidc/\*) |
| `apps/backend/src/auth/session.service.ts`          | Session creation/validation/deletion              |
| `apps/backend/src/auth/cookie.ts`                   | Session + OIDC state cookie helpers               |
| `apps/backend/src/auth/http-auth.guard.ts`          | HTTP cookie-based auth guard                      |
| `apps/backend/src/auth/ws-auth.guard.ts`            | WS handshake cookie validation                    |
| `apps/backend/src/auth/auth.module.ts`              | Wiring + service factories                        |
| `libs/db/src/schema/users.ts`                       | Users table schema                                |
| `libs/db/src/schema/user-credentials.ts`            | Credentials table schema                          |
| `libs/db/src/schema/sessions.ts`                    | Sessions table schema                             |
| `libs/db/src/repositories/user.repository.ts`       | User data access                                  |
| `libs/db/src/repositories/credential.repository.ts` | Credential data access                            |
| `libs/db/src/repositories/session.repository.ts`    | Session data access                               |
