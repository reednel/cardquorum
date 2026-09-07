import { type SessionIdentity } from '@cardquorum/shared';
import { REQUEST_SESSION_KEY, REQUEST_USER_KEY } from './auth/http-auth.guard';

declare module 'fastify' {
  interface FastifyRequest {
    // Set by @fastify/cookie plugin at runtime
    cookies: Record<string, string> | undefined;
    // Set by HttpAuthGuard on authenticated routes
    [REQUEST_USER_KEY]: SessionIdentity;
    [REQUEST_SESSION_KEY]: { createdAt: Date };
  }
}
