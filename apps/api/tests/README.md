# API Testing with Playwright

This directory contains Playwright-based API tests for the OSA Community Platform backend (NestJS).

## Overview

These tests verify the API functionality including:
- **Authentication & Authorization** - JWT validation, role-based access
- **Memberships** - Membership lifecycle, credit system, honorary memberships
- **Payments** - Stripe integration, webhooks, payment overrides
- **Users** - Profile management, role changes, GDPR compliance

## Directory Structure

```
tests/
├── api/                          # API test files
│   ├── auth.api.spec.ts         # Auth module tests
│   ├── memberships.api.spec.ts  # Memberships module tests
│   ├── payments.api.spec.ts     # Payments module tests
│   └── users.api.spec.ts        # Users module tests
├── fixtures/                     # Test utilities and data
│   ├── api-helpers.ts           # Common API test functions
│   └── test-data.ts             # Test data factories
└── auth.setup.ts                # Authentication setup for different roles
```

## Getting Started

### Prerequisites

1. **PostgreSQL Database** - Test database should be separate from development
2. **Supabase Project** - For authentication tokens
3. **Stripe Account** - For webhook testing (test mode)

### Installation

Playwright is already installed as a dev dependency. If you need to reinstall:

```bash
cd apps/api
pnpm add -D @playwright/test
```

### Environment Variables

Create a `.env.test` file in `apps/api/`:

```env
# API Configuration
API_URL=http://localhost:3001

# Database
DATABASE_URL=postgresql://test_user:test_pass@localhost:5432/test_db

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-key

# Test User Tokens (generated from Supabase)
TEST_USER_TOKEN=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
GUEST_TOKEN=...
MEMBER_TOKEN=...
CONTRIBUTOR_TOKEN=...
ADMIN_TOKEN=...

# Test User IDs
TEST_USER_ID=uuid-of-test-user
TEST_OTHER_USER_ID=uuid-of-other-user
TEST_TARGET_USER_ID=uuid-of-target-user

# Test Resource IDs
TEST_MEMBERSHIP_TYPE_ID=uuid-of-test-membership-type
TEST_LIFETIME_MEMBERSHIP_TYPE_ID=uuid-of-lifetime-membership-type
TEST_PENDING_MEMBERSHIP_ID=uuid-of-pending-membership
TEST_USER_MEMBERSHIP_ID=uuid-of-user-membership
TEST_USER_PAYMENT_ID=uuid-of-user-payment
TEST_PAID_EVENT_ID=uuid-of-paid-event

# Stripe
STRIPE_WEBHOOK_SECRET=whsec_test_...

# Test Users with Specific States
MEMBER_WITH_CREDIT_TOKEN=...
MEMBER_WITH_EXPIRED_TOKEN=...
MEMBER_WITH_CANCELLED_TOKEN=...
DELETED_USER_TOKEN=...
DELETABLE_USER_TOKEN=...
```

## Running Tests

### Run All Tests

```bash
cd apps/api
pnpm test:api
```

Or using npx:

```bash
npx playwright test
```

### Run Specific Test File

```bash
npx playwright test auth.api.spec.ts
```

### Run Tests for Specific Module

```bash
npx playwright test tests/api/memberships.api.spec.ts
```

### Run Tests in UI Mode (Interactive)

```bash
npx playwright test --ui
```

### Run Tests in Debug Mode

```bash
npx playwright test --debug
```

### Run Tests with Specific Project (Role)

```bash
# Run only tests that don't require authentication
npx playwright test --project="API Tests - Guest"

# Run tests requiring member role
npx playwright test --project="API Tests - Member"

# Run tests requiring admin role
npx playwright test --project="API Tests - Admin"
```

### Generate Test Report

```bash
npx playwright show-report
```

## Writing Tests

### Basic Test Structure

```typescript
import { test, expect } from '@playwright/test';
import { apiRequest, expectSuccess } from '../fixtures/api-helpers';

test.describe('Feature API', () => {
  test('should do something', async ({ request }) => {
    const response = await apiRequest(request, 'GET', '/endpoint', {
      token: process.env.MEMBER_TOKEN,
    });

    expectSuccess(response);
    expect(response.body).toHaveProperty('expectedField');
  });
});
```

### Using Test Helpers

The `api-helpers.ts` file provides useful utilities:

```typescript
// Make authenticated requests
const response = await apiRequest(request, 'POST', '/endpoint', {
  token: 'jwt-token',
  data: { field: 'value' },
  params: { page: '1' }
});

// Expect specific response types
expectSuccess(response);        // 2xx
expectUnauthorized(response);   // 401
expectForbidden(response);      // 403
expectNotFound(response);       // 404
expectValidationError(response);// 400
expectPaginatedResponse(response); // Check pagination structure

// Validate data formats
isValidUuid(someId);
isValidIsoDate(someDate);
```

### Using Test Data

```typescript
import { testUsers, testMembershipTypes, generateTestEmail } from '../fixtures/test-data';

// Use predefined test data
const memberData = testUsers.member;

// Generate unique test data
const email = generateTestEmail('newuser');
const slug = generateTestSlug('event');
```

## Test Coverage

### Current Coverage

- ✅ **Auth Module** - Authentication, JIT sync, token validation
- ✅ **Memberships Module** - CRUD, credit system, honorary memberships, admin overrides
- ✅ **Payments Module** - Checkout sessions, webhooks, payment overrides
- ✅ **Users Module** - Profile management, role changes, GDPR compliance

### To Be Added

- ⏳ **Events Module** - Event creation, registration, waitlist
- ⏳ **Content Module** - Articles, static pages
- ⏳ **Media Module** - File uploads
- ⏳ **Cron Jobs** - Scheduled tasks

## Best Practices

### 1. Use Descriptive Test Names

```typescript
✅ test('should return 401 when not authenticated')
❌ test('auth test')
```

### 2. Use Environment Variables for Tokens

```typescript
✅ test.skip(!process.env.MEMBER_TOKEN, 'Requires member token');
❌ const token = 'hardcoded-token';
```

### 3. Test Both Success and Error Cases

```typescript
test('should create resource when valid', async ({ request }) => {
  // Test success case
});

test('should return 400 when data is invalid', async ({ request }) => {
  // Test error case
});
```

### 4. Clean Up Test Data

```typescript
test.afterEach(async ({ request }) => {
  // Delete test resources created during test
  await cleanupTestData(request, token, createdResources);
});
```

### 5. Use Test Isolation

Each test should be independent and not rely on other tests' state.

### 6. Skip Tests That Require Special Setup

```typescript
test('should handle special case', async ({ request }) => {
  test.skip(!process.env.SPECIAL_TOKEN, 'Requires special setup');
  // Test code
});
```

## Authentication Setup

The `auth.setup.ts` file prepares authentication for different user roles. Before running tests, you need to:

1. **Create Test Users in Supabase**

```typescript
// Using Supabase Admin SDK
const { data: user } = await supabaseAdmin.auth.admin.createUser({
  email: 'member@test.odishasociety.org',
  password: 'test-password-123',
  email_confirm: true,
});
```

2. **Update User Roles in Database**

```sql
UPDATE users SET role = 'MEMBER' WHERE id = 'user-id';
```

3. **Get JWT Tokens**

```typescript
// Using Supabase Auth
const { data: session } = await supabase.auth.signInWithPassword({
  email: 'member@test.odishasociety.org',
  password: 'test-password-123',
});

const token = session.access_token;
```

4. **Add Tokens to `.env.test`**

## Continuous Integration

### GitHub Actions Example

```yaml
name: API Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_USER: test_user
          POSTGRES_PASSWORD: test_pass
          POSTGRES_DB: test_db
        ports:
          - 5432:5432

    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - run: pnpm install
      - run: npx playwright install --with-deps

      - name: Run API Tests
        env:
          DATABASE_URL: postgresql://test_user:test_pass@localhost:5432/test_db
          API_URL: http://localhost:3001
          # Add other env vars from secrets
        run: |
          cd apps/api
          pnpm test:api

      - uses: actions/upload-artifact@v3
        if: failure()
        with:
          name: playwright-report
          path: apps/api/playwright-report/
```

## Troubleshooting

### Tests Timing Out

- Increase the timeout in `playwright.config.ts`
- Check if the API server is running
- Verify database connection

### Authentication Errors

- Ensure JWT tokens are valid and not expired
- Check Supabase project configuration
- Verify user exists in database

### Webhook Tests Failing

- Use Stripe CLI to forward webhooks locally:
  ```bash
  stripe listen --forward-to localhost:3001/webhooks/stripe
  ```
- Verify webhook secret matches

### Database Connection Issues

- Ensure PostgreSQL is running
- Check DATABASE_URL in `.env.test`
- Run migrations: `pnpm prisma migrate deploy`

## Resources

- [Playwright API Testing Documentation](https://playwright.dev/docs/api-testing)
- [Playwright Test API](https://playwright.dev/docs/api/class-test)
- [NestJS Testing Guide](https://docs.nestjs.com/fundamentals/testing)
- [Supabase Auth Documentation](https://supabase.com/docs/guides/auth)

## Contributing

When adding new tests:

1. Follow the existing structure and naming conventions
2. Add appropriate test data to `test-data.ts`
3. Use helper functions from `api-helpers.ts`
4. Document any special setup requirements
5. Add new environment variables to `.env.test.example`
6. Update this README with new test coverage

## Support

For questions or issues with the tests:
- Check the [Testing Specification](../../../prompts/06_TESTING.md)
- Review the [API Specification](../../../prompts/03_API_SPECIFICATION.md)
- Open an issue in the project repository
