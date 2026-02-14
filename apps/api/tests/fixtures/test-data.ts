/**
 * Test Data Factories
 *
 * Functions to generate test data for users, memberships, payments, etc.
 */

/**
 * Generate test user data
 */
export function createTestUser(overrides?: {
  email?: string;
  password?: string;
  role?: 'GUEST' | 'MEMBER' | 'CONTRIBUTOR' | 'ADMIN';
}) {
  const timestamp = Date.now();
  return {
    email: overrides?.email || `test-user-${timestamp}@test.odishasociety.org`,
    password: overrides?.password || 'Test123!@#',
    role: overrides?.role || 'GUEST',
  };
}

/**
 * Generate test profile data
 */
export function createTestProfile(overrides?: {
  firstName?: string;
  lastName?: string;
  phone?: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
  };
}) {
  const timestamp = Date.now();
  return {
    firstName: overrides?.firstName || `Test`,
    lastName: overrides?.lastName || `User-${timestamp}`,
    phone: overrides?.phone || '+15550100', // International format required
    address: {
      street: overrides?.address?.street || '123 Test St',
      city: overrides?.address?.city || 'San Francisco',
      state: overrides?.address?.state || 'CA',
      zip: overrides?.address?.zip || '94102', // Changed from zipCode to zip
      country: overrides?.address?.country || 'USA',
    },
  };
}

/**
 * Generate test membership application data
 */
export function createTestMembership(overrides?: {
  membershipTypeId?: string;
}) {
  return {
    membershipTypeId:
      overrides?.membershipTypeId || 'will-be-fetched-from-api',
    // Note: API doesn't accept 'answers' field - membership applications
    // only require membershipTypeId
  };
}

/**
 * Generate test payment data
 */
export function createTestPayment(overrides?: {
  amount?: number;
  currency?: string;
  membershipId?: string;
}) {
  return {
    amount: overrides?.amount || 5000, // $50.00 in cents
    currency: overrides?.currency || 'usd',
    membershipId: overrides?.membershipId || 'will-be-created-in-test',
  };
}

/**
 * Generate unique test email
 */
export function generateTestEmail(prefix = 'test'): string {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000);
  return `${prefix}-${timestamp}-${random}@test.odishasociety.org`;
}

/**
 * Generate future date (for credit expiration testing)
 */
export function getFutureDate(daysFromNow: number): Date {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  return date;
}

/**
 * Generate past date (for expired membership testing)
 */
export function getPastDate(daysAgo: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date;
}
