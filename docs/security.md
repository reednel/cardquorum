# Security

This document describes the security measures in place across the CardQuorum stack.

## Authentication

- **Session-based auth** using cryptographically random 256-bit session IDs stored in Postgres with a 7-day expiry.
- **bcrypt** password hashing with a cost factor of 10. Passwords are hashed immediately on receipt — plaintext is never stored or logged.
- **OIDC** support via authorization code flow with PKCE-style state validation (random nonce in cookie, verified on callback).
- Session cookies are `HttpOnly`, `SameSite=Lax`, and `Secure` in production.

## Authorization

Room invite and ban operations are restricted to the room owner:

- **Invite/uninvite/ban/unban** — only the room owner can perform these actions. Attempting as a non-owner returns `403 Forbidden`.
- **Self-targeting prevention** — the owner cannot invite, uninvite, ban, or unban themselves. Attempting returns `400 Bad Request`.
- **Ban enforcement** — banning a user immediately removes them from the WebSocket room (via `member:kicked` event) and deletes any existing invite record. Banned users cannot see or join the room.
- **Invite-only access** — only the room owner and explicitly invited users can see or join invite-only rooms.
- **Invite list visibility** — any user with access to a room can view its invite list. Only the owner can view the ban list.

## Input Validation

### HTTP

A global `ValidationPipe` is registered in `main.ts` with:

- `transform: true` — coerces payloads to DTO class instances
- `whitelist: true` — strips properties not defined in the DTO
- `forbidNonWhitelisted: true` — rejects requests with unknown properties

All HTTP endpoints use class-validator DTOs. Auth endpoints enforce password length constraints (`PASSWORD_MIN`–`PASSWORD_MAX` from `@cardquorum/shared`). Username validation is enforced both at the DTO level (regex pattern) and in the service layer (`isValidUsername()`).

### WebSocket

All WebSocket gateways use `WsValidationPipe` (same settings as the global HTTP pipe). Chat messages enforce `@MaxLength(MAX_MESSAGE_LENGTH)` and `@IsNotEmpty()`.

### Database

All queries use Drizzle ORM's parameterized query builder. No raw SQL string concatenation exists in the codebase. The one `ilike` search (`searchByUsername`) escapes SQL wildcard characters (`%`, `_`) before interpolation.

## XSS Prevention

### Frontend

Angular's template interpolation (`{{ }}`) auto-escapes all rendered values. The codebase does not use `innerHTML`, `bypassSecurityTrustHtml`, or `DomSanitizer`. User-generated content (chat messages, usernames, display names, room names) is always rendered via interpolation.

### Backend

The backend returns JSON exclusively — no server-side HTML rendering. Helmet is configured with a strict Content Security Policy:

- `default-src: 'none'`
- `script-src: 'self'`
- `style-src: 'self'`
- `frame-ancestors: 'none'`

No inline scripts or styles are permitted.

## CSRF Protection

- Session cookies use `SameSite=Lax`, which blocks cross-origin POST requests from third-party sites.
- The OIDC callback validates a state parameter against a server-set cookie, preventing authorization code injection.

## Rate Limiting

`@nestjs/throttler` is configured globally with an in-memory store:

| Scope                 | Limit        | Window |
| --------------------- | ------------ | ------ |
| Global (all HTTP)     | 100 requests | 60s    |
| `POST /auth/login`    | 10 requests  | 60s    |
| `POST /auth/register` | 5 requests   | 60s    |

Rate limiting is per-IP. WebSocket events are not currently rate-limited but are gated behind authenticated sessions.

## HTTP Security Headers

Helmet sets the following headers on all responses:

- `Content-Security-Policy` (strict, as described above)
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY` (via `frame-ancestors: 'none'`)
- `Strict-Transport-Security` (in production)
- `X-DNS-Prefetch-Control: off`
- `X-Download-Options: noopen`
- `X-Permitted-Cross-Domain-Policies: none`
- `Referrer-Policy: no-referrer`

## Password Policy

| Constraint                  | Value                      |
| --------------------------- | -------------------------- |
| Minimum length              | 8 characters               |
| Maximum length              | 64 characters              |
| Allowed characters          | All printable ASCII        |
| Character-type requirements | None (per NIST SP 800-63B) |

The 64-character maximum aligns with bcrypt's 72-byte input limit while leaving margin for multibyte characters. Constraints are enforced on both frontend (Angular form validators) and backend (class-validator DTOs).

## Logging

- Structured logging via pino. JSON format in production, pretty-printed in development.
- `req.headers.authorization` is redacted from request logs.
- Passwords are never logged — they are hashed immediately on receipt.

## Best Practices for Contributors

- Never use raw SQL — always use Drizzle's query builder.
- Never render user content with `innerHTML` — use Angular interpolation.
- Always create a class-validator DTO for new HTTP endpoints.
- Apply `@UsePipes(WsValidationPipe)` to new WebSocket gateways.
- Never log or return sensitive data (passwords, session IDs, tokens) in responses or error messages.
- Use `@cardquorum/shared` validation constants (`USERNAME_MIN`, `PASSWORD_MAX`, etc.) — don't hardcode limits.
