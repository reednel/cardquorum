const COOKIE_NAME = 'cq_session';
const MAX_AGE = 7 * 24 * 60 * 60; // 7 days in seconds

export function buildSessionCookie(sessionId: string, nodeEnv: string): string {
  const secure = nodeEnv === 'production' ? '; Secure' : '';
  return `${COOKIE_NAME}=${sessionId}; HttpOnly${secure}; SameSite=Lax; Path=/; Max-Age=${MAX_AGE}`;
}

export function buildClearSessionCookie(nodeEnv: string): string {
  const secure = nodeEnv === 'production' ? '; Secure' : '';
  return `${COOKIE_NAME}=; HttpOnly${secure}; SameSite=Lax; Path=/; Max-Age=0`;
}

export function parseCookieSessionId(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/(?:^|;\s*)cq_session=([^;]*)/);
  return match?.[1] || null;
}

const OIDC_STATE_COOKIE = 'cq_oidc_state';
const OIDC_STATE_MAX_AGE = 300; // 5 minutes

/** Cookie value format: "<nonce>.<codeVerifier>.<state>" — dots are safe because base64url never contains them. */
export function buildOidcStateCookie(
  nonce: string,
  codeVerifier: string,
  state: string,
  nodeEnv: string,
): string {
  const secure = nodeEnv === 'production' ? '; Secure' : '';
  return `${OIDC_STATE_COOKIE}=${nonce}.${codeVerifier}.${state}; HttpOnly${secure}; SameSite=Lax; Path=/api/auth/oidc; Max-Age=${OIDC_STATE_MAX_AGE}`;
}

export function buildClearOidcStateCookie(nodeEnv: string): string {
  const secure = nodeEnv === 'production' ? '; Secure' : '';
  return `${OIDC_STATE_COOKIE}=; HttpOnly${secure}; SameSite=Lax; Path=/api/auth/oidc; Max-Age=0`;
}

/** Returns `{ nonce, codeVerifier, state }` parsed from the cookie, or `null` if absent or malformed. */
export function parseOidcStateCookie(
  cookieHeader: string | undefined,
): { nonce: string; codeVerifier: string; state: string } | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/(?:^|;\s*)cq_oidc_state=([^;]*)/);
  const raw = match?.[1];
  if (!raw) return null;
  // Format: nonce.codeVerifier.state — find first two dots only
  const first = raw.indexOf('.');
  if (first === -1) return null;
  const second = raw.indexOf('.', first + 1);
  if (second === -1) return null;
  const nonce = raw.slice(0, first);
  const codeVerifier = raw.slice(first + 1, second);
  const state = raw.slice(second + 1);
  if (!nonce || !codeVerifier || !state) return null;
  return { nonce, codeVerifier, state };
}

export { COOKIE_NAME };
