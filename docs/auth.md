# Authentication

CardQuorum supports two authentication strategies, selected via the `AUTH_STRATEGY` environment variable.

## Strategies

### Basic Auth (default)

Self-contained username/password authentication. The backend mints HS256 JWTs signed with `JWT_SECRET`.

**Required env vars:**

```env
AUTH_STRATEGY=basic
JWT_SECRET=dev-secret-change-me-in-production
```

**Flow:**

1. Register: `POST /api/auth/register` with `{ username, displayName, password }`
2. Login: `POST /api/auth/login` with `{ username, password }`
3. Both return `{ token }` — a signed JWT valid for 7 days
4. Pass the token to authenticated endpoints via `Authorization: Bearer <token>`
5. Check identity: `GET /api/auth/me` with the Bearer token

### OIDC

Delegates authentication to an external OpenID Connect provider (e.g., Authentik, Keycloak). The backend validates provider-issued JWTs using RS256 via JWKS.

**Required env vars:**

```env
AUTH_STRATEGY=oidc
OIDC_ISSUER=https://your-provider/application/o/cardquorum/
OIDC_CLIENT_ID=your-client-id
```

**Flow:**

1. The client authenticates with the OIDC provider and obtains an access token
2. The backend validates the token against the provider's JWKS endpoint (`<OIDC_ISSUER>/.well-known/jwks.json`)
3. On first validation, a local user record is created automatically, and a credential row is added to `user_credentials` with `method = 'oidc'`

**Testing with Authentik:**

1. Set up an Authentik instance (e.g., via Docker)
2. Create an OAuth2/OIDC provider and application
3. Set the `OIDC_ISSUER` and `OIDC_CLIENT_ID` env vars
4. Obtain a token from Authentik's token endpoint and use it with the backend

## Credential Storage

Auth credentials are stored in the `user_credentials` table, separate from the `users` table. Each row has a `method` discriminator (`'basic'` or `'oidc'`) and a `credential` value (password hash or OIDC subject). This supports multiple auth methods per user and cleaner separation of concerns.

## WebSocket Authentication

The browser WebSocket API doesn't support custom headers, so tokens are passed via query string:

```
ws://localhost:3000/ws?token=<jwt>
```

**Behavior:**

- Connections without a valid token are rejected with close code `4001` (Unauthorized)
- On successful auth, the user's identity (from the JWT) is attached to the connection
- Each WebSocket connection gets a unique connection ID (`conn-N`) for multi-tab support
- The identity from the token is used for room membership and message attribution

## Key Files

| File                                                 | Purpose                           |
| ---------------------------------------------------- | --------------------------------- |
| `apps/backend/src/auth/auth-strategy.interface.ts`   | Strategy pattern contract         |
| `apps/backend/src/auth/basic/basic-auth.strategy.ts` | JWT creation + validation (HS256) |
| `apps/backend/src/auth/oidc/oidc-auth.strategy.ts`   | OIDC JWT validation via JWKS      |
| `apps/backend/src/auth/auth.service.ts`              | Register/login business logic     |
| `apps/backend/src/auth/auth.controller.ts`           | HTTP endpoints                    |
| `apps/backend/src/auth/ws-auth.guard.ts`             | WS handshake token validation     |
| `apps/backend/src/auth/auth.module.ts`               | Wiring + strategy factory         |
| `libs/db/src/schema/users.ts`                        | Users table schema                |
| `libs/db/src/schema/user-credentials.ts`             | Credentials table schema          |
| `libs/db/src/repositories/user.repository.ts`        | User data access                  |
| `libs/db/src/repositories/credential.repository.ts`  | Credential data access            |
