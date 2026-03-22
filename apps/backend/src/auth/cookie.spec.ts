import { buildClearOidcStateCookie, buildOidcStateCookie, parseOidcState } from './cookie';

describe('OIDC state cookie helpers', () => {
  describe('buildOidcStateCookie', () => {
    it('should build a cookie with SameSite=Lax and short max-age', () => {
      const cookie = buildOidcStateCookie('abc123', 'development');
      expect(cookie).toBe(
        'cq_oidc_state=abc123; HttpOnly; SameSite=Lax; Path=/api/auth/oidc; Max-Age=300',
      );
    });

    it('should include Secure flag in production', () => {
      const cookie = buildOidcStateCookie('abc123', 'production');
      expect(cookie).toContain('; Secure;');
    });
  });

  describe('buildClearOidcStateCookie', () => {
    it('should build a clear cookie with Max-Age=0', () => {
      const cookie = buildClearOidcStateCookie('development');
      expect(cookie).toContain('cq_oidc_state=');
      expect(cookie).toContain('Max-Age=0');
    });
  });

  describe('parseOidcState', () => {
    it('should extract the state value from a cookie header', () => {
      const result = parseOidcState('cq_oidc_state=abc123; cq_session=xyz');
      expect(result).toBe('abc123');
    });

    it('should return null for missing cookie', () => {
      expect(parseOidcState('cq_session=xyz')).toBeNull();
      expect(parseOidcState(undefined)).toBeNull();
    });
  });
});
