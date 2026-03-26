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

export function buildOidcStateCookie(state: string, nodeEnv: string): string {
  const secure = nodeEnv === 'production' ? '; Secure' : '';
  return `${OIDC_STATE_COOKIE}=${state}; HttpOnly${secure}; SameSite=Lax; Path=/api/auth/oidc; Max-Age=${OIDC_STATE_MAX_AGE}`;
}

export function buildClearOidcStateCookie(nodeEnv: string): string {
  const secure = nodeEnv === 'production' ? '; Secure' : '';
  return `${OIDC_STATE_COOKIE}=; HttpOnly${secure}; SameSite=Lax; Path=/api/auth/oidc; Max-Age=0`;
}

export function parseOidcState(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/(?:^|;\s*)cq_oidc_state=([^;]*)/);
  return match?.[1] || null;
}

export { COOKIE_NAME };
