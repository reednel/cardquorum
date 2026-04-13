import { expect, test } from '@playwright/test';
import { checkAccessibility, formatViolations } from '../helpers/a11y';
import { authenticatedContext } from '../helpers/auth';

test.describe('Accessibility Sweep', () => {
  test('login page passes accessibility checks', async ({ page }) => {
    await page.goto('/login');
    await page.locator('button[type="submit"]').waitFor({ state: 'visible' });

    const results = await checkAccessibility(page);
    expect(results.violations, formatViolations(results.violations)).toHaveLength(0);
  });

  test('registration page passes accessibility checks', async ({ page }) => {
    await page.goto('/register');
    await page.locator('button[type="submit"]').waitFor({ state: 'visible' });

    const results = await checkAccessibility(page);
    expect(results.violations, formatViolations(results.violations)).toHaveLength(0);
  });

  test('memberships page passes accessibility checks', async ({ browser, request }) => {
    const { context, page } = await authenticatedContext(browser, request);

    try {
      await page.goto('/memberships');
      await page.waitForURL(/\/memberships$/);
      await page.locator('[data-testid="create-room-btn"]').waitFor({ state: 'visible' });

      const results = await checkAccessibility(page);
      expect(results.violations, formatViolations(results.violations)).toHaveLength(0);
    } finally {
      await context.close();
    }
  });

  test('discover page passes accessibility checks', async ({ browser, request }) => {
    const { context, page } = await authenticatedContext(browser, request);

    try {
      await page.goto('/discover');
      await page.waitForURL(/\/discover$/);
      await page.locator('[data-testid="search-input"]').waitFor({ state: 'visible' });

      const results = await checkAccessibility(page);
      expect(results.violations, formatViolations(results.violations)).toHaveLength(0);
    } finally {
      await context.close();
    }
  });

  test('room view page passes accessibility checks', async ({ browser, request }) => {
    const { context, page } = await authenticatedContext(browser, request);

    try {
      // Create a room to navigate to
      await page.goto('/memberships');
      await page.waitForURL(/\/memberships$/);
      await page.locator('[data-testid="create-room-btn"]').waitFor({ state: 'visible' });
      await page.locator('[data-testid="create-room-btn"]').click();

      const nameInput = page.locator('#room-name');
      await nameInput.waitFor({ state: 'visible' });
      await nameInput.fill(`A11yRoom-${Date.now()}`);
      await page.locator('dialog button[type="submit"]').click();
      await page.waitForURL(/\/rooms\/\d+/);

      // Wait for the room view to fully render
      await page.locator('aside p[title]').waitFor({ state: 'visible' });

      const results = await checkAccessibility(page);
      expect(results.violations, formatViolations(results.violations)).toHaveLength(0);
    } finally {
      await context.close();
    }
  });

  test('account page passes accessibility checks', async ({ browser, request }) => {
    const { context, page } = await authenticatedContext(browser, request);

    try {
      await page.goto('/user/account');
      await page.locator('[data-testid="edit-username-btn"]').waitFor({ state: 'visible' });

      const results = await checkAccessibility(page);
      expect(results.violations, formatViolations(results.violations)).toHaveLength(0);
    } finally {
      await context.close();
    }
  });

  test('friends page passes accessibility checks', async ({ browser, request }) => {
    const { context, page } = await authenticatedContext(browser, request);

    try {
      await page.goto('/user/friends');
      await page.locator('[data-testid="search-input"]').waitFor({ state: 'visible' });

      const results = await checkAccessibility(page);
      expect(results.violations, formatViolations(results.violations)).toHaveLength(0);
    } finally {
      await context.close();
    }
  });

  test('create-room modal passes accessibility checks', async ({ browser, request }) => {
    const { context, page } = await authenticatedContext(browser, request);

    try {
      await page.goto('/memberships');
      await page.waitForURL(/\/memberships$/);
      await page.locator('[data-testid="create-room-btn"]').waitFor({ state: 'visible' });

      await page.locator('[data-testid="create-room-btn"]').click();
      await page.locator('#room-name').waitFor({ state: 'visible' });

      const results = await checkAccessibility(page);
      expect(results.violations, formatViolations(results.violations)).toHaveLength(0);
    } finally {
      await context.close();
    }
  });
});
