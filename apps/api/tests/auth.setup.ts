import { test as setup } from '@playwright/test';
import path from 'path';
import * as fs from 'fs';
import {
  createTestUser,
  deleteTestUser,
} from './fixtures/supabase-helpers';
import { generateTestEmail } from './fixtures/test-data';

/**
 * Authentication Setup for Playwright API Tests
 *
 * This file creates authenticated sessions for different user roles.
 * It uses the Supabase Admin API to create test users and obtain JWT tokens.
 *
 * Test users are created with the following roles:
 * - MEMBER: Can register for events, manage profile
 * - CONTRIBUTOR: Can create/edit content
 * - ADMIN: Full access to all operations
 *
 * The JWT tokens are stored in storage state files that Playwright
 * will use to authenticate API requests during tests.
 */

// Save auth files to playwright/.auth/ (relative to apps/api/ directory)
// This matches the paths in playwright.config.ts
const authDir = path.join(__dirname, '../playwright/.auth');

// Ensure auth directory exists
if (!fs.existsSync(authDir)) {
  fs.mkdirSync(authDir, { recursive: true });
}

// Track created users for cleanup
const createdUserIds: string[] = [];

/**
 * Setup: Authenticate as MEMBER
 */
setup('authenticate as member', async ({ request }) => {
  const email = generateTestEmail('member');
  const password = 'TestMember123!';

  try {
    // Create test user in Supabase
    const { userId, accessToken } = await createTestUser(email, password);
    createdUserIds.push(userId);

    // Trigger JIT sync by calling /users/me endpoint
    // This creates the User record in our database with GUEST role
    // Using absolute URL since Playwright's baseURL isn't being applied
    const response = await request.get('http://localhost:3001/api/users/me', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok()) {
      throw new Error(
        `Failed to sync user: ${response.status()} ${await response.text()}`
      );
    }

    const user = await response.json();
    console.log(`✓ Member user created: ${email} (ID: ${userId})`);

    // For now, MEMBER users are created as GUEST via JIT sync
    // In a real test, you would need an admin to promote them to MEMBER role
    // Or manually update the database after JIT sync
    // This is a known limitation of the test setup

    // Store auth state
    await request.storageState({
      path: path.join(authDir, 'member.json'),
      cookies: [],
      origins: [
        {
          origin: 'http://localhost:3001',
          localStorage: [
            {
              name: 'supabase.auth.token',
              value: accessToken,
            },
          ],
        },
      ],
    });
  } catch (error) {
    console.error('Failed to create member user:', error);
    throw error;
  }
});

/**
 * Setup: Authenticate as CONTRIBUTOR
 */
setup('authenticate as contributor', async ({ request }) => {
  const email = generateTestEmail('contributor');
  const password = 'TestContributor123!';

  try {
    const { userId, accessToken } = await createTestUser(email, password);
    createdUserIds.push(userId);

    // Trigger JIT sync
    // Using absolute URL since Playwright's baseURL isn't being applied
    const response = await request.get('http://localhost:3001/api/users/me', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok()) {
      throw new Error(
        `Failed to sync user: ${response.status()} ${await response.text()}`
      );
    }

    console.log(`✓ Contributor user created: ${email} (ID: ${userId})`);

    // Store auth state
    await request.storageState({
      path: path.join(authDir, 'contributor.json'),
      cookies: [],
      origins: [
        {
          origin: 'http://localhost:3001',
          localStorage: [
            {
              name: 'supabase.auth.token',
              value: accessToken,
            },
          ],
        },
      ],
    });
  } catch (error) {
    console.error('Failed to create contributor user:', error);
    throw error;
  }
});

/**
 * Setup: Authenticate as ADMIN
 */
setup('authenticate as admin', async ({ request }) => {
  const email = generateTestEmail('admin');
  const password = 'TestAdmin123!';

  try {
    const { userId, accessToken } = await createTestUser(email, password);
    createdUserIds.push(userId);

    // Trigger JIT sync
    // Using absolute URL since Playwright's baseURL isn't being applied
    const response = await request.get('http://localhost:3001/api/users/me', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok()) {
      throw new Error(
        `Failed to sync user: ${response.status()} ${await response.text()}`
      );
    }

    console.log(`✓ Admin user created: ${email} (ID: ${userId})`);

    // Store auth state
    await request.storageState({
      path: path.join(authDir, 'admin.json'),
      cookies: [],
      origins: [
        {
          origin: 'http://localhost:3001',
          localStorage: [
            {
              name: 'supabase.auth.token',
              value: accessToken,
            },
          ],
        },
      ],
    });
  } catch (error) {
    console.error('Failed to create admin user:', error);
    throw error;
  }
});

/**
 * Global teardown: Clean up test users
 *
 * NOTE: Playwright doesn't have built-in global teardown for setup files.
 * Test users should be cleaned up individually within each test file's
 * afterAll hook, or manually if tests fail.
 */
setup.afterAll(async () => {
  console.log('\n🧹 Cleaning up test users...');
  for (const userId of createdUserIds) {
    try {
      await deleteTestUser(userId);
      console.log(`  ✓ Deleted user: ${userId}`);
    } catch (error) {
      console.warn(`  ⚠ Failed to delete user ${userId}:`, error);
    }
  }
});
