import { expect, Page, test } from '@playwright/test';
import { authenticatedContext } from '../helpers/auth';

/**
 * Navigate to /rooms and wait for the shell header to be ready.
 */
async function goToRoomsAndWaitForShell(page: Page): Promise<void> {
  await page.goto('/rooms');
  await page.waitForURL(/\/rooms$/);
  await page.locator('[data-testid="user-menu-trigger"]').waitFor({ state: 'visible' });
}

test.describe('Shell Flows', () => {
  test('clicking user menu trigger displays dropdown with Account and Log out items', async ({
    browser,
    request,
  }) => {
    const { context, page } = await authenticatedContext(browser, request);

    try {
      await goToRoomsAndWaitForShell(page);

      await page.locator('[data-testid="user-menu-trigger"]').click();

      const menu = page.locator('[data-testid="user-menu"]');
      await expect(menu).toBeVisible();

      await expect(page.locator('[data-testid="menu-account"]')).toBeVisible();
      await expect(page.locator('[data-testid="menu-logout"]')).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test('clicking Account menu item navigates to /account', async ({ browser, request }) => {
    const { context, page } = await authenticatedContext(browser, request);

    try {
      await goToRoomsAndWaitForShell(page);

      await page.locator('[data-testid="user-menu-trigger"]').click();
      await expect(page.locator('[data-testid="user-menu"]')).toBeVisible();

      await page.locator('[data-testid="menu-account"]').click();

      await expect(page).toHaveURL(/\/account$/);
    } finally {
      await context.close();
    }
  });

  test('clicking Log out menu item redirects to /login', async ({ browser, request }) => {
    const { context, page } = await authenticatedContext(browser, request);

    try {
      await goToRoomsAndWaitForShell(page);

      await page.locator('[data-testid="user-menu-trigger"]').click();
      await expect(page.locator('[data-testid="user-menu"]')).toBeVisible();

      await page.locator('[data-testid="menu-logout"]').click();

      await expect(page).toHaveURL(/\/login/);
    } finally {
      await context.close();
    }
  });

  test('pressing Escape while dropdown is open closes the menu', async ({ browser, request }) => {
    const { context, page } = await authenticatedContext(browser, request);

    try {
      await goToRoomsAndWaitForShell(page);

      await page.locator('[data-testid="user-menu-trigger"]').click();
      await expect(page.locator('[data-testid="user-menu"]')).toBeVisible();

      await page.keyboard.press('Escape');

      await expect(page.locator('[data-testid="user-menu"]')).toBeHidden();
    } finally {
      await context.close();
    }
  });
});
