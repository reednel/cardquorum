import { expect, Page, test } from '@playwright/test';
import { authenticatedContext, generateTestUser, registerUser } from '../helpers/auth';

/**
 * Navigate to the friends page and wait for it to be ready.
 */
async function goToFriendsPage(page: Page): Promise<void> {
  await page.goto('/user/friends');
  await page.waitForURL(/\/user\/friends/);
  await page.locator('[data-testid="search-input"]').waitFor({ state: 'visible' });
}

/**
 * Type a search query into the search input and wait for add-friend buttons.
 */
async function searchAndWaitForResults(page: Page, username: string): Promise<void> {
  const searchInput = page.locator('[data-testid="search-input"]');
  await searchInput.click();
  await searchInput.fill(username);
  // Wait for debounced search (300ms) + API response
  await expect(page.locator('[data-testid^="add-friend-btn-"]').first()).toBeVisible({
    timeout: 15000,
  });
}

test.describe('Friends Flows', () => {
  test('user searches for another user by username and sees results', async ({
    browser,
    request,
  }) => {
    // Only User A needs a browser context; User B just needs to exist in the DB
    const userB = generateTestUser();
    await registerUser(request, userB);
    const { context: ctxA, page: pageA } = await authenticatedContext(browser, request);

    try {
      await goToFriendsPage(pageA);
      await searchAndWaitForResults(pageA, userB.username);

      // Verify the add-friend button is visible in search results
      await expect(pageA.locator('[data-testid^="add-friend-btn-"]').first()).toBeVisible();
    } finally {
      await ctxA.close();
    }
  });

  test('user sends a friend request and sees it in outgoing requests', async ({
    browser,
    request,
  }) => {
    const userB = generateTestUser();
    await registerUser(request, userB);
    const { context: ctxA, page: pageA } = await authenticatedContext(browser, request);

    try {
      await goToFriendsPage(pageA);
      await searchAndWaitForResults(pageA, userB.username);

      await pageA.locator('[data-testid^="add-friend-btn-"]').first().click();

      // After sending, a cancel button should appear in the outgoing section
      await expect(pageA.locator('[data-testid^="cancel-btn-"]').first()).toBeVisible({
        timeout: 10000,
      });

      // The empty-outgoing indicator should not be visible
      await expect(pageA.locator('[data-testid="empty-outgoing"]')).toBeHidden();
    } finally {
      await ctxA.close();
    }
  });

  test('incoming friend request is visible to the recipient', async ({ browser, request }) => {
    const { context: ctxA, page: pageA } = await authenticatedContext(browser, request);
    const {
      context: ctxB,
      page: pageB,
      user: userB,
    } = await authenticatedContext(browser, request);

    try {
      // User A sends a friend request to User B via the UI
      await goToFriendsPage(pageA);
      await searchAndWaitForResults(pageA, userB.username);
      await pageA.locator('[data-testid^="add-friend-btn-"]').first().click();

      // Wait for the outgoing request to appear (confirms the request was sent)
      await expect(pageA.locator('[data-testid^="cancel-btn-"]').first()).toBeVisible({
        timeout: 10000,
      });

      // User B navigates to friends page and sees the incoming request
      await goToFriendsPage(pageB);

      // User B should see an accept button for the incoming request
      await expect(pageB.locator('[data-testid^="accept-btn-"]').first()).toBeVisible({
        timeout: 10000,
      });

      // The empty-incoming indicator should not be visible
      await expect(pageB.locator('[data-testid="empty-incoming"]')).toBeHidden();
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });

  test('accepting a friend request adds the user to the friends list', async ({
    browser,
    request,
  }) => {
    const { context: ctxA, page: pageA } = await authenticatedContext(browser, request);
    const {
      context: ctxB,
      page: pageB,
      user: userB,
    } = await authenticatedContext(browser, request);

    try {
      // User A sends a friend request to User B via the UI
      await goToFriendsPage(pageA);
      await searchAndWaitForResults(pageA, userB.username);
      await pageA.locator('[data-testid^="add-friend-btn-"]').first().click();

      // Wait for the outgoing request to confirm it was sent
      await expect(pageA.locator('[data-testid^="cancel-btn-"]').first()).toBeVisible({
        timeout: 10000,
      });

      // User B navigates to friends page and accepts the request
      await goToFriendsPage(pageB);

      const acceptBtn = pageB.locator('[data-testid^="accept-btn-"]').first();
      await expect(acceptBtn).toBeVisible({ timeout: 10000 });
      await acceptBtn.click();

      // After accepting, a remove button should appear in the friends list
      await expect(pageB.locator('[data-testid^="remove-btn-"]').first()).toBeVisible({
        timeout: 10000,
      });

      // The empty-friends indicator should not be visible
      await expect(pageB.locator('[data-testid="empty-friends"]')).toBeHidden();
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });

  test('denying an incoming friend request removes it from the list', async ({
    browser,
    request,
  }) => {
    test.setTimeout(60000);
    const { context: ctxA, page: pageA } = await authenticatedContext(browser, request);
    const {
      context: ctxB,
      page: pageB,
      user: userB,
    } = await authenticatedContext(browser, request);

    try {
      // User A sends a friend request to User B via the UI
      await goToFriendsPage(pageA);
      await searchAndWaitForResults(pageA, userB.username);
      await pageA.locator('[data-testid^="add-friend-btn-"]').first().click();

      // Wait for the outgoing request to confirm it was sent
      await expect(pageA.locator('[data-testid^="cancel-btn-"]').first()).toBeVisible({
        timeout: 10000,
      });

      // User B navigates to friends page and sees the incoming request
      await goToFriendsPage(pageB);

      const denyBtn = pageB.locator('[data-testid^="deny-btn-"]').first();
      await expect(denyBtn).toBeVisible({ timeout: 15000 });
      await denyBtn.click();

      // After denying, the incoming requests section should be empty
      await expect(pageB.locator('[data-testid="empty-incoming"]')).toBeVisible({ timeout: 10000 });
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });

  test('cancelling an outgoing friend request removes it from the list', async ({
    browser,
    request,
  }) => {
    const { context: ctxA, page: pageA } = await authenticatedContext(browser, request);
    const { context: ctxB, user: userB } = await authenticatedContext(browser, request);

    try {
      // User A sends a friend request to User B via the UI
      await goToFriendsPage(pageA);
      await searchAndWaitForResults(pageA, userB.username);
      await pageA.locator('[data-testid^="add-friend-btn-"]').first().click();

      // Wait for the outgoing request to appear
      const cancelBtn = pageA.locator('[data-testid^="cancel-btn-"]').first();
      await expect(cancelBtn).toBeVisible({ timeout: 10000 });

      // User A clicks cancel on the outgoing request
      await cancelBtn.click();

      // After cancelling, the outgoing requests section should be empty
      await expect(pageA.locator('[data-testid="empty-outgoing"]')).toBeVisible({ timeout: 10000 });
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });

  test('removing a friend via confirm removes them from the friends list', async ({
    browser,
    request,
  }) => {
    test.setTimeout(90000);
    const { context: ctxA, page: pageA } = await authenticatedContext(browser, request);
    const {
      context: ctxB,
      page: pageB,
      user: userB,
    } = await authenticatedContext(browser, request);

    try {
      // Establish friendship: User A sends request, User B accepts
      await goToFriendsPage(pageA);
      await searchAndWaitForResults(pageA, userB.username);
      await pageA.locator('[data-testid^="add-friend-btn-"]').first().click();
      await expect(pageA.locator('[data-testid^="cancel-btn-"]').first()).toBeVisible({
        timeout: 10000,
      });

      await goToFriendsPage(pageB);
      const acceptBtn = pageB.locator('[data-testid^="accept-btn-"]').first();
      await expect(acceptBtn).toBeVisible({ timeout: 10000 });
      await acceptBtn.click();
      await expect(pageB.locator('[data-testid^="remove-btn-"]').first()).toBeVisible({
        timeout: 10000,
      });

      // User A navigates to friends page and removes the friend
      await goToFriendsPage(pageA);
      const removeBtn = pageA.locator('[data-testid^="remove-btn-"]').first();
      await expect(removeBtn).toBeVisible({ timeout: 10000 });
      await removeBtn.click();

      // Confirm removal (confirm button replaces the remove button)
      const confirmRemoveBtn = pageA.locator('[data-testid^="confirm-remove-btn-"]').first();
      await expect(confirmRemoveBtn).toBeVisible({ timeout: 3000 });
      await confirmRemoveBtn.click();

      // Friend should be removed — empty-friends indicator becomes visible
      await expect(pageA.locator('[data-testid="empty-friends"]')).toBeVisible({ timeout: 10000 });
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });

  test('removed friend is no longer visible to the other user', async ({ browser, request }) => {
    test.setTimeout(90000);
    const { context: ctxA, page: pageA } = await authenticatedContext(browser, request);
    const {
      context: ctxB,
      page: pageB,
      user: userB,
    } = await authenticatedContext(browser, request);

    try {
      // Establish friendship: User A sends request, User B accepts
      await goToFriendsPage(pageA);
      await searchAndWaitForResults(pageA, userB.username);
      await pageA.locator('[data-testid^="add-friend-btn-"]').first().click();
      await expect(pageA.locator('[data-testid^="cancel-btn-"]').first()).toBeVisible({
        timeout: 10000,
      });

      await goToFriendsPage(pageB);
      const acceptBtn = pageB.locator('[data-testid^="accept-btn-"]').first();
      await expect(acceptBtn).toBeVisible({ timeout: 10000 });
      await acceptBtn.click();
      await expect(pageB.locator('[data-testid^="remove-btn-"]').first()).toBeVisible({
        timeout: 10000,
      });

      // User A removes User B
      await goToFriendsPage(pageA);
      const removeBtn = pageA.locator('[data-testid^="remove-btn-"]').first();
      await expect(removeBtn).toBeVisible({ timeout: 10000 });
      await removeBtn.click();

      const confirmRemoveBtn = pageA.locator('[data-testid^="confirm-remove-btn-"]').first();
      await expect(confirmRemoveBtn).toBeVisible({ timeout: 3000 });
      await confirmRemoveBtn.click();

      // Wait for removal to take effect — remove button should disappear
      await expect(pageA.locator('[data-testid^="remove-btn-"]')).toBeHidden({ timeout: 10000 });

      // User B navigates to friends page and should no longer see User A
      await goToFriendsPage(pageB);
      await expect(pageB.locator('[data-testid="empty-friends"]')).toBeVisible({ timeout: 10000 });
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });

  test('blocking a user from search adds them to the blocked users section', async ({
    browser,
    request,
  }) => {
    test.setTimeout(90000);
    const userB = generateTestUser();
    await registerUser(request, userB);
    const { context: ctxA, page: pageA } = await authenticatedContext(browser, request);

    try {
      await goToFriendsPage(pageA);
      await searchAndWaitForResults(pageA, userB.username);

      // Block User B from search results
      await pageA.locator('[data-testid^="block-search-btn-"]').first().click();

      // The blocked users section should now appear with the toggle button
      const toggleBlocked = pageA.locator('[data-testid="toggle-blocked"]');
      await expect(toggleBlocked).toBeVisible({ timeout: 15000 });

      // Reload the page so the blocked section loads fresh (avoids Chromium click timing issues)
      await goToFriendsPage(pageA);
      await expect(toggleBlocked).toBeVisible({ timeout: 15000 });

      // Expand the blocked section to see the blocked user
      await toggleBlocked.dispatchEvent('click');

      // Verify an unblock button is visible for the blocked user
      await expect(pageA.locator('[data-testid^="unblock-btn-"]').first()).toBeVisible({
        timeout: 10000,
      });
    } finally {
      await ctxA.close();
    }
  });

  test('unblocking a user removes them from the blocked list', async ({ browser, request }) => {
    test.setTimeout(90000);
    const userB = generateTestUser();
    await registerUser(request, userB);
    const { context: ctxA, page: pageA } = await authenticatedContext(browser, request);

    try {
      await goToFriendsPage(pageA);
      await searchAndWaitForResults(pageA, userB.username);

      // Block User B first
      await pageA.locator('[data-testid^="block-search-btn-"]').first().click();

      // Wait for blocked section to appear
      const toggleBlocked = pageA.locator('[data-testid="toggle-blocked"]');
      await expect(toggleBlocked).toBeVisible({ timeout: 15000 });

      // Reload the page so the blocked section loads fresh
      await goToFriendsPage(pageA);
      await expect(toggleBlocked).toBeVisible({ timeout: 15000 });

      // Expand the blocked section
      await toggleBlocked.dispatchEvent('click');

      // Click unblock on the blocked user
      const unblockBtn = pageA.locator('[data-testid^="unblock-btn-"]').first();
      await expect(unblockBtn).toBeVisible({ timeout: 10000 });
      await unblockBtn.click();

      // Click confirm unblock
      const confirmUnblockBtn = pageA.locator('[data-testid^="confirm-unblock-btn-"]').first();
      await expect(confirmUnblockBtn).toBeVisible({ timeout: 3000 });
      await confirmUnblockBtn.click();

      // The blocked section should disappear since there are no more blocked users
      await expect(toggleBlocked).toBeHidden({ timeout: 10000 });
    } finally {
      await ctxA.close();
    }
  });
});
