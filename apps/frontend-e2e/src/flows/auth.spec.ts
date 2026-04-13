import { expect, test } from '@playwright/test';
import { generateTestUser, registerUser } from '../helpers/auth';

test.describe('Auth Flow', () => {
  test('register with valid credentials redirects to memberships', async ({ page }) => {
    const user = generateTestUser();

    await page.goto('/register');
    await page.locator('#username').fill(user.username);
    await page.locator('#password').fill(user.password);
    await page.locator('#confirmPassword').fill(user.password);

    const submitBtn = page.locator('button[type="submit"]');
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    await expect(page).toHaveURL(/\/memberships$/);
  });

  test('login with registered credentials redirects to memberships', async ({ page, request }) => {
    const user = generateTestUser();
    await registerUser(request, user);

    await page.goto('/login');
    await page.locator('#username').fill(user.username);
    await page.locator('#password').fill(user.password);

    const submitBtn = page.locator('button[type="submit"]');
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    await expect(page).toHaveURL(/\/memberships$/);
  });

  test('unauthenticated access to /rooms redirects to /login', async ({ page }) => {
    await page.goto('/rooms');

    await expect(page).toHaveURL(/\/login/);
  });

  test('duplicate registration shows error', async ({ page, request }) => {
    const user = generateTestUser();
    await registerUser(request, user);

    await page.goto('/register');
    await page.locator('#username').fill(user.username);
    await page.locator('#password').fill(user.password);
    await page.locator('#confirmPassword').fill(user.password);

    const submitBtn = page.locator('button[type="submit"]');
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    await expect(page.locator('#register-error')).toBeVisible();
  });
});
