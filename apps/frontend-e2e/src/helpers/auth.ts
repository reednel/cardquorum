import type { APIRequestContext, Browser, BrowserContext, Page } from '@playwright/test';
import { getBaseUrl } from './env';

export interface TestUser {
  username: string;
  password: string;
}

const BASE_URL = getBaseUrl();
const TEST_PASSWORD = 'TestPassword123!';

/**
 * Generate a unique test user with a random suffix.
 * Respects username constraints: 3-20 chars, starts with a letter,
 * only letters/numbers/underscores, no user_ or deleted_ prefix.
 */
export function generateTestUser(prefix?: string): TestUser {
  const base = prefix ?? 'e';
  const random = Math.random().toString(36).substring(2, 8);
  const suffix = Date.now().toString(36).slice(-5);
  const username = `${base}${random}${suffix}`.slice(0, 20);
  return {
    username,
    password: TEST_PASSWORD,
  };
}

/**
 * Extract the cq_session cookie value from a Set-Cookie header string.
 */
function extractSessionCookie(setCookieHeader: string): string {
  const match = setCookieHeader.match(/cq_session=([^;]+)/);
  if (!match) {
    throw new Error(
      `Could not extract cq_session cookie from Set-Cookie header: ${setCookieHeader}`,
    );
  }
  return match[1];
}

/**
 * Register a user via POST /api/auth/register.
 * Returns the cq_session cookie value.
 */
export async function registerUser(request: APIRequestContext, user: TestUser): Promise<string> {
  const response = await request.post(`${BASE_URL}/api/auth/register`, {
    data: { username: user.username, password: user.password },
  });

  if (response.status() === 409) {
    throw new Error(`Registration failed: username "${user.username}" already taken`);
  }

  if (!response.ok()) {
    const body = await response.text();
    throw new Error(`Registration failed with status ${response.status()}: ${body}`);
  }

  const setCookie = response.headers()['set-cookie'];
  if (!setCookie) {
    throw new Error('Registration response did not include a Set-Cookie header');
  }

  return extractSessionCookie(setCookie);
}

/**
 * Log in a user via POST /api/auth/login.
 * Returns the cq_session cookie value.
 */
export async function loginUser(request: APIRequestContext, user: TestUser): Promise<string> {
  const response = await request.post(`${BASE_URL}/api/auth/login`, {
    data: { username: user.username, password: user.password },
  });

  if (!response.ok()) {
    const body = await response.text();
    throw new Error(`Login failed with status ${response.status()}: ${body}`);
  }

  const setCookie = response.headers()['set-cookie'];
  if (!setCookie) {
    throw new Error('Login response did not include a Set-Cookie header');
  }

  return extractSessionCookie(setCookie);
}

/**
 * Create an authenticated browser context with the cq_session cookie pre-set.
 * If no user is provided, a new one is generated and registered.
 */
export async function authenticatedContext(
  browser: Browser,
  request: APIRequestContext,
  user?: TestUser,
): Promise<{ context: BrowserContext; page: Page; user: TestUser }> {
  const testUser = user ?? generateTestUser();
  const sessionCookie = await registerUser(request, testUser);

  const context = await browser.newContext();
  await context.addCookies([
    {
      name: 'cq_session',
      value: sessionCookie,
      url: BASE_URL,
    },
  ]);

  const page = await context.newPage();

  return { context, page, user: testUser };
}
