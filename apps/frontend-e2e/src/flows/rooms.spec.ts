import { expect, test } from '@playwright/test';
import { authenticatedContext } from '../helpers/auth';

test.describe('Room Flows', () => {
  test('authenticated user creates a room and sees the room name in the header', async ({
    browser,
    request,
  }) => {
    const { context, page } = await authenticatedContext(browser, request);
    const roomName = `Room-${Date.now()}`;

    try {
      await page.goto('/rooms');
      await page.waitForURL(/\/rooms$/);
      await page.locator('[data-testid="create-room-btn"]').waitFor({ state: 'visible' });

      await page.locator('[data-testid="create-room-btn"]').click();

      const nameInput = page.locator('#room-name');
      await nameInput.waitFor({ state: 'visible' });
      await nameInput.fill(roomName);

      const submitBtn = page.locator('dialog button[type="submit"]');
      await expect(submitBtn).toBeEnabled();
      await submitBtn.click();

      await page.waitForURL(/\/rooms\/\d+/);

      const header = page.locator(`p[title="${roomName}"]`);
      await expect(header).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test('created room appears in the room list after navigating back', async ({
    browser,
    request,
  }) => {
    const { context, page } = await authenticatedContext(browser, request);
    const roomName = `ListRoom-${Date.now()}`;

    try {
      await page.goto('/rooms');
      await page.waitForURL(/\/rooms$/);
      await page.locator('[data-testid="create-room-btn"]').waitFor({ state: 'visible' });

      await page.locator('[data-testid="create-room-btn"]').click();

      const nameInput = page.locator('#room-name');
      await nameInput.waitFor({ state: 'visible' });
      await nameInput.fill(roomName);

      await page.locator('dialog button[type="submit"]').click();
      await page.waitForURL(/\/rooms\/\d+/);

      await page.goto('/rooms');
      await page.waitForURL(/\/rooms$/);
      await page.locator('[data-testid="create-room-btn"]').waitFor({ state: 'visible' });

      const roomRows = page.locator('[data-testid="room-row"]');
      await expect(roomRows.filter({ hasText: roomName })).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test('empty room name keeps the submit button disabled', async ({ browser, request }) => {
    const { context, page } = await authenticatedContext(browser, request);

    try {
      await page.goto('/rooms');
      await page.waitForURL(/\/rooms$/);
      await page.locator('[data-testid="create-room-btn"]').waitFor({ state: 'visible' });

      await page.locator('[data-testid="create-room-btn"]').click();

      const nameInput = page.locator('#room-name');
      await expect(nameInput).toBeVisible();
      await expect(nameInput).toHaveValue('');

      const submitBtn = page.locator('dialog button[type="submit"]');
      await expect(submitBtn).toBeDisabled();
    } finally {
      await context.close();
    }
  });

  test('second user joins a public room and sees the room view', async ({ browser, request }) => {
    const { context: ctxA, page: pageA } = await authenticatedContext(browser, request);
    const { context: ctxB, page: pageB } = await authenticatedContext(browser, request);

    try {
      // User A creates a room
      const roomName = `JoinRoom-${Date.now()}`;
      await pageA.goto('/rooms');
      await pageA.waitForURL(/\/rooms$/);
      await pageA.locator('[data-testid="create-room-btn"]').waitFor({ state: 'visible' });
      await pageA.locator('[data-testid="create-room-btn"]').click();

      const nameInput = pageA.locator('#room-name');
      await nameInput.waitFor({ state: 'visible' });
      await nameInput.fill(roomName);
      await pageA.locator('dialog button[type="submit"]').click();
      await pageA.waitForURL(/\/rooms\/\d+/);

      // User B navigates to rooms list and joins the room
      await pageB.goto('/rooms');
      await pageB.waitForURL(/\/rooms$/);
      await pageB.locator('[data-testid="create-room-btn"]').waitFor({ state: 'visible' });

      const roomRow = pageB.locator('[data-testid="room-row"]', { hasText: roomName });
      await roomRow.locator('[data-testid="join-btn"]').click();

      // User B should be navigated to the room view
      await pageB.waitForURL(/\/rooms\/\d+/);
      const header = pageB.locator(`p[title="${roomName}"]`);
      await expect(header).toBeVisible();
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });

  test('member clicks leave and is redirected to the rooms list', async ({ browser, request }) => {
    const { context: ctxA, page: pageA } = await authenticatedContext(browser, request);
    const { context: ctxB, page: pageB } = await authenticatedContext(browser, request);

    try {
      // User A creates a room
      const roomName = `LeaveRoom-${Date.now()}`;
      await pageA.goto('/rooms');
      await pageA.waitForURL(/\/rooms$/);
      await pageA.locator('[data-testid="create-room-btn"]').waitFor({ state: 'visible' });
      await pageA.locator('[data-testid="create-room-btn"]').click();

      const nameInput = pageA.locator('#room-name');
      await nameInput.waitFor({ state: 'visible' });
      await nameInput.fill(roomName);
      await pageA.locator('dialog button[type="submit"]').click();
      await pageA.waitForURL(/\/rooms\/\d+/);

      // User B joins the room
      await pageB.goto('/rooms');
      await pageB.waitForURL(/\/rooms$/);
      await pageB.locator('[data-testid="create-room-btn"]').waitFor({ state: 'visible' });

      const roomRow = pageB.locator('[data-testid="room-row"]', { hasText: roomName });
      await roomRow.locator('[data-testid="join-btn"]').click();
      await pageB.waitForURL(/\/rooms\/\d+/);

      // User B clicks Leave
      await pageB.locator('[data-testid="leave-btn"]').click();

      // User B should be redirected to the rooms list
      await pageB.waitForURL(/\/rooms$/);
      await expect(pageB.locator('[data-testid="create-room-btn"]')).toBeVisible();
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });

  test('room owner changes room name via config modal and sees updated name in rooms list', async ({
    browser,
    request,
  }) => {
    const { context, page } = await authenticatedContext(browser, request);
    const originalName = `ConfigRoom-${Date.now()}`;
    const updatedName = `Renamed-${Date.now()}`;

    try {
      // Create a room
      await page.goto('/rooms');
      await page.waitForURL(/\/rooms$/);
      await page.locator('[data-testid="create-room-btn"]').waitFor({ state: 'visible' });
      await page.locator('[data-testid="create-room-btn"]').click();

      const nameInput = page.locator('#room-name');
      await nameInput.waitFor({ state: 'visible' });
      await nameInput.fill(originalName);
      await page.locator('dialog button[type="submit"]').click();
      await page.waitForURL(/\/rooms\/\d+/);

      // Navigate back to rooms list
      await page.goto('/rooms');
      await page.waitForURL(/\/rooms$/);
      await page.locator('[data-testid="create-room-btn"]').waitFor({ state: 'visible' });

      // Click config button on the room row
      const roomRow = page.locator('[data-testid="room-row"]', { hasText: originalName });
      await roomRow.locator('[data-testid="config-btn"]').click();

      // Change the room name in the config modal
      const configNameInput = page.locator('#config-room-name');
      await configNameInput.waitFor({ state: 'visible' });
      await configNameInput.fill(updatedName);

      // Submit the form
      const submitBtn = page.locator('dialog button[type="submit"]');
      await expect(submitBtn).toBeEnabled();
      await submitBtn.click();

      // Verify the updated name appears in the rooms list
      await expect(
        page.locator('[data-testid="room-row"]', { hasText: updatedName }),
      ).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test('room owner deletes room and it is removed from the rooms list', async ({
    browser,
    request,
  }) => {
    const { context, page } = await authenticatedContext(browser, request);
    const roomName = `DeleteRoom-${Date.now()}`;

    try {
      // Create a room
      await page.goto('/rooms');
      await page.waitForURL(/\/rooms$/);
      await page.locator('[data-testid="create-room-btn"]').waitFor({ state: 'visible' });
      await page.locator('[data-testid="create-room-btn"]').click();

      const nameInput = page.locator('#room-name');
      await nameInput.waitFor({ state: 'visible' });
      await nameInput.fill(roomName);
      await page.locator('dialog button[type="submit"]').click();
      await page.waitForURL(/\/rooms\/\d+/);

      // Navigate back to rooms list
      await page.goto('/rooms');
      await page.waitForURL(/\/rooms$/);
      await page.locator('[data-testid="create-room-btn"]').waitFor({ state: 'visible' });

      // Click config button on the room row
      const roomRow = page.locator('[data-testid="room-row"]', { hasText: roomName });
      await roomRow.locator('[data-testid="config-btn"]').click();

      // Click delete, then confirm
      await page.locator('[data-testid="delete-room-btn"]').waitFor({ state: 'visible' });
      await page.locator('[data-testid="delete-room-btn"]').click();
      await page.locator('[data-testid="confirm-delete-room-btn"]').waitFor({ state: 'visible' });
      await page.locator('[data-testid="confirm-delete-room-btn"]').click();

      // Verify the room is no longer in the list
      await expect(page.locator('[data-testid="room-row"]', { hasText: roomName })).toBeHidden();
    } finally {
      await context.close();
    }
  });

  test('non-owner does not see the config button for rooms they do not own', async ({
    browser,
    request,
  }) => {
    const { context: ctxA, page: pageA } = await authenticatedContext(browser, request);
    const { context: ctxB, page: pageB } = await authenticatedContext(browser, request);

    try {
      // User A creates a room
      const roomName = `OwnerOnly-${Date.now()}`;
      await pageA.goto('/rooms');
      await pageA.waitForURL(/\/rooms$/);
      await pageA.locator('[data-testid="create-room-btn"]').waitFor({ state: 'visible' });
      await pageA.locator('[data-testid="create-room-btn"]').click();

      const nameInput = pageA.locator('#room-name');
      await nameInput.waitFor({ state: 'visible' });
      await nameInput.fill(roomName);
      await pageA.locator('dialog button[type="submit"]').click();
      await pageA.waitForURL(/\/rooms\/\d+/);

      // User B navigates to rooms list
      await pageB.goto('/rooms');
      await pageB.waitForURL(/\/rooms$/);
      await pageB.locator('[data-testid="create-room-btn"]').waitFor({ state: 'visible' });

      // User B should see the room row but NOT the config button
      const roomRow = pageB.locator('[data-testid="room-row"]', { hasText: roomName });
      await expect(roomRow).toBeVisible();
      await expect(roomRow.locator('[data-testid="config-btn"]')).toBeHidden();
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });

  test('entering a room shows the Chat tab as the default active tab', async ({
    browser,
    request,
  }) => {
    const { context, page } = await authenticatedContext(browser, request);
    const roomName = `TabChat-${Date.now()}`;

    try {
      await page.goto('/rooms');
      await page.waitForURL(/\/rooms$/);
      await page.locator('[data-testid="create-room-btn"]').waitFor({ state: 'visible' });
      await page.locator('[data-testid="create-room-btn"]').click();

      const nameInput = page.locator('#room-name');
      await nameInput.waitFor({ state: 'visible' });
      await nameInput.fill(roomName);
      await page.locator('dialog button[type="submit"]').click();
      await page.waitForURL(/\/rooms\/\d+/);

      const chatTab = page.getByRole('tab', { name: 'Chat' });
      await expect(chatTab).toHaveAttribute('aria-selected', 'true');
    } finally {
      await context.close();
    }
  });

  test('clicking Members tab shows the members panel with a roster count', async ({
    browser,
    request,
  }) => {
    const { context, page } = await authenticatedContext(browser, request);
    const roomName = `TabMembers-${Date.now()}`;

    try {
      await page.goto('/rooms');
      await page.waitForURL(/\/rooms$/);
      await page.locator('[data-testid="create-room-btn"]').waitFor({ state: 'visible' });
      await page.locator('[data-testid="create-room-btn"]').click();

      const nameInput = page.locator('#room-name');
      await nameInput.waitFor({ state: 'visible' });
      await nameInput.fill(roomName);
      await page.locator('dialog button[type="submit"]').click();
      await page.waitForURL(/\/rooms\/\d+/);

      await page.getByRole('tab', { name: 'Members' }).click();

      await expect(page.locator('[data-testid="roster-count"]')).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test('clicking Game tab shows the game panel with the start game button for the owner', async ({
    browser,
    request,
  }) => {
    const { context, page } = await authenticatedContext(browser, request);
    const roomName = `TabGame-${Date.now()}`;

    try {
      await page.goto('/rooms');
      await page.waitForURL(/\/rooms$/);
      await page.locator('[data-testid="create-room-btn"]').waitFor({ state: 'visible' });
      await page.locator('[data-testid="create-room-btn"]').click();

      const nameInput = page.locator('#room-name');
      await nameInput.waitFor({ state: 'visible' });
      await nameInput.fill(roomName);
      await page.locator('dialog button[type="submit"]').click();
      await page.waitForURL(/\/rooms\/\d+/);

      await page.getByRole('tab', { name: 'Game' }).click();

      await expect(page.locator('[data-testid="start-game-btn"]')).toBeVisible();
    } finally {
      await context.close();
    }
  });
});
