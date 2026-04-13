import { expect, test } from '@playwright/test';
import { authenticatedContext } from '../helpers/auth';

test.describe('Room Flows', () => {
  test('authenticated user creates a room with a description and sees the room name in the header', async ({
    browser,
    request,
  }) => {
    const { context, page } = await authenticatedContext(browser, request);
    const roomName = `Room-${Date.now()}`;
    const roomDesc = 'A test room description';

    try {
      await page.goto('/memberships');
      await page.waitForURL(/\/memberships$/);
      await page.locator('[data-testid="create-room-btn"]').waitFor({ state: 'visible' });

      await page.locator('[data-testid="create-room-btn"]').click();

      const nameInput = page.locator('#room-name');
      await nameInput.waitFor({ state: 'visible' });
      await nameInput.fill(roomName);

      const descInput = page.locator('[data-testid="room-description"]');
      await descInput.fill(roomDesc);

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

  test('created room appears in the memberships table after navigating back', async ({
    browser,
    request,
  }) => {
    const { context, page } = await authenticatedContext(browser, request);
    const roomName = `ListRoom-${Date.now()}`;

    try {
      await page.goto('/memberships');
      await page.waitForURL(/\/memberships$/);
      await page.locator('[data-testid="create-room-btn"]').waitFor({ state: 'visible' });

      await page.locator('[data-testid="create-room-btn"]').click();

      const nameInput = page.locator('#room-name');
      await nameInput.waitFor({ state: 'visible' });
      await nameInput.fill(roomName);

      await page.locator('dialog button[type="submit"]').click();
      await page.waitForURL(/\/rooms\/\d+/);

      await page.goto('/memberships');
      await page.waitForURL(/\/memberships$/);
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
      await page.goto('/memberships');
      await page.waitForURL(/\/memberships$/);
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

  test('second user joins a public room from the Discover page and sees the room view', async ({
    browser,
    request,
  }) => {
    const { context: ctxA, page: pageA } = await authenticatedContext(browser, request);
    const { context: ctxB, page: pageB } = await authenticatedContext(browser, request);

    try {
      // User A creates a room from the Memberships page
      const roomName = `JoinRoom-${Date.now()}`;
      await pageA.goto('/memberships');
      await pageA.waitForURL(/\/memberships$/);
      await pageA.locator('[data-testid="create-room-btn"]').waitFor({ state: 'visible' });
      await pageA.locator('[data-testid="create-room-btn"]').click();

      const nameInput = pageA.locator('#room-name');
      await nameInput.waitFor({ state: 'visible' });
      await nameInput.fill(roomName);
      await pageA.locator('dialog button[type="submit"]').click();
      await pageA.waitForURL(/\/rooms\/\d+/);

      // User B navigates to the Discover page to find and join the room
      await pageB.goto('/discover');
      await pageB.waitForURL(/\/discover$/);

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

  test('member clicks leave on the Memberships page and the room is removed from the list', async ({
    browser,
    request,
  }) => {
    const { context: ctxA, page: pageA } = await authenticatedContext(browser, request);
    const { context: ctxB, page: pageB } = await authenticatedContext(browser, request);

    try {
      // User A creates a room
      const roomName = `LeaveRoom-${Date.now()}`;
      await pageA.goto('/memberships');
      await pageA.waitForURL(/\/memberships$/);
      await pageA.locator('[data-testid="create-room-btn"]').waitFor({ state: 'visible' });
      await pageA.locator('[data-testid="create-room-btn"]').click();

      const nameInput = pageA.locator('#room-name');
      await nameInput.waitFor({ state: 'visible' });
      await nameInput.fill(roomName);
      await pageA.locator('dialog button[type="submit"]').click();
      await pageA.waitForURL(/\/rooms\/\d+/);

      // User B joins the room via the Discover page
      await pageB.goto('/discover');
      await pageB.waitForURL(/\/discover$/);

      const discoverRow = pageB.locator('[data-testid="room-row"]', { hasText: roomName });
      await discoverRow.locator('[data-testid="join-btn"]').click();
      await pageB.waitForURL(/\/rooms\/\d+/);

      // User B navigates to the Memberships page and clicks Leave
      await pageB.goto('/memberships');
      await pageB.waitForURL(/\/memberships$/);
      await pageB.locator('[data-testid="create-room-btn"]').waitFor({ state: 'visible' });

      const membershipRow = pageB.locator('[data-testid="room-row"]', { hasText: roomName });
      await membershipRow.locator('[data-testid="leave-btn"]').click();

      // The room should no longer appear in User B's memberships
      await expect(pageB.locator('[data-testid="room-row"]', { hasText: roomName })).toBeHidden();
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });

  test('room owner changes room name and description via config modal', async ({
    browser,
    request,
  }) => {
    const { context, page } = await authenticatedContext(browser, request);
    const originalName = `ConfigRoom-${Date.now()}`;
    const updatedName = `Renamed-${Date.now()}`;
    const updatedDesc = 'Updated description text';

    try {
      // Create a room
      await page.goto('/memberships');
      await page.waitForURL(/\/memberships$/);
      await page.locator('[data-testid="create-room-btn"]').waitFor({ state: 'visible' });
      await page.locator('[data-testid="create-room-btn"]').click();

      const nameInput = page.locator('#room-name');
      await nameInput.waitFor({ state: 'visible' });
      await nameInput.fill(originalName);
      await page.locator('dialog button[type="submit"]').click();
      await page.waitForURL(/\/rooms\/\d+/);

      // Navigate back to Memberships page
      await page.goto('/memberships');
      await page.waitForURL(/\/memberships$/);
      await page.locator('[data-testid="create-room-btn"]').waitFor({ state: 'visible' });

      // Click config button on the room row
      const roomRow = page.locator('[data-testid="room-row"]', { hasText: originalName });
      await roomRow.locator('[data-testid="config-btn"]').click();

      // Change the room name in the config modal
      const configNameInput = page.locator('#config-room-name');
      await configNameInput.waitFor({ state: 'visible' });
      await configNameInput.fill(updatedName);

      // Change the room description in the config modal
      const configDescInput = page.locator('[data-testid="config-room-description"]');
      await configDescInput.fill(updatedDesc);

      // Submit the form
      const submitBtn = page.locator('dialog button[type="submit"]');
      await expect(submitBtn).toBeEnabled();
      await submitBtn.click();

      // Verify the updated name appears in the memberships table
      await expect(
        page.locator('[data-testid="room-row"]', { hasText: updatedName }),
      ).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test('room owner deletes room and it is removed from the memberships list', async ({
    browser,
    request,
  }) => {
    const { context, page } = await authenticatedContext(browser, request);
    const roomName = `DeleteRoom-${Date.now()}`;

    try {
      // Create a room
      await page.goto('/memberships');
      await page.waitForURL(/\/memberships$/);
      await page.locator('[data-testid="create-room-btn"]').waitFor({ state: 'visible' });
      await page.locator('[data-testid="create-room-btn"]').click();

      const nameInput = page.locator('#room-name');
      await nameInput.waitFor({ state: 'visible' });
      await nameInput.fill(roomName);
      await page.locator('dialog button[type="submit"]').click();
      await page.waitForURL(/\/rooms\/\d+/);

      // Navigate back to Memberships page
      await page.goto('/memberships');
      await page.waitForURL(/\/memberships$/);
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

  test('non-owner does not see the config button on the Memberships page', async ({
    browser,
    request,
  }) => {
    const { context: ctxA, page: pageA } = await authenticatedContext(browser, request);
    const { context: ctxB, page: pageB } = await authenticatedContext(browser, request);

    try {
      // User A creates a room
      const roomName = `OwnerOnly-${Date.now()}`;
      await pageA.goto('/memberships');
      await pageA.waitForURL(/\/memberships$/);
      await pageA.locator('[data-testid="create-room-btn"]').waitFor({ state: 'visible' });
      await pageA.locator('[data-testid="create-room-btn"]').click();

      const nameInput = pageA.locator('#room-name');
      await nameInput.waitFor({ state: 'visible' });
      await nameInput.fill(roomName);
      await pageA.locator('dialog button[type="submit"]').click();
      await pageA.waitForURL(/\/rooms\/\d+/);

      // User B joins the room via the Discover page
      await pageB.goto('/discover');
      await pageB.waitForURL(/\/discover$/);

      const discoverRow = pageB.locator('[data-testid="room-row"]', { hasText: roomName });
      await discoverRow.locator('[data-testid="join-btn"]').click();
      await pageB.waitForURL(/\/rooms\/\d+/);

      // User B navigates to the Memberships page
      await pageB.goto('/memberships');
      await pageB.waitForURL(/\/memberships$/);
      await pageB.locator('[data-testid="create-room-btn"]').waitFor({ state: 'visible' });

      // User B should see the room row with a Leave button, but NOT the config button
      const roomRow = pageB.locator('[data-testid="room-row"]', { hasText: roomName });
      await expect(roomRow).toBeVisible();
      await expect(roomRow.locator('[data-testid="config-btn"]')).toBeHidden();
      await expect(roomRow.locator('[data-testid="leave-btn"]')).toBeVisible();
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
      await page.goto('/memberships');
      await page.waitForURL(/\/memberships$/);
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
      await page.goto('/memberships');
      await page.waitForURL(/\/memberships$/);
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
      await page.goto('/memberships');
      await page.waitForURL(/\/memberships$/);
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

  test('nav bar Memberships link navigates to the memberships page', async ({
    browser,
    request,
  }) => {
    const { context, page } = await authenticatedContext(browser, request);

    try {
      await page.goto('/discover');
      await page.waitForURL(/\/discover$/);

      const membershipsLink = page.locator('[data-testid="nav-memberships"]');
      await membershipsLink.click();

      await page.waitForURL(/\/memberships$/);
      await expect(membershipsLink).toHaveClass(/font-semibold/);
    } finally {
      await context.close();
    }
  });

  test('nav bar Discover link navigates to the discover page', async ({ browser, request }) => {
    const { context, page } = await authenticatedContext(browser, request);

    try {
      await page.goto('/memberships');
      await page.waitForURL(/\/memberships$/);

      const discoverLink = page.locator('[data-testid="nav-discover"]');
      await discoverLink.click();

      await page.waitForURL(/\/discover$/);
      await expect(discoverLink).toHaveClass(/font-semibold/);
    } finally {
      await context.close();
    }
  });

  test('nav bar highlights the active link and not the inactive one', async ({
    browser,
    request,
  }) => {
    const { context, page } = await authenticatedContext(browser, request);

    try {
      await page.goto('/memberships');
      await page.waitForURL(/\/memberships$/);

      const membershipsLink = page.locator('[data-testid="nav-memberships"]');
      const discoverLink = page.locator('[data-testid="nav-discover"]');

      await expect(membershipsLink).toHaveClass(/font-semibold/);
      await expect(discoverLink).not.toHaveClass(/font-semibold/);

      await discoverLink.click();
      await page.waitForURL(/\/discover$/);

      await expect(discoverLink).toHaveClass(/font-semibold/);
      await expect(membershipsLink).not.toHaveClass(/font-semibold/);
    } finally {
      await context.close();
    }
  });

  test('full room shows a disabled Full button on the Discover page', async ({
    browser,
    request,
  }) => {
    const { context: ctxA, page: pageA } = await authenticatedContext(browser, request);
    const { context: ctxB, page: pageB } = await authenticatedContext(browser, request);

    try {
      // User A creates a room with memberLimit=1
      const roomName = `FullRoom-${Date.now()}`;
      await pageA.goto('/memberships');
      await pageA.waitForURL(/\/memberships$/);
      await pageA.locator('[data-testid="create-room-btn"]').waitFor({ state: 'visible' });
      await pageA.locator('[data-testid="create-room-btn"]').click();

      const nameInput = pageA.locator('#room-name');
      await nameInput.waitFor({ state: 'visible' });
      await nameInput.fill(roomName);

      const memberLimitInput = pageA.locator('[data-testid="member-limit-input"]');
      await memberLimitInput.fill('1');

      await pageA.locator('dialog button[type="submit"]').click();
      await pageA.waitForURL(/\/rooms\/\d+/);

      // User B navigates to the Discover page and finds the full room
      await pageB.goto('/discover');
      await pageB.waitForURL(/\/discover$/);

      const roomRow = pageB.locator('[data-testid="room-row"]', { hasText: roomName });
      await expect(roomRow).toBeVisible();

      // Locate the Full button by exact role name to avoid matching the room name button
      const fullButton = roomRow.getByRole('button', { name: 'Full', exact: true });
      await expect(fullButton).toBeVisible();
      await expect(fullButton).toBeDisabled();

      // Ensure there is no Join button
      await expect(roomRow.locator('[data-testid="join-btn"]')).toBeHidden();
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });
});
