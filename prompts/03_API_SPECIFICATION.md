# OSA Community Platform - API Specification

> **Reference**: This document defines all NestJS API endpoints, DTOs, and guards. Consult when developing backend features.

---

## 1. API Overview

**Base URL**: `https://api.odishasociety.org` (Production) | `http://localhost:3001` (Development)

**Authentication**: Bearer token (Supabase JWT)

**Content-Type**: `application/json`

---

## 2. Authentication

### Headers

```
Authorization: Bearer <supabase_jwt_token>
Content-Type: application/json
```

### Role-Based Access

| Endpoint Pattern | GUEST | MEMBER | CONTRIBUTOR | ADMIN |
|-----------------|-------|--------|-------------|-------|
| `GET /public/*` | ✅ | ✅ | ✅ | ✅ |
| `GET /events` (list) | ✅ | ✅ | ✅ | ✅ |
| `POST /events/*/register` | ❌ | ✅ | ✅ | ✅ |
| `POST /events` (create) | ❌ | ❌ | ✅ | ✅ |
| `GET /users` | ❌ | ❌ | ❌ | ✅ |
| `PATCH /users/*/role` | ❌ | ❌ | ❌ | ✅ |

---

## 2A. Membership Credit System

### Overview
Users with expired memberships (within 365 days) automatically receive credit toward new memberships. The credit equals the amount paid for the expired membership.

### How It Works

**Example Scenario:**
1. User purchases Annual membership for $50 on Jan 1, 2024
2. Membership expires on Jan 1, 2025
3. User wants Lifetime membership ($500) on Jun 1, 2025
4. User only pays $450 ($500 - $50 credit)

### Business Rules

| Rule | Behavior |
|------|----------|
| **Credit Window** | 365 days from expiry date |
| **Credit Amount** | Full amount paid for expired membership |
| **Eligible Statuses** | Only EXPIRED memberships (not CANCELLED) |
| **Credit Usage** | Single use only, cannot be split across multiple purchases |
| **Automatic Application** | Credit calculated and applied automatically at checkout |
| **Tracking** | Both memberships linked bidirectionally for audit trail |

### API Behavior

1. **POST /memberships** - System automatically:
   - Checks for expired memberships within 365 days
   - Finds associated completed payment
   - Links credit to new pending membership
   - Marks expired membership as credit source

2. **POST /payments/checkout-session** - System:
   - Calculates final amount (base price - credit)
   - Creates Stripe session with discounted amount
   - Credit ≥ base price → $0 checkout (membership auto-activated)

3. **Webhook: checkout.session.completed** - System:
   - Activates membership
   - Logs credit usage in audit trail
   - Prevents reuse of same expired membership credit

### Database Tracking

```typescript
// New membership created with credit
{
  id: "new-membership-id",
  membershipTypeId: "lifetime-type",
  creditAppliedFromId: "expired-membership-id",  // Links to source
  creditAmount: 50.00,
  status: "PENDING"
}

// Expired membership marked as credit source
{
  id: "expired-membership-id",
  creditUsedIn: "new-membership-id"  // Prevents double-use
}
```

---

## 3. Endpoints by Module

### 3.1 Auth Module

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          AUTH ENDPOINTS                                      │
└─────────────────────────────────────────────────────────────────────────────┘

GET /auth/me
├── Description: Get current authenticated user with profile
├── Auth: Required
├── Response: UserWithProfile
└── Notes: JIT Sync happens here if user doesn't exist in DB

POST /auth/logout
├── Description: Invalidate session (handled by Supabase, API confirmation)
├── Auth: Required
└── Response: { success: true }
```

### 3.2 Users Module

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          USERS ENDPOINTS                                     │
└─────────────────────────────────────────────────────────────────────────────┘

GET /users
├── Description: List all users (paginated)
├── Auth: ADMIN only
├── Query: ?page=1&limit=20&role=MEMBER&search=john
└── Response: PaginatedResponse<User>

GET /users/:id
├── Description: Get user by ID
├── Auth: ADMIN or own profile
└── Response: UserWithProfile

PATCH /users/:id
├── Description: Update user profile
├── Auth: ADMIN or own profile
├── Body: UpdateProfileDto
└── Response: UserWithProfile

PATCH /users/:id/role
├── Description: Change user role
├── Auth: ADMIN only
├── Body: { role: UserRole }
├── Response: User
└── Notes: Creates AuditLog entry

DELETE /users/:id
├── Description: Soft delete user (GDPR)
├── Auth: ADMIN or own account
├── Response: { success: true }
└── Notes: Sets deletedAt, doesn't hard delete

GET /users/:id/export
├── Description: Export all user data (GDPR)
├── Auth: ADMIN or own account
└── Response: UserDataExport (JSON)
```

**DTOs:**

```typescript
// dto/update-profile.dto.ts
import { z } from 'zod';

export const UpdateProfileSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  spouseName: z.string().max(100).optional().nullable(),
  children: z.array(z.object({
    name: z.string(),
    age: z.number().optional(),
    gender: z.enum(['M', 'F', 'Other']).optional(),
  })).optional().nullable(),
  address: z.object({
    street: z.string(),
    city: z.string(),
    state: z.string(),
    zip: z.string(),
    country: z.string().default('USA'),
  }),
  phone: z.string().max(20).optional().nullable(),
});

export type UpdateProfileDto = z.infer<typeof UpdateProfileSchema>;
```

### 3.3 Memberships Module

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       MEMBERSHIPS ENDPOINTS                                  │
└─────────────────────────────────────────────────────────────────────────────┘

GET /membership-types
├── Description: List available membership types
├── Auth: Public
├── Response: MembershipType[]
└── Notes: Excludes hidden types (e.g., Honorary with isActive=false)

GET /memberships
├── Description: List all memberships (paginated)
├── Auth: ADMIN only
├── Query: ?status=PENDING&page=1
└── Response: PaginatedResponse<MembershipWithUser>

GET /memberships/me
├── Description: Get current user's membership
├── Auth: Required
└── Response: MembershipWithType | null

GET /memberships/me/history
├── Description: Get current user's membership history
├── Auth: Required
└── Response: MembershipWithType[]

POST /memberships
├── Description: Create membership (initiate payment)
├── Auth: MEMBER+
├── Body: { membershipTypeId: string }
├── Response: { checkoutUrl: string } (Stripe Checkout URL)
└── Notes: Automatically calculates credit from expired memberships (within 365 days)

POST /memberships/:id/approve
├── Description: Manually approve membership (offline payment)
├── Auth: ADMIN only
├── Body: { approvalNote?: string }
├── Response: Membership
└── Notes: Used when payment made outside Stripe

PATCH /memberships/:id/cancel
├── Description: Cancel membership
├── Auth: ADMIN or owner
├── Body: { reason?: string }
└── Response: Membership

DELETE /memberships/me
├── Description: Cancel current user's membership
├── Auth: Required
├── Response: Membership
└── Notes: User can only cancel their own active membership

--- ADMIN: Honorary Membership ---

POST /memberships/honorary/assign
├── Description: Assign honorary membership to a user
├── Auth: ADMIN only
├── Body: AssignHonoraryMembershipDto
│   {
│     userId: string;      // UUID of user to grant honorary membership
│     note?: string;        // Optional reason for granting
│   }
├── Response: Membership
└── Notes: Creates ACTIVE lifetime membership with no payment required,
          promotes user to MEMBER role automatically

--- ADMIN: Membership Management ---

PUT /memberships/:id/status
├── Description: Update membership status (admin override)
├── Auth: ADMIN only
├── Body: UpdateMembershipStatusDto
│   {
│     status: MembershipStatus;  // PENDING | ACTIVE | EXPIRED | CANCELLED
│     note?: string;              // Optional admin note
│   }
├── Response: Membership
└── Notes: Updates timestamp automatically, creates audit trail

--- ADMIN: Membership Types Management ---

POST /membership-types
├── Description: Create new membership type
├── Auth: ADMIN only
├── Body: CreateMembershipTypeDto
└── Response: MembershipType

PATCH /membership-types/:id
├── Description: Update membership type
├── Auth: ADMIN only
├── Body: UpdateMembershipTypeDto
└── Response: MembershipType

DELETE /membership-types/:id
├── Description: Deactivate membership type
├── Auth: ADMIN only
└── Response: { success: true }
```

### 3.4 Events Module

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          EVENTS ENDPOINTS                                    │
└─────────────────────────────────────────────────────────────────────────────┘

GET /events
├── Description: List published events
├── Auth: Public
├── Query: ?category=cultural&status=PUBLISHED&upcoming=true&page=1&limit=10
├── Response: PaginatedResponse<EventSummary>
└── Cache: public, max-age=60

GET /events/:slug
├── Description: Get event by slug
├── Auth: Public
├── Response: EventDetail
└── Cache: public, max-age=60

POST /events
├── Description: Create new event
├── Auth: CONTRIBUTOR+
├── Body: CreateEventDto
└── Response: Event

PATCH /events/:id
├── Description: Update event
├── Auth: CONTRIBUTOR+ (creator or ADMIN)
├── Body: UpdateEventDto
└── Response: Event

DELETE /events/:id
├── Description: Deactivate event (soft delete)
├── Auth: CONTRIBUTOR+ (creator or ADMIN)
└── Response: { success: true }

PATCH /events/:id/publish
├── Description: Publish draft event
├── Auth: CONTRIBUTOR+ (creator or ADMIN)
└── Response: Event

PATCH /events/:id/cancel
├── Description: Cancel event (notifies registrants)
├── Auth: CONTRIBUTOR+ (creator or ADMIN)
├── Body: { reason?: string }
└── Response: Event

--- Categories ---

GET /event-categories
├── Description: List event categories
├── Auth: Public
└── Response: EventCategory[]

POST /event-categories
├── Description: Create category
├── Auth: ADMIN only
├── Body: CreateCategoryDto
└── Response: EventCategory

PATCH /event-categories/:id
├── Description: Update category
├── Auth: ADMIN only
└── Response: EventCategory
```

**DTOs:**

```typescript
// dto/create-event.dto.ts
export const CreateEventSchema = z.object({
  title: z.string().min(1).max(200),
  slug: z.string().regex(/^[a-z0-9-]+$/).optional(), // Auto-generated if not provided
  excerpt: z.string().max(500).optional(),
  content: z.string(), // TipTap HTML
  categoryId: z.string().uuid(),
  
  startDate: z.string().datetime(),
  endDate: z.string().datetime().optional(),
  registrationDeadline: z.string().datetime().optional(),
  
  maxSeats: z.number().int().positive(),
  
  location: z.string().optional(),
  isVirtual: z.boolean().default(false),
  virtualLink: z.string().url().optional(),
  
  isFree: z.boolean().default(true),
  price: z.number().positive().optional(),
  isRecurring: z.boolean().default(false),
  recurringInterval: z.enum(['weekly', 'monthly']).optional(),
  
  featuredImage: z.string().url().optional(),
  
  status: z.enum(['DRAFT', 'PUBLISHED']).default('DRAFT'),
});
```

### 3.5 Registration Module

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       REGISTRATION ENDPOINTS                                 │
└─────────────────────────────────────────────────────────────────────────────┘

POST /events/:eventId/register
├── Description: Register for event
├── Auth: MEMBER+
├── Response (free event): { registration: EventRegistration }
├── Response (paid event): { checkoutUrl: string }
├── Response (full event): { waitlistEntry: WaitlistEntry }
└── Notes: State machine handles logic

DELETE /events/:eventId/register
├── Description: Cancel registration
├── Auth: MEMBER+ (own registration)
├── Response: { success: true }
└── Notes: Triggers waitlist processing

GET /events/:eventId/my-registration
├── Description: Get user's registration status for event
├── Auth: MEMBER+
└── Response: { registration?: EventRegistration, waitlist?: WaitlistEntry }

GET /events/:eventId/attendees
├── Description: List event attendees
├── Auth: CONTRIBUTOR+ (event creator or ADMIN)
├── Query: ?status=CONFIRMED
└── Response: PaginatedResponse<RegistrationWithUser>

--- Waitlist ---

POST /waitlist/:entryId/accept
├── Description: Accept waitlist offer
├── Auth: MEMBER+ (own entry)
├── Response (free): { registration: EventRegistration }
├── Response (paid): { checkoutUrl: string }
└── Notes: Must be within expiry time

POST /waitlist/:entryId/decline
├── Description: Decline waitlist offer
├── Auth: MEMBER+ (own entry)
└── Response: { success: true }

--- My Registrations ---

GET /my-events
├── Description: Get current user's event registrations
├── Auth: Required
├── Query: ?status=CONFIRMED&upcoming=true
└── Response: EventRegistration[]
```

### 3.6 Content Module

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          ARTICLES ENDPOINTS                                  │
└─────────────────────────────────────────────────────────────────────────────┘

GET /articles
├── Description: List published articles
├── Auth: Public
├── Query: ?page=1&limit=10
├── Response: PaginatedResponse<ArticleSummary>
└── Cache: public, max-age=60

GET /articles/:slug
├── Description: Get article by slug
├── Auth: Public
├── Response: Article
└── Cache: public, max-age=300

POST /articles
├── Description: Create article
├── Auth: CONTRIBUTOR+
├── Body: CreateArticleDto
└── Response: Article

PATCH /articles/:id
├── Description: Update article
├── Auth: CONTRIBUTOR+ (author or ADMIN)
├── Body: UpdateArticleDto
└── Response: Article

DELETE /articles/:id
├── Description: Deactivate article
├── Auth: CONTRIBUTOR+ (author or ADMIN)
└── Response: { success: true }

┌─────────────────────────────────────────────────────────────────────────────┐
│                        STATIC PAGES ENDPOINTS                                │
└─────────────────────────────────────────────────────────────────────────────┘

GET /pages
├── Description: List all pages (for CMS)
├── Auth: CONTRIBUTOR+
└── Response: StaticPage[]

GET /pages/:slug
├── Description: Get page by slug
├── Auth: Public (if published)
└── Response: StaticPage

POST /pages
├── Description: Create page
├── Auth: CONTRIBUTOR+
├── Body: CreatePageDto
└── Response: StaticPage

PATCH /pages/:id
├── Description: Update page
├── Auth: CONTRIBUTOR+
├── Body: UpdatePageDto
└── Response: StaticPage

DELETE /pages/:id
├── Description: Delete page
├── Auth: ADMIN only
└── Response: { success: true }
```

### 3.7 Payments Module

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PAYMENTS ENDPOINTS                                   │
└─────────────────────────────────────────────────────────────────────────────┘

GET /payments/my
├── Description: Get current user's payment history
├── Auth: Required
└── Response: Payment[]

GET /payments/:id
├── Description: Get payment details
├── Auth: ADMIN or owner
└── Response: Payment

POST /payments/checkout-session
├── Description: Create Stripe checkout session for membership or event
├── Auth: Required
├── Body: CreateCheckoutSessionDto
│   {
│     membershipId?: string;  // For membership payments
│     eventId?: string;        // For event registrations
│   }
├── Response: { sessionId: string, url: string }
└── Notes: Automatically applies credit from expired memberships (within 365 days).
          Example: $50 annual membership expired within 1 year → $500 lifetime
          membership will be discounted to $450 at checkout.

--- ADMIN: Payment Management ---

PUT /payments/:id
├── Description: Update payment amount (admin override)
├── Auth: ADMIN only
├── Body: UpdatePaymentDto
│   {
│     amount: number;      // New payment amount
│     note?: string;       // Optional admin note explaining the change
│   }
├── Response: Payment
└── Notes: Updates timestamp automatically, stores admin note in metadata

POST /webhooks/stripe
├── Description: Stripe webhook handler
├── Auth: Stripe signature verification
├── Headers: stripe-signature
├── Body: Raw Stripe event
└── Response: { received: true }

Events handled:
├── checkout.session.completed → Activate membership or confirm registration
│                                Tracks credit usage from expired memberships
├── invoice.payment_succeeded → Renew subscription
├── invoice.payment_failed → Mark payment failed, notify user
├── customer.subscription.deleted → Handle subscription cancellation
```

### 3.8 Media Module

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          MEDIA ENDPOINTS                                     │
└─────────────────────────────────────────────────────────────────────────────┘

POST /media/upload
├── Description: Upload file to Supabase Storage
├── Auth: CONTRIBUTOR+
├── Body: multipart/form-data { file, entityType?, entityId? }
├── Response: { url: string, media: Media }
└── Limits: Max 5MB, images only (jpg, png, gif, webp)

DELETE /media/:id
├── Description: Delete uploaded media
├── Auth: CONTRIBUTOR+ (uploader or ADMIN)
└── Response: { success: true }

GET /media
├── Description: List uploaded media
├── Auth: CONTRIBUTOR+
├── Query: ?entityType=event&entityId=xxx
└── Response: Media[]
```

### 3.9 Cron Module

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          CRON ENDPOINTS                                      │
│               (Called by Vercel Cron, protected by secret)                   │
└─────────────────────────────────────────────────────────────────────────────┘

POST /cron/process-expired-offers
├── Description: Check waitlist offers past expiry, move to next person
├── Auth: CRON_SECRET header
├── Schedule: Every 15 minutes
└── Response: { processed: number }

POST /cron/send-event-reminders
├── Description: Send reminder emails for events starting soon
├── Auth: CRON_SECRET header
├── Schedule: Daily at 9 AM EST
└── Response: { sent: number }

POST /cron/update-expired-memberships
├── Description: Mark expired memberships
├── Auth: CRON_SECRET header
├── Schedule: Daily at midnight
└── Response: { updated: number }

POST /cron/cleanup-pending-registrations
├── Description: Cancel stale pending registrations (unpaid > 24h)
├── Auth: CRON_SECRET header
├── Schedule: Every hour
└── Response: { cleaned: number }
```

---

## 4. Guards Implementation

### JWT Auth Guard

```typescript
// auth/guards/jwt-auth.guard.ts

import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { SupabaseService } from '../supabase.service';
import { UsersService } from '../../users/users.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private supabaseService: SupabaseService,
    private usersService: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('No token provided');
    }

    try {
      // Validate JWT with Supabase
      const { data: { user: authUser }, error } = await this.supabaseService
        .getClient()
        .auth.getUser(token);

      if (error || !authUser) {
        throw new UnauthorizedException('Invalid token');
      }

      // JIT Sync: Ensure user exists in our database
      let dbUser = await this.usersService.findById(authUser.id);

      if (!dbUser) {
        // Create user on first API access
        dbUser = await this.usersService.create({
          id: authUser.id,
          email: authUser.email!,
          role: 'GUEST',
        });
      }

      // Check if user is soft-deleted
      if (dbUser.deletedAt) {
        throw new UnauthorizedException('Account has been deleted');
      }

      // Attach user to request
      request.user = dbUser;
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('Authentication failed');
    }
  }

  private extractToken(request: Request): string | null {
    const auth = request.headers['authorization'];
    if (auth?.startsWith('Bearer ')) {
      return auth.substring(7);
    }
    return null;
  }
}
```

### Roles Guard

```typescript
// auth/guards/roles.guard.ts

import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';

const ROLE_HIERARCHY: Record<UserRole, number> = {
  GUEST: 0,
  MEMBER: 1,
  CONTRIBUTOR: 2,
  ADMIN: 3,
};

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true; // No roles required
    }

    const { user } = context.switchToHttp().getRequest();
    
    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    const userRoleLevel = ROLE_HIERARCHY[user.role];
    const minRequiredLevel = Math.min(...requiredRoles.map(r => ROLE_HIERARCHY[r]));

    if (userRoleLevel < minRequiredLevel) {
      throw new ForbiddenException(`Requires ${requiredRoles.join(' or ')} role`);
    }

    return true;
  }
}
```

### Roles Decorator

```typescript
// auth/decorators/roles.decorator.ts

import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@prisma/client';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
```

### Current User Decorator

```typescript
// auth/decorators/current-user.decorator.ts

import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
```

---

## 5. Response Types

```typescript
// types/responses.ts

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, string[]>;
  };
}

// Usage in controllers
@Get('events')
async getEvents(@Query() query: EventsQueryDto): Promise<PaginatedResponse<EventSummary>> {
  return this.eventsService.findAll(query);
}
```

---

## 6. Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `AUTH_REQUIRED` | 401 | Authentication required |
| `AUTH_INVALID_TOKEN` | 401 | Invalid or expired token |
| `AUTH_FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `VALIDATION_ERROR` | 400 | Request validation failed |
| `EVENT_FULL` | 409 | Event has no available seats |
| `EVENT_CLOSED` | 409 | Registration deadline passed |
| `ALREADY_REGISTERED` | 409 | User already registered for event |
| `WAITLIST_EXPIRED` | 410 | Waitlist offer has expired |
| `PAYMENT_FAILED` | 402 | Payment processing failed |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

---

## 7. Webhook Security

### Stripe Webhook Verification

```typescript
// payments/webhooks.controller.ts

import { Controller, Post, Req, Res, Headers, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';
import Stripe from 'stripe';
import { ConfigService } from '@nestjs/config';

@Controller('webhooks')
export class WebhooksController {
  private stripe: Stripe;

  constructor(
    private configService: ConfigService,
    private paymentsService: PaymentsService,
  ) {
    this.stripe = new Stripe(configService.get('STRIPE_SECRET_KEY'));
  }

  @Post('stripe')
  async handleStripeWebhook(
    @Req() req: Request,
    @Res() res: Response,
    @Headers('stripe-signature') signature: string,
  ) {
    const webhookSecret = this.configService.get('STRIPE_WEBHOOK_SECRET');
    let event: Stripe.Event;

    try {
      event = this.stripe.webhooks.constructEvent(
        req.body, // Raw body
        signature,
        webhookSecret,
      );
    } catch (err) {
      console.error('Webhook signature verification failed:', err.message);
      return res.status(HttpStatus.BAD_REQUEST).send(`Webhook Error: ${err.message}`);
    }

    // Handle specific events
    switch (event.type) {
      case 'checkout.session.completed':
        await this.handleCheckoutComplete(event.data.object as Stripe.Checkout.Session);
        break;
      case 'invoice.payment_succeeded':
        await this.handleInvoicePaid(event.data.object as Stripe.Invoice);
        break;
      case 'invoice.payment_failed':
        await this.handleInvoiceFailed(event.data.object as Stripe.Invoice);
        break;
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return res.status(HttpStatus.OK).json({ received: true });
  }
}
```

### Cron Endpoint Security

```typescript
// cron/cron.controller.ts

import { Controller, Post, Headers, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Controller('cron')
export class CronController {
  constructor(
    private configService: ConfigService,
    private cronService: CronService,
  ) {}

  private verifyCronSecret(secret: string) {
    const expectedSecret = this.configService.get('CRON_SECRET');
    if (secret !== `Bearer ${expectedSecret}`) {
      throw new UnauthorizedException('Invalid cron secret');
    }
  }

  @Post('process-expired-offers')
  async processExpiredOffers(@Headers('authorization') auth: string) {
    this.verifyCronSecret(auth);
    return this.cronService.processExpiredOffers();
  }
}
```
