# OSA Community Platform - Testing Specification

> **Reference**: This document defines testing strategies, coverage requirements, and test implementation patterns. Consult when writing tests for any feature.

---

## 1. Testing Strategy Overview

### Test Pyramid

```
                    ┌─────────────────┐
                    │      E2E        │  ← 10% (Critical user flows)
                    │   (Playwright)  │
                    ├─────────────────┤
                    │  Integration    │  ← 30% (API + DB)
                    │    (Jest)       │
                    ├─────────────────┤
                    │                 │
                    │     Unit        │  ← 60% (Business logic)
                    │    (Jest)       │
                    │                 │
                    └─────────────────┘
```

### Coverage Requirements

| Type | Minimum Coverage | Focus Areas |
|------|------------------|-------------|
| Unit Tests | 80% | Services, utilities, state machine logic |
| Integration Tests | 70% | API endpoints, database operations |
| E2E Tests | Critical paths | User registration, event registration, payments |

---

## 2. Testing Tools

| Tool | Purpose | Location |
|------|---------|----------|
| Jest | Unit + Integration testing | Both apps |
| Supertest | HTTP testing (NestJS) | `apps/api` |
| Testing Library | React component testing | `apps/web` |
| Playwright | E2E browser testing | `apps/web/e2e` |
| MSW | API mocking (frontend) | `apps/web` |
| Faker | Test data generation | Both apps |
| Prisma (test client) | Database testing | `apps/api` |

---

## 3. Test Configuration

### NestJS (apps/api)

```typescript
// jest.config.js
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverageFrom: [
    '**/*.(t|j)s',
    '!**/*.module.ts',
    '!**/main.ts',
    '!**/*.dto.ts',
    '!**/index.ts',
  ],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  setupFilesAfterEnv: ['<rootDir>/../test/setup.ts'],
};

// test/setup.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

beforeAll(async () => {
  // Connect to test database
  await prisma.$connect();
});

afterAll(async () => {
  // Cleanup and disconnect
  await prisma.$disconnect();
});

// Reset database between tests
beforeEach(async () => {
  // Use transactions for isolation
});
```

### Next.js (apps/web)

```typescript
// jest.config.js
const nextJest = require('next/jest');

const createJestConfig = nextJest({
  dir: './',
});

const customJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testEnvironment: 'jest-environment-jsdom',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  testPathIgnorePatterns: ['<rootDir>/e2e/'],
  collectCoverageFrom: [
    'components/**/*.{ts,tsx}',
    'lib/**/*.{ts,tsx}',
    'hooks/**/*.{ts,tsx}',
    '!**/*.d.ts',
  ],
};

module.exports = createJestConfig(customJestConfig);

// jest.setup.ts
import '@testing-library/jest-dom';
import { server } from './mocks/server';

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

### Playwright (E2E)

```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 13'] },
    },
  ],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});
```

---

## 4. Unit Tests

### 4.1 Service Tests (NestJS)

```typescript
// events/registration.service.spec.ts

import { Test, TestingModule } from '@nestjs/testing';
import { RegistrationService } from './registration.service';
import { PrismaService } from '../prisma/prisma.service';
import { StripeService } from '../payments/stripe.service';
import { EmailService } from '../email/email.service';
import { WaitlistService } from './waitlist.service';
import { BadRequestException, ConflictException } from '@nestjs/common';

describe('RegistrationService', () => {
  let service: RegistrationService;
  let prisma: jest.Mocked<PrismaService>;
  let stripeService: jest.Mocked<StripeService>;
  let emailService: jest.Mocked<EmailService>;
  let waitlistService: jest.Mocked<WaitlistService>;

  const mockUser = {
    id: 'user-1',
    email: 'test@example.com',
    role: 'MEMBER',
    profile: { firstName: 'Test' },
  };

  const mockEvent = {
    id: 'event-1',
    title: 'Test Event',
    maxSeats: 10,
    currentSeats: 5,
    isFree: true,
    price: null,
    status: 'PUBLISHED',
    registrationDeadline: null,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RegistrationService,
        {
          provide: PrismaService,
          useValue: {
            $transaction: jest.fn((cb) => cb(prisma)),
            event: { findUnique: jest.fn() },
            eventRegistration: {
              findUnique: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
            },
            waitlistEntry: { findUnique: jest.fn(), create: jest.fn() },
            user: { findUnique: jest.fn() },
          },
        },
        {
          provide: StripeService,
          useValue: { createEventCheckoutSession: jest.fn() },
        },
        {
          provide: EmailService,
          useValue: {
            sendEventRegistrationConfirmation: jest.fn(),
            sendWaitlistConfirmation: jest.fn(),
          },
        },
        {
          provide: WaitlistService,
          useValue: { processWaitlist: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<RegistrationService>(RegistrationService);
    prisma = module.get(PrismaService);
    stripeService = module.get(StripeService);
    emailService = module.get(EmailService);
    waitlistService = module.get(WaitlistService);
  });

  describe('register', () => {
    it('should create confirmed registration for free event with available seats', async () => {
      prisma.event.findUnique.mockResolvedValue(mockEvent);
      prisma.eventRegistration.findUnique.mockResolvedValue(null);
      prisma.waitlistEntry.findUnique.mockResolvedValue(null);
      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.eventRegistration.create.mockResolvedValue({
        id: 'reg-1',
        eventId: 'event-1',
        userId: 'user-1',
        status: 'CONFIRMED',
      });

      const result = await service.register('user-1', 'event-1');

      expect(result.type).toBe('registration');
      expect(result.registration?.status).toBe('CONFIRMED');
      expect(emailService.sendEventRegistrationConfirmation).toHaveBeenCalled();
    });

    it('should create pending registration for paid event', async () => {
      const paidEvent = { ...mockEvent, isFree: false, price: 50 };
      prisma.event.findUnique.mockResolvedValue(paidEvent);
      prisma.eventRegistration.findUnique.mockResolvedValue(null);
      prisma.waitlistEntry.findUnique.mockResolvedValue(null);
      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.eventRegistration.create.mockResolvedValue({
        id: 'reg-1',
        status: 'PENDING',
      });
      stripeService.createEventCheckoutSession.mockResolvedValue('https://checkout.stripe.com/xxx');

      const result = await service.register('user-1', 'event-1');

      expect(result.type).toBe('checkout');
      expect(result.checkoutUrl).toBeDefined();
    });

    it('should add to waitlist when event is full', async () => {
      const fullEvent = { ...mockEvent, currentSeats: 10 };
      prisma.event.findUnique.mockResolvedValue(fullEvent);
      prisma.eventRegistration.findUnique.mockResolvedValue(null);
      prisma.waitlistEntry.findUnique.mockResolvedValue(null);
      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.waitlistEntry.create.mockResolvedValue({
        id: 'wait-1',
        position: 1,
        status: 'WAITING',
      });

      const result = await service.register('user-1', 'event-1');

      expect(result.type).toBe('waitlist');
      expect(result.waitlistEntry?.status).toBe('WAITING');
    });

    it('should throw ConflictException if already registered', async () => {
      prisma.event.findUnique.mockResolvedValue(mockEvent);
      prisma.eventRegistration.findUnique.mockResolvedValue({
        id: 'reg-1',
        status: 'CONFIRMED',
      });

      await expect(service.register('user-1', 'event-1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw BadRequestException for unpublished event', async () => {
      prisma.event.findUnique.mockResolvedValue({ ...mockEvent, status: 'DRAFT' });
      prisma.eventRegistration.findUnique.mockResolvedValue(null);
      prisma.waitlistEntry.findUnique.mockResolvedValue(null);

      await expect(service.register('user-1', 'event-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException past registration deadline', async () => {
      const pastDeadline = new Date();
      pastDeadline.setDate(pastDeadline.getDate() - 1);
      
      prisma.event.findUnique.mockResolvedValue({
        ...mockEvent,
        registrationDeadline: pastDeadline,
      });
      prisma.eventRegistration.findUnique.mockResolvedValue(null);
      prisma.waitlistEntry.findUnique.mockResolvedValue(null);

      await expect(service.register('user-1', 'event-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('cancelRegistration', () => {
    it('should cancel registration and process waitlist', async () => {
      prisma.eventRegistration.findUnique.mockResolvedValue({
        id: 'reg-1',
        status: 'CONFIRMED',
        event: mockEvent,
      });
      prisma.eventRegistration.update.mockResolvedValue({
        id: 'reg-1',
        status: 'CANCELLED',
      });

      await service.cancelRegistration('user-1', 'event-1', 'Changed plans');

      expect(prisma.eventRegistration.update).toHaveBeenCalledWith({
        where: { id: 'reg-1' },
        data: expect.objectContaining({ status: 'CANCELLED' }),
      });
      expect(waitlistService.processWaitlist).toHaveBeenCalled();
    });

    it('should not process waitlist for pending cancellation', async () => {
      prisma.eventRegistration.findUnique.mockResolvedValue({
        id: 'reg-1',
        status: 'PENDING',
        event: mockEvent,
      });
      prisma.eventRegistration.update.mockResolvedValue({
        id: 'reg-1',
        status: 'CANCELLED',
      });

      await service.cancelRegistration('user-1', 'event-1');

      expect(waitlistService.processWaitlist).not.toHaveBeenCalled();
    });
  });
});
```

### 4.2 Waitlist Service Tests

```typescript
// events/waitlist.service.spec.ts

describe('WaitlistService', () => {
  // ... setup similar to above

  describe('processWaitlist', () => {
    it('should offer spot to first person in queue', async () => {
      prisma.event.findUnique.mockResolvedValue({
        id: 'event-1',
        title: 'Test',
        maxSeats: 10,
        currentSeats: 9, // One spot available
      });
      prisma.waitlistEntry.findFirst.mockResolvedValue({
        id: 'wait-1',
        userId: 'user-2',
        email: 'user2@test.com',
        position: 1,
        status: 'WAITING',
        user: { profile: { firstName: 'User' } },
      });

      await service.processWaitlist(prisma, 'event-1');

      expect(prisma.waitlistEntry.update).toHaveBeenCalledWith({
        where: { id: 'wait-1' },
        data: expect.objectContaining({
          status: 'OFFERED',
          offeredAt: expect.any(Date),
          expiresAt: expect.any(Date),
        }),
      });
      expect(emailService.sendWaitlistOffer).toHaveBeenCalled();
    });

    it('should not offer if no spots available', async () => {
      prisma.event.findUnique.mockResolvedValue({
        id: 'event-1',
        maxSeats: 10,
        currentSeats: 10, // Full
      });

      await service.processWaitlist(prisma, 'event-1');

      expect(prisma.waitlistEntry.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('acceptOffer', () => {
    it('should accept valid offer for free event', async () => {
      const entry = {
        id: 'wait-1',
        userId: 'user-1',
        eventId: 'event-1',
        status: 'OFFERED',
        expiresAt: new Date(Date.now() + 86400000), // Tomorrow
        event: { title: 'Test', isFree: true },
        user: { email: 'test@test.com', profile: {} },
      };
      prisma.waitlistEntry.findUnique.mockResolvedValue(entry);
      prisma.event.findUnique.mockResolvedValue({
        maxSeats: 10,
        currentSeats: 9,
        isFree: true,
      });

      const result = await service.acceptOffer('user-1', 'wait-1');

      expect(result.type).toBe('confirmed');
      expect(prisma.eventRegistration.create).toHaveBeenCalled();
    });

    it('should reject expired offer', async () => {
      prisma.waitlistEntry.findUnique.mockResolvedValue({
        id: 'wait-1',
        userId: 'user-1',
        status: 'OFFERED',
        expiresAt: new Date(Date.now() - 86400000), // Yesterday
      });

      await expect(service.acceptOffer('user-1', 'wait-1')).rejects.toThrow(
        'Offer has expired',
      );
    });
  });

  describe('processExpiredOffers', () => {
    it('should mark expired offers and offer to next in line', async () => {
      prisma.waitlistEntry.findMany.mockResolvedValue([
        { id: 'wait-1', eventId: 'event-1', status: 'OFFERED', expiresAt: new Date(Date.now() - 1000) },
      ]);

      const result = await service.processExpiredOffers();

      expect(result.processed).toBe(1);
      expect(prisma.waitlistEntry.update).toHaveBeenCalledWith({
        where: { id: 'wait-1' },
        data: { status: 'EXPIRED' },
      });
    });
  });
});
```

### 4.3 React Component Tests

```typescript
// components/events/EventCard.spec.tsx

import { render, screen } from '@testing-library/react';
import { EventCard } from './EventCard';

describe('EventCard', () => {
  const mockEvent = {
    id: '1',
    title: 'Cultural Festival',
    slug: 'cultural-festival',
    excerpt: 'Join us for an amazing cultural experience',
    startDate: '2025-06-15T10:00:00Z',
    featuredImage: '/images/festival.jpg',
    category: { name: 'Cultural', color: '#F59E0B' },
    currentSeats: 45,
    maxSeats: 100,
    isFree: true,
  };

  it('renders event title and excerpt', () => {
    render(<EventCard event={mockEvent} />);

    expect(screen.getByText('Cultural Festival')).toBeInTheDocument();
    expect(screen.getByText(/amazing cultural experience/)).toBeInTheDocument();
  });

  it('renders category badge with correct color', () => {
    render(<EventCard event={mockEvent} />);

    const badge = screen.getByText('Cultural');
    expect(badge).toHaveStyle({ backgroundColor: '#F59E0B' });
  });

  it('shows "Free" badge for free events', () => {
    render(<EventCard event={mockEvent} />);

    expect(screen.getByText('Free')).toBeInTheDocument();
  });

  it('shows price for paid events', () => {
    render(<EventCard event={{ ...mockEvent, isFree: false, price: 25 }} />);

    expect(screen.getByText('$25')).toBeInTheDocument();
  });

  it('displays seat availability', () => {
    render(<EventCard event={mockEvent} />);

    expect(screen.getByText('55 spots left')).toBeInTheDocument();
  });

  it('shows "Sold Out" when full', () => {
    render(<EventCard event={{ ...mockEvent, currentSeats: 100 }} />);

    expect(screen.getByText('Sold Out')).toBeInTheDocument();
  });

  it('formats date correctly', () => {
    render(<EventCard event={mockEvent} />);

    expect(screen.getByText(/June 15, 2025/)).toBeInTheDocument();
  });

  it('links to event detail page', () => {
    render(<EventCard event={mockEvent} />);

    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/events/cultural-festival');
  });
});
```

### 4.4 Hook Tests

```typescript
// hooks/useAuth.spec.ts

import { renderHook, act, waitFor } from '@testing-library/react';
import { useAuth } from './useAuth';
import { createClient } from '@/lib/supabase/client';

jest.mock('@/lib/supabase/client');

describe('useAuth', () => {
  const mockSupabase = {
    auth: {
      getSession: jest.fn(),
      onAuthStateChange: jest.fn(() => ({
        data: { subscription: { unsubscribe: jest.fn() } },
      })),
      signInWithOAuth: jest.fn(),
      signOut: jest.fn(),
    },
  };

  beforeEach(() => {
    (createClient as jest.Mock).mockReturnValue(mockSupabase);
  });

  it('returns null user when not authenticated', async () => {
    mockSupabase.auth.getSession.mockResolvedValue({
      data: { session: null },
    });

    const { result } = renderHook(() => useAuth());

    await waitFor(() => {
      expect(result.current.user).toBeNull();
      expect(result.current.loading).toBe(false);
    });
  });

  it('returns user when authenticated', async () => {
    const mockUser = { id: 'user-1', email: 'test@test.com' };
    mockSupabase.auth.getSession.mockResolvedValue({
      data: { session: { user: mockUser } },
    });

    const { result } = renderHook(() => useAuth());

    await waitFor(() => {
      expect(result.current.user).toEqual(mockUser);
    });
  });

  it('calls signInWithOAuth with correct provider', async () => {
    mockSupabase.auth.getSession.mockResolvedValue({ data: { session: null } });

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.signInWithGoogle();
    });

    expect(mockSupabase.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: expect.any(Object),
    });
  });
});
```

---

## 5. Integration Tests

### 5.1 API Endpoint Tests

```typescript
// test/events.e2e-spec.ts

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Events API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let authToken: string;
  let testEvent: any;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();

    prisma = app.get(PrismaService);

    // Setup test data
    await setupTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
    await app.close();
  });

  async function setupTestData() {
    // Create test user and get auth token
    // Create test event category
    // Create test event
  }

  describe('GET /events', () => {
    it('should return paginated events', async () => {
      const response = await request(app.getHttpServer())
        .get('/events')
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('meta');
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should filter by category', async () => {
      const response = await request(app.getHttpServer())
        .get('/events?category=cultural')
        .expect(200);

      response.body.data.forEach((event: any) => {
        expect(event.category.slug).toBe('cultural');
      });
    });

    it('should only return published events', async () => {
      const response = await request(app.getHttpServer())
        .get('/events')
        .expect(200);

      response.body.data.forEach((event: any) => {
        expect(event.status).toBe('PUBLISHED');
      });
    });
  });

  describe('GET /events/:slug', () => {
    it('should return event details', async () => {
      const response = await request(app.getHttpServer())
        .get(`/events/${testEvent.slug}`)
        .expect(200);

      expect(response.body.id).toBe(testEvent.id);
      expect(response.body.title).toBe(testEvent.title);
    });

    it('should return 404 for non-existent event', async () => {
      await request(app.getHttpServer())
        .get('/events/non-existent-slug')
        .expect(404);
    });
  });

  describe('POST /events/:id/register', () => {
    it('should require authentication', async () => {
      await request(app.getHttpServer())
        .post(`/events/${testEvent.id}/register`)
        .expect(401);
    });

    it('should register user for free event', async () => {
      const response = await request(app.getHttpServer())
        .post(`/events/${testEvent.id}/register`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(201);

      expect(response.body.type).toBe('registration');
      expect(response.body.registration.status).toBe('CONFIRMED');
    });

    it('should return checkout URL for paid event', async () => {
      // Create paid event first
      const response = await request(app.getHttpServer())
        .post(`/events/${paidEventId}/register`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(201);

      expect(response.body.type).toBe('checkout');
      expect(response.body.checkoutUrl).toContain('stripe.com');
    });

    it('should add to waitlist when event is full', async () => {
      // Create full event first
      const response = await request(app.getHttpServer())
        .post(`/events/${fullEventId}/register`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(201);

      expect(response.body.type).toBe('waitlist');
    });

    it('should return 409 if already registered', async () => {
      // Register first time
      await request(app.getHttpServer())
        .post(`/events/${testEvent.id}/register`)
        .set('Authorization', `Bearer ${authToken}`);

      // Try to register again
      await request(app.getHttpServer())
        .post(`/events/${testEvent.id}/register`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(409);
    });
  });

  describe('DELETE /events/:id/register', () => {
    it('should cancel registration', async () => {
      // Register first
      await request(app.getHttpServer())
        .post(`/events/${testEvent.id}/register`)
        .set('Authorization', `Bearer ${authToken}`);

      // Cancel
      await request(app.getHttpServer())
        .delete(`/events/${testEvent.id}/register`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Verify cancelled
      const status = await request(app.getHttpServer())
        .get(`/events/${testEvent.id}/my-registration`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(status.body.registration.status).toBe('CANCELLED');
    });
  });
});
```

### 5.2 Webhook Integration Tests

```typescript
// test/webhooks.e2e-spec.ts

import * as request from 'supertest';
import Stripe from 'stripe';

describe('Stripe Webhooks (e2e)', () => {
  // ... setup

  describe('POST /webhooks/stripe', () => {
    it('should handle checkout.session.completed', async () => {
      const event = {
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_xxx',
            metadata: {
              type: 'event_registration',
              registrationId: testRegistration.id,
              userId: testUser.id,
            },
          },
        },
      };

      const signature = generateStripeSignature(event);

      await request(app.getHttpServer())
        .post('/webhooks/stripe')
        .set('stripe-signature', signature)
        .send(event)
        .expect(200);

      // Verify registration was confirmed
      const registration = await prisma.eventRegistration.findUnique({
        where: { id: testRegistration.id },
      });
      expect(registration?.status).toBe('CONFIRMED');
    });

    it('should reject invalid signatures', async () => {
      await request(app.getHttpServer())
        .post('/webhooks/stripe')
        .set('stripe-signature', 'invalid')
        .send({})
        .expect(400);
    });
  });
});
```

---

## 6. End-to-End Tests

### 6.1 User Registration Flow

```typescript
// e2e/auth.spec.ts

import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('should allow user to sign in with Google', async ({ page }) => {
    await page.goto('/login');

    // Click Google sign-in button
    await page.click('button:has-text("Continue with Google")');

    // Note: In E2E, we typically mock OAuth or use test accounts
    // This test verifies the flow starts correctly
    await expect(page).toHaveURL(/accounts\.google\.com/);
  });

  test('should redirect unauthenticated users from protected routes', async ({ page }) => {
    await page.goto('/dashboard');

    await expect(page).toHaveURL('/login?redirect=/dashboard');
  });

  test('should show user menu when logged in', async ({ page }) => {
    // Login with test user (using auth state from setup)
    await page.goto('/');

    await expect(page.locator('[data-testid="user-menu"]')).toBeVisible();
  });
});
```

### 6.2 Event Registration Flow

```typescript
// e2e/event-registration.spec.ts

import { test, expect } from '@playwright/test';

test.describe('Event Registration', () => {
  test.use({ storageState: 'playwright/.auth/member.json' });

  test('should register for free event', async ({ page }) => {
    await page.goto('/events/test-free-event');

    // Click register button
    await page.click('button:has-text("Register")');

    // Confirm registration
    await page.click('button:has-text("Confirm")');

    // Verify success
    await expect(page.locator('[data-testid="registration-success"]')).toBeVisible();
    await expect(page.locator('text=You are registered')).toBeVisible();
  });

  test('should redirect to Stripe for paid event', async ({ page }) => {
    await page.goto('/events/test-paid-event');

    await page.click('button:has-text("Register")');
    await page.click('button:has-text("Proceed to Payment")');

    // Should redirect to Stripe Checkout
    await expect(page).toHaveURL(/checkout\.stripe\.com/);
  });

  test('should join waitlist for full event', async ({ page }) => {
    await page.goto('/events/test-full-event');

    await page.click('button:has-text("Join Waitlist")');

    await expect(page.locator('text=Added to waitlist')).toBeVisible();
    await expect(page.locator('text=Position: 1')).toBeVisible();
  });

  test('should cancel registration', async ({ page }) => {
    await page.goto('/my-events');

    // Find registered event
    await page.click('[data-testid="cancel-registration"]');

    // Confirm cancellation
    await page.click('button:has-text("Yes, Cancel")');

    await expect(page.locator('text=Registration cancelled')).toBeVisible();
  });
});
```

### 6.3 Admin Flow

```typescript
// e2e/admin.spec.ts

import { test, expect } from '@playwright/test';

test.describe('Admin Functions', () => {
  test.use({ storageState: 'playwright/.auth/admin.json' });

  test('should approve offline membership', async ({ page }) => {
    await page.goto('/admin/memberships');

    // Filter pending
    await page.selectOption('[data-testid="status-filter"]', 'PENDING');

    // Click first pending membership
    await page.click('[data-testid="membership-row"]:first-child');

    // Add approval note
    await page.fill('[data-testid="approval-note"]', 'Paid via check #1234');

    // Approve
    await page.click('button:has-text("Approve")');

    await expect(page.locator('text=Membership approved')).toBeVisible();
  });

  test('should change user role', async ({ page }) => {
    await page.goto('/admin/users');

    await page.click('[data-testid="user-row"]:first-child');

    await page.selectOption('[data-testid="role-select"]', 'CONTRIBUTOR');

    await page.click('button:has-text("Update Role")');

    await expect(page.locator('text=Role updated')).toBeVisible();
  });
});
```

---

## 7. Test Data Factories

```typescript
// test/factories/index.ts

import { faker } from '@faker-js/faker';

export const createUser = (overrides = {}) => ({
  id: faker.string.uuid(),
  email: faker.internet.email(),
  role: 'MEMBER',
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  ...overrides,
});

export const createProfile = (userId: string, overrides = {}) => ({
  id: faker.string.uuid(),
  userId,
  firstName: faker.person.firstName(),
  lastName: faker.person.lastName(),
  phone: faker.phone.number(),
  address: {
    street: faker.location.streetAddress(),
    city: faker.location.city(),
    state: faker.location.state({ abbreviated: true }),
    zip: faker.location.zipCode(),
    country: 'USA',
  },
  ...overrides,
});

export const createEvent = (categoryId: string, createdById: string, overrides = {}) => ({
  id: faker.string.uuid(),
  title: faker.lorem.sentence(4),
  slug: faker.helpers.slugify(faker.lorem.sentence(3)).toLowerCase(),
  excerpt: faker.lorem.paragraph(1),
  content: faker.lorem.paragraphs(3),
  categoryId,
  startDate: faker.date.future(),
  maxSeats: faker.number.int({ min: 10, max: 200 }),
  currentSeats: 0,
  isFree: faker.datatype.boolean(),
  price: faker.number.int({ min: 10, max: 100 }),
  status: 'PUBLISHED',
  createdById,
  ...overrides,
});

export const createRegistration = (eventId: string, userId: string, overrides = {}) => ({
  id: faker.string.uuid(),
  eventId,
  userId,
  status: 'CONFIRMED',
  registeredAt: new Date(),
  confirmedAt: new Date(),
  ...overrides,
});
```

---

## 8. CI/CD Test Pipeline

```yaml
# .github/workflows/test.yml

name: Test

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - run: pnpm install
      - run: pnpm test --coverage

      - uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info

  integration-tests:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4

      - run: pnpm install
      - run: pnpm prisma migrate deploy
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/test
      - run: pnpm test:e2e
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/test

  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4

      - run: pnpm install
      - run: pnpm exec playwright install --with-deps

      - run: pnpm build
      - run: pnpm test:e2e:ci

      - uses: actions/upload-artifact@v3
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/
```

---

## 9. Test Commands Reference

```bash
# Run all tests
pnpm test

# Run with coverage
pnpm test --coverage

# Run specific test file
pnpm test registration.service.spec.ts

# Watch mode
pnpm test --watch

# Run integration tests
pnpm test:e2e

# Run Playwright E2E tests
pnpm test:e2e:ui    # With UI
pnpm test:e2e:ci    # Headless for CI

# Update snapshots
pnpm test -u
```
