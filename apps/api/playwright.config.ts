import { defineConfig, devices } from '@playwright/test';
import { config } from 'dotenv';

// Load environment variables from .env file
config();

/**
 * Playwright configuration for API testing
 *
 * This configuration is optimized for testing the NestJS backend API.
 * It includes multiple test projects for different scenarios.
 */
export default defineConfig({
  testDir: './tests/api',

  // Run tests in files in parallel
  fullyParallel: true,

  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!process.env.CI,

  // Retry on CI only
  retries: process.env.CI ? 2 : 0,

  // Opt out of parallel tests on CI
  workers: process.env.CI ? 1 : undefined,

  // Reporter to use
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'test-results/results.json' }],
    ['junit', { outputFile: 'test-results/junit.xml' }]
  ],

  // Shared settings for all projects
  use: {
    // Base URL for API requests (includes /api prefix from NestJS global prefix)
    baseURL: process.env.API_URL || 'http://localhost:3001/api',

    // Collect trace on first retry
    trace: 'on-first-retry',

    // Extra HTTP headers
    extraHTTPHeaders: {
      'Content-Type': 'application/json',
    },

    // Ignore HTTPS errors (for local development)
    ignoreHTTPSErrors: true,
  },

  // Configure projects for major scenarios
  projects: [
    {
      name: 'API Tests - Guest',
      testMatch: /.*\.api\.spec\.ts/,
      use: {
        // Tests that don't require authentication
        storageState: undefined,
      },
    },
    {
      name: 'API Tests - Member',
      testMatch: /.*\.api\.spec\.ts/,
      dependencies: ['setup'],
      use: {
        // Tests that require MEMBER role
        storageState: 'playwright/.auth/member.json',
      },
    },
    {
      name: 'API Tests - Contributor',
      testMatch: /.*\.api\.spec\.ts/,
      dependencies: ['setup'],
      use: {
        // Tests that require CONTRIBUTOR role
        storageState: 'playwright/.auth/contributor.json',
      },
    },
    {
      name: 'API Tests - Admin',
      testMatch: /.*\.api\.spec\.ts/,
      dependencies: ['setup'],
      use: {
        // Tests that require ADMIN role
        storageState: 'playwright/.auth/admin.json',
      },
    },
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
      testDir: './tests',
    },
  ],

  // Folder for test artifacts
  outputDir: 'test-results',

  // Global timeout for each test
  timeout: 30 * 1000,

  // Global timeout for the whole test run
  globalTimeout: 10 * 60 * 1000,

  // Maximum time expect() should wait for the condition to be met
  expect: {
    timeout: 5 * 1000,
  },

  // Run the NestJS server before starting the tests
  // Temporarily disabled - assuming server is already running
  // webServer: process.env.CI ? undefined : {
  //   command: 'pnpm run start:dev',
  //   url: 'http://localhost:3001',
  //   reuseExistingServer: !process.env.CI,
  //   timeout: 120 * 1000,
  // },
});
