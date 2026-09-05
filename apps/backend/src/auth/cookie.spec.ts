import { buildClearOidcStateCookie, buildOidcStateCookie, parseOidcStateCookie } from './cookie';

describe('OIDC state cookie helpers', () => {
  describe('buildOidcStateCookie', () => {
    it('should build a cookie with nonce.codeVerifier.state format and short max-age', () => {
      const cookie = buildOidcStateCookie('nonce123', 'verifier456', 'state789', 'development');
      expect(cookie).toBe(
        'cq_oidc_state=nonce123.verifier456.state789; HttpOnly; SameSite=Lax; Path=/api/auth/oidc; Max-Age=300',
      );
    });

    it('should include Secure flag in production', () => {
      const cookie = buildOidcStateCookie('n', 'v', 's', 'production');
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

  describe('parseOidcStateCookie', () => {
    it('should extract nonce, codeVerifier, and state from a correctly formatted cookie header', () => {
      const result = parseOidcStateCookie(
        'cq_oidc_state=mynonce.myverifier.mystate; cq_session=xyz',
      );
      expect(result).toEqual({ nonce: 'mynonce', codeVerifier: 'myverifier', state: 'mystate' });
    });

    it('should handle state values that contain colons', () => {
      const result = parseOidcStateCookie(
        'cq_oidc_state=mynonce.myverifier.state123:delete-account',
      );
      expect(result).toEqual({
        nonce: 'mynonce',
        codeVerifier: 'myverifier',
        state: 'state123:delete-account',
      });
    });

    it('should return null when the cookie is absent', () => {
      expect(parseOidcStateCookie('cq_session=xyz')).toBeNull();
      expect(parseOidcStateCookie(undefined)).toBeNull();
    });

    it('should return null when only one dot separator is present', () => {
      expect(parseOidcStateCookie('cq_oidc_state=nonce.state')).toBeNull();
    });

    it('should return null when any segment is empty', () => {
      expect(parseOidcStateCookie('cq_oidc_state=.verifier.state')).toBeNull();
      expect(parseOidcStateCookie('cq_oidc_state=nonce..state')).toBeNull();
      expect(parseOidcStateCookie('cq_oidc_state=nonce.verifier.')).toBeNull();
    });
  });
});
