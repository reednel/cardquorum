import { expect, test } from '@playwright/test';
import { authenticatedContext } from '../helpers/auth';

test.describe('Account Flows', () => {
  test('user edits username and sees the updated value after saving', async ({
    browser,
    request,
  }) => {
    const { context, page, user } = await authenticatedContext(browser, request);
    const newUsername = `renamed${Date.now().toString(36)}`;

    try {
      await page.goto('/account');
      await page.locator('[data-testid="edit-username-btn"]').waitFor({ state: 'visible' });

      await page.locator('[data-testid="edit-username-btn"]').click();

      const usernameInput = page.locator('[data-testid="username-input"]');
      await expect(usernameInput).toBeVisible();
      await expect(usernameInput).toHaveValue(user.username);

      await usernameInput.fill(newUsername);
      await page.locator('[data-testid="save-username-btn"]').click();

      // After saving, edit mode exits and the updated username is displayed as text
      await expect(page.locator('[data-testid="edit-username-btn"]')).toBeVisible();
      await expect(page.locator('[data-testid="username-input"]')).toBeHidden();
      await expect(page.getByRole('main').getByText(newUsername)).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test('user cancels username edit and sees the original value restored', async ({
    browser,
    request,
  }) => {
    const { context, page, user } = await authenticatedContext(browser, request);

    try {
      await page.goto('/account');
      await page.locator('[data-testid="edit-username-btn"]').waitFor({ state: 'visible' });

      await page.locator('[data-testid="edit-username-btn"]').click();

      const usernameInput = page.locator('[data-testid="username-input"]');
      await expect(usernameInput).toBeVisible();

      await usernameInput.fill('somethingelse');
      await page.locator('[data-testid="cancel-edit-btn"]').click();

      // After cancelling, edit mode exits and the original username is displayed
      await expect(page.locator('[data-testid="edit-username-btn"]')).toBeVisible();
      await expect(page.locator('[data-testid="username-input"]')).toBeHidden();
      await expect(page.getByRole('main').getByText(user.username)).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test('user edits display name and sees the updated value after saving', async ({
    browser,
    request,
  }) => {
    const { context, page } = await authenticatedContext(browser, request);
    const displayName = `TestDisplay ${Date.now()}`;

    try {
      await page.goto('/account');
      await page.locator('[data-testid="edit-display-name-btn"]').waitFor({ state: 'visible' });

      await page.locator('[data-testid="edit-display-name-btn"]').click();

      const displayNameInput = page.locator('[data-testid="display-name-input"]');
      await expect(displayNameInput).toBeVisible();

      await displayNameInput.fill(displayName);
      await page.locator('[data-testid="save-display-name-btn"]').click();

      // After saving, edit mode exits and the updated display name is shown
      await expect(page.locator('[data-testid="edit-display-name-btn"]')).toBeVisible();
      await expect(page.locator('[data-testid="display-name-input"]')).toBeHidden();
      await expect(page.getByRole('main').getByText(displayName)).toBeVisible();
      // The empty-state indicator should no longer be visible
      await expect(page.locator('[data-testid="display-name-empty"]')).toBeHidden();
    } finally {
      await context.close();
    }
  });

  test('fresh user sees "Not set" empty-state indicator for display name', async ({
    browser,
    request,
  }) => {
    const { context, page } = await authenticatedContext(browser, request);

    try {
      await page.goto('/account');
      await page.locator('[data-testid="edit-display-name-btn"]').waitFor({ state: 'visible' });

      await expect(page.locator('[data-testid="display-name-empty"]')).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test('user changes password and can log in with the new password', async ({
    browser,
    request,
  }) => {
    const { context, page, user } = await authenticatedContext(browser, request);
    const newPassword = 'NewSecurePass456!';

    try {
      await page.goto('/account');
      await page.locator('[data-testid="change-pw-btn"]').waitFor({ state: 'visible' });

      // Expand the password change form
      await page.locator('[data-testid="change-pw-btn"]').click();
      await expect(page.locator('[data-testid="change-pw-current"]')).toBeVisible();

      // Fill in the password change form and submit
      await page.locator('[data-testid="change-pw-current"]').fill(user.password);
      await page.locator('[data-testid="change-pw-new"]').fill(newPassword);
      await page.locator('[data-testid="change-pw-confirm"]').fill(newPassword);
      await page.locator('[data-testid="change-pw-submit"]').click();

      // Wait for the password change form to disappear (success collapses the form)
      await expect(page.locator('[data-testid="change-pw-current"]')).toBeHidden({
        timeout: 15000,
      });

      // Clear cookies to simulate a logged-out state, then re-login with the new password
      await context.clearCookies();
      await page.goto('/login');
      await page.locator('#username').waitFor({ state: 'visible' });
      await page.locator('#username').fill(user.username);
      await page.locator('#password').fill(newPassword);
      await page.locator('button[type="submit"]').click();

      await expect(page).toHaveURL(/\/rooms/, { timeout: 15000 });
    } finally {
      await context.close();
    }
  });

  test('mismatched new and confirm passwords shows a validation error', async ({
    browser,
    request,
  }) => {
    const { context, page, user } = await authenticatedContext(browser, request);

    try {
      await page.goto('/account');
      await page.locator('[data-testid="change-pw-btn"]').waitFor({ state: 'visible' });

      // Expand the password change form
      await page.locator('[data-testid="change-pw-btn"]').click();
      await expect(page.locator('[data-testid="change-pw-current"]')).toBeVisible();

      // Fill with mismatched new/confirm passwords
      await page.locator('[data-testid="change-pw-current"]').fill(user.password);
      await page.locator('[data-testid="change-pw-new"]').fill('ValidPassword1!');
      await page.locator('[data-testid="change-pw-confirm"]').fill('DifferentPassword2!');
      await page.locator('[data-testid="change-pw-submit"]').click();

      // Assert a validation error is visible in the password change section
      const pwSection = page
        .locator('[data-testid="change-pw-submit"]')
        .locator('xpath=ancestor::div[contains(@class,"border")]');
      await expect(pwSection.locator('p.text-danger')).toBeVisible();

      // The form should remain open (change-pw-submit still visible)
      await expect(page.locator('[data-testid="change-pw-submit"]')).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test('user deletes account and is redirected to login', async ({ browser, request }) => {
    const { context, page, user } = await authenticatedContext(browser, request);

    try {
      await page.goto('/account');
      await page.locator('[data-testid="delete-account-btn"]').waitFor({ state: 'visible' });

      // Start the deletion flow
      await page.locator('[data-testid="delete-account-btn"]').click();

      // Fill in the password confirmation and confirm deletion
      const passwordInput = page.locator('[data-testid="delete-password-input"]');
      await expect(passwordInput).toBeVisible();
      await passwordInput.fill(user.password);
      await page.locator('[data-testid="confirm-delete-btn"]').click();

      // After deletion, the user is redirected to /login
      await expect(page).toHaveURL(/\/login/, { timeout: 15000 });
    } finally {
      await context.close();
    }
  });

  test('user cancels account deletion and remains on account page', async ({
    browser,
    request,
  }) => {
    const { context, page } = await authenticatedContext(browser, request);

    try {
      await page.goto('/account');
      await page.locator('[data-testid="delete-account-btn"]').waitFor({ state: 'visible' });

      // Start the deletion flow to show the confirmation section
      await page.locator('[data-testid="delete-account-btn"]').click();
      await expect(page.locator('[data-testid="cancel-delete-btn"]')).toBeVisible();

      // Cancel the deletion
      await page.locator('[data-testid="cancel-delete-btn"]').click();

      // Confirmation section is hidden and the delete button is visible again
      await expect(page.locator('[data-testid="delete-account-btn"]')).toBeVisible();
      await expect(page.locator('[data-testid="cancel-delete-btn"]')).toBeHidden();
    } finally {
      await context.close();
    }
  });
});
