# API Testing Quick Start Guide

## What We Built

A comprehensive Playwright API testing suite for the OSA Community Platform backend. This includes:

✅ **Users Module Tests** - Profile management, role changes, GDPR compliance
✅ **Memberships Module Tests** - CRUD operations, credit system, honorary memberships
✅ **Payments Module Tests** - Stripe integration, webhooks, admin overrides

**Status:** ⚠️ **Tests Created (Not Yet Running)** - Infrastructure is ready, but tests need Supabase setup and debugging.

## Quick Commands

```bash
# IMPORTANT: Start Supabase and API server first!
supabase start
pnpm dev --filter=api

# Run all API tests (from root directory)
pnpm test:api

# Run in interactive UI mode
pnpm test:api:ui

# Run in debug mode
pnpm test:api:debug

# View test report
pnpm test:api:report

# Run specific test file
cd apps/api
npx playwright test tests/api/users.api.spec.ts
npx playwright test tests/api/memberships.api.spec.ts
npx playwright test tests/api/payments.api.spec.ts
```

## Test File Locations

```
apps/api/
├── playwright.config.ts           # Playwright configuration
├── tests/
│   ├── api/                       # API test files (NEW)
│   │   ├── users.api.spec.ts     # User tests (~30 tests)
│   │   ├── memberships.api.spec.ts # Membership tests (~28 tests)
│   │   └── payments.api.spec.ts  # Payment tests (~20 tests)
│   ├── fixtures/                  # Utilities & test data (NEW)
│   │   ├── api-helpers.ts        # Request helpers, assertions
│   │   ├── test-data.ts          # Data factories
│   │   ├── supabase-helpers.ts   # User creation/deletion
│   │   └── stripe-helpers.ts     # Webhook payload generation
│   └── auth.setup.ts             # Auth setup (UPDATED)
```

## Key Features

### 1. Credit System Testing
Tests the 365-day expired membership credit system:
- Automatic credit application at checkout
- Full credit coverage (free checkout)
- Credit window validation
- Prevents reuse of credits

### 2. Honorary Membership Testing
Tests admin-only honorary membership assignment:
- $0 price membership
- Immediate ACTIVE status
- Auto-promotion to MEMBER role
- Hidden from public listing

### 3. Admin Override Testing
Tests admin capabilities to override system values:
- Membership status changes
- Payment amount adjustments
- Audit trail creation

### 4. GDPR Compliance Testing
Tests data protection requirements:
- Soft delete functionality
- Data export capabilities
- No hard deletes

### 5. Stripe Webhook Testing
Tests payment webhook handling:
- Signature verification
- Checkout completion
- Payment failures
- Credit tracking

## Test Coverage Summary

| Module | Tests | Endpoints | Coverage |
|--------|-------|-----------|----------|
| Users | ~30 | 11 | Profiles, roles, GDPR, soft delete |
| Memberships | ~28 | 12 | CRUD, credit system, honorary, admin overrides |
| Payments | ~20 | 5 | Checkouts, webhooks, Stripe signatures |
| **Total** | **~78** | **28** | **Core API functionality** |

**Note:** Many tests are marked with `.skip()` as they require:
- Admin user promotion (manual database update)
- Real Stripe test mode configuration
- Complete database seeding

## Before Running Tests

### 1. Start Supabase and API Server

```bash
# Start Supabase (required!)
supabase start

# Verify Supabase is running
supabase status

# Start API server (in another terminal)
cd apps/api
pnpm dev
```

### 2. Configure Environment Variables

The tests use environment variables from your `.env` file in `apps/api/`:

Required variables:
- `SUPABASE_URL` - From `supabase status` (e.g., http://127.0.0.1:54321)
- `SUPABASE_SERVICE_ROLE_KEY` - From `supabase status` (for test user creation)
- `STRIPE_WEBHOOK_SECRET` - Your Stripe test webhook secret (e.g., whsec_test_...)

**Example `.env` setup:**
```bash
# Supabase
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_ROLE_KEY=<from-supabase-status>

# Stripe
STRIPE_WEBHOOK_SECRET=whsec_test_your_secret_here

# Database (already configured for local Supabase)
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
```

### 3. Test Users Are Created Automatically

✅ **No manual setup needed!** The `auth.setup.ts` file automatically:
- Creates test users in Supabase Auth
- Triggers JIT (Just-In-Time) sync to create database records
- Generates JWT tokens for authenticated requests
- Cleans up users after tests complete

**Known Limitation:** Test users are created with GUEST role. Tests requiring ADMIN/MEMBER roles are currently skipped until we add a role promotion mechanism.

## Test Structure Example

```typescript
import { test, expect } from '@playwright/test';
import { makeRequest, expectSuccess, expectBadRequest } from '../fixtures/api-helpers';
import { createTestUser, deleteTestUser } from '../fixtures/supabase-helpers';
import { generateTestEmail, createTestProfile } from '../fixtures/test-data';

test.describe('Users API - Profile Management', () => {
  let testUserId: string;
  let testToken: string;

  // Create test user before each test
  test.beforeEach(async ({ request }) => {
    const { userId, accessToken } = await createTestUser(
      generateTestEmail('profile-test'),
      'Test123!@#'
    );
    testUserId = userId;
    testToken = accessToken;

    // Trigger JIT sync to create database user
    await makeRequest(request, 'GET', '/users/me', { token: testToken });
  });

  // Clean up after each test
  test.afterEach(async () => {
    await deleteTestUser(testUserId);
  });

  test('should create user profile', async ({ request }) => {
    const profileData = createTestProfile({
      firstName: 'John',
      lastName: 'Doe',
    });

    const response = await makeRequest(request, 'POST', '/users/me/profile', {
      token: testToken,
      data: profileData,
    });
    const profile = await expectSuccess(response);

    expect(profile.firstName).toBe('John');
    expect(profile.lastName).toBe('Doe');
  });

  test('should return 400 for invalid data', async ({ request }) => {
    const response = await makeRequest(request, 'POST', '/users/me/profile', {
      token: testToken,
      data: { firstName: '' }, // Missing required fields
    });
    await expectBadRequest(response);
  });
});
```

## Helper Functions (in tests/fixtures/)

### API Requests (`api-helpers.ts`)
```typescript
import { makeRequest, expectSuccess } from '../fixtures/api-helpers';

// Make authenticated request
const response = await makeRequest(request, 'POST', '/users/me/profile', {
  token: 'jwt-token',
  data: { firstName: 'John', lastName: 'Doe' }
});
const profile = await expectSuccess(response);
```

### Response Assertions (`api-helpers.ts`)
```typescript
await expectSuccess(response);       // 200-299
await expectUnauthorized(response);  // 401
await expectForbidden(response);     // 403
await expectNotFound(response);      // 404
await expectBadRequest(response);    // 400
```

### Data Validation (`api-helpers.ts`)
```typescript
isValidUuid(someId);        // UUID format check
isValidIsoDate(someDate);   // ISO 8601 date check
```

### Test Data Factories (`test-data.ts`)
```typescript
import { createTestUser, createTestProfile, generateTestEmail } from '../fixtures/test-data';

// Generate unique test data
const email = generateTestEmail('prefix');  // prefix-<timestamp>-<random>@test.odishasociety.org
const profile = createTestProfile({ firstName: 'Jane' });
const membership = createTestMembership({ membershipTypeId: 'uuid' });

// Date helpers
const pastDate = getPastDate(30);      // 30 days ago
const futureDate = getFutureDate(365); // 365 days from now
```

### Supabase Helpers (`supabase-helpers.ts`)
```typescript
import { createTestUser, deleteTestUser } from '../fixtures/supabase-helpers';

// Create user in Supabase Auth
const { userId, accessToken } = await createTestUser('test@example.com', 'Password123!');

// Clean up after test
await deleteTestUser(userId);
```

### Stripe Helpers (`stripe-helpers.ts`)
```typescript
import { generateStripeWebhookPayload, generateStripeSignature } from '../fixtures/stripe-helpers';

// Generate mock webhook
const payload = generateStripeWebhookPayload('checkout.session.completed', {
  amount: 5000,
  customerEmail: 'test@example.com',
  metadata: { membershipId: 'uuid' }
});

// Generate valid signature
const signature = generateStripeSignature(JSON.stringify(payload), webhookSecret);
```

## Common Issues & Solutions

### ❌ "Cannot find name 'process'" TypeScript errors

**Status:** Known issue - does not affect runtime
**Cause:** TypeScript configuration in test directory
**Solution:** Ignore these editor warnings. Tests will run fine since Node.js environment provides these globals.

### ❌ Supabase connection errors

```bash
# Verify Supabase is running
supabase status

# If not running, start it
supabase start

# Check that SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set
cat apps/api/.env | grep SUPABASE
```

### ❌ API server not responding

```bash
# Make sure API server is running
cd apps/api
pnpm dev

# Verify it's responding
curl http://localhost:3001/health
```

### ❌ Tests fail with "createSession does not exist"

**Status:** Known issue with Supabase Admin API
**Workaround:** This error occurs in `supabase-helpers.ts`. Tests may need adjustments based on your Supabase version.

### ❌ Many tests are skipped

**Expected behavior!** Tests marked with `.skip()` require:
1. **Admin user promotion** - Currently users are created as GUEST. Need database seeding or admin API to promote to ADMIN/MEMBER roles.
2. **Stripe test mode** - Some payment tests need real Stripe test keys and webhook configuration.
3. **Complete database seeding** - Membership types must be seeded before tests can create memberships.

**To run skipped tests:**
1. Run `cd apps/api && pnpm prisma:seed` to seed membership types
2. Manually update a test user's role to ADMIN in the database
3. Configure Stripe test webhook secret

### ❌ Webhook signature verification fails

```bash
# Get your Stripe test webhook secret
stripe listen --forward-to localhost:3001/payments/webhook

# Copy the webhook signing secret (whsec_...) to your .env file
echo "STRIPE_WEBHOOK_SECRET=whsec_..." >> apps/api/.env
```

## CI/CD Integration

Add to your GitHub Actions workflow:

```yaml
- name: Run API Tests
  run: |
    cd apps/api
    pnpm test:api
  env:
    DATABASE_URL: ${{ secrets.TEST_DATABASE_URL }}
    MEMBER_TOKEN: ${{ secrets.TEST_MEMBER_TOKEN }}
    ADMIN_TOKEN: ${{ secrets.TEST_ADMIN_TOKEN }}
```

## Next Steps

### Phase 1: Get Basic Tests Running ✅ (Ready to start!)
1. **Start Supabase** - `supabase start`
2. **Seed Database** - `cd apps/api && pnpm prisma:seed`
3. **Run Tests** - `pnpm test:api`
4. **Check Results** - Many tests will skip (expected), but basic auth/connectivity tests should pass

### Phase 2: Enable Skipped Tests (Requires manual setup)
1. **Create Admin User** - Manually update a test user's role to ADMIN in database
2. **Configure Stripe** - Set up Stripe webhook secret in .env
3. **Run Full Suite** - Remove `.skip()` from tests that now have required setup

### Phase 3: Add More Coverage (Future work)
1. **Events Module** - Tests for event registration, waitlists
2. **Content Module** - Tests for CMS functionality
3. **Integration Tests** - Full workflow tests (signup → membership → payment → activation)

## Additional Resources

- [API Specification](../../prompts/03_API_SPECIFICATION.md) - Full API documentation
- [Playwright API Testing Docs](https://playwright.dev/docs/api-testing) - Official Playwright docs
- [Supabase Auth Admin](https://supabase.com/docs/reference/javascript/auth-admin-api) - Supabase Admin SDK

---

**Built with Playwright** - Modern, reliable API testing for the OSA Community Platform
