# OSA Community Platform - Database Schema Specification

> **Reference**: This document defines the complete database schema. Consult when making database changes or understanding model relationships.

---

## 1. Prisma Schema

```prisma
// prisma/schema.prisma

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL") // For migrations (bypasses connection pooling)
}

generator client {
  provider = "prisma-client-js"
}

// ============================================================================
// ENUMS
// ============================================================================

enum UserRole {
  GUEST       // Can view public content only
  MEMBER      // Can register for events, manage profile
  CONTRIBUTOR // Can create/edit content
  ADMIN       // Full access
}

enum MembershipStatus {
  PENDING     // Awaiting payment
  ACTIVE      // Paid and valid
  EXPIRED     // Past expiry date
  CANCELLED   // User/admin cancelled
}

enum RegistrationStatus {
  PENDING     // Awaiting payment (paid events)
  CONFIRMED   // Seat secured
  CANCELLED   // User/admin cancelled
  COMPLETED   // Event ended (historical)
}

enum WaitlistStatus {
  WAITING     // In queue
  OFFERED     // Spot available, email sent
  ACCEPTED    // User accepted, moved to registration
  EXPIRED     // Didn't respond in time
  DECLINED    // User declined the spot
}

enum PaymentType {
  MEMBERSHIP       // One-time membership payment
  EVENT_ONETIME    // Single event registration
  EVENT_SUBSCRIPTION // Recurring event subscription
}

enum PaymentStatus {
  PENDING
  COMPLETED
  FAILED
  REFUNDED
}

// ============================================================================
// USER DOMAIN
// ============================================================================

/// Core user model - linked to Supabase Auth
model User {
  id              String    @id // Matches Supabase Auth UUID exactly
  email           String    @unique
  role            UserRole  @default(GUEST)
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  deletedAt       DateTime? // GDPR soft delete - never hard delete users
  
  // Relations
  profile              Profile?
  membership           Membership?
  eventRegistrations   EventRegistration[]
  waitlistEntries      WaitlistEntry[]
  authoredArticles     Article[]           @relation("AuthoredArticles")
  createdEvents        Event[]             @relation("CreatedEvents")
  createdPages         StaticPage[]        @relation("CreatedPages")
  payments             Payment[]
  performedAuditLogs   AuditLog[]          @relation("PerformedByUser")
  approvedMemberships  Membership[]        @relation("ApprovedByAdmin")
  uploadedMedia        Media[]             @relation("UploadedByUser")

  @@index([email])
  @@index([role])
  @@index([deletedAt])
  @@map("users")
}

/// Extended user profile information
model Profile {
  id          String   @id @default(uuid())
  userId      String   @unique
  firstName   String
  lastName    String
  spouseName  String?
  children    Json?    // Array: [{name: "Child1", age: 10, gender: "M"}]
  address     Json     // Object: {street, city, state, zip, country}
  phone       String?
  avatarUrl   String?
  bio         String?  @db.Text
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("profiles")
}

// ============================================================================
// MEMBERSHIP DOMAIN
// ============================================================================

/// Available membership tiers (managed by admin)
model MembershipType {
  id             String   @id @default(uuid())
  name           String   @unique  // "Gold", "Silver", "Lifetime", "Student"
  slug           String   @unique  // "gold", "silver", "lifetime", "student"
  description    String?  @db.Text
  price          Decimal  @db.Decimal(10, 2)
  benefits       Json?    // Array: ["Benefit 1", "Benefit 2", "Benefit 3"]
  durationMonths Int?     // null = lifetime, otherwise number of months
  isActive       Boolean  @default(true)
  sortOrder      Int      @default(0)  // For display ordering
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  
  memberships    Membership[]

  @@index([isActive, sortOrder])
  @@map("membership_types")
}

/// User membership record
model Membership {
  id               String           @id @default(uuid())
  userId           String           @unique
  membershipTypeId String
  status           MembershipStatus @default(PENDING)
  startDate        DateTime?
  expiryDate       DateTime?

  // Payment tracking
  lastPaymentId    String?          // Reference to Payment record
  stripeCustomerId String?          // For recurring (future use)

  // Admin approval (for offline payments only)
  approvedById     String?          // Admin user ID
  approvedAt       DateTime?
  approvalNote     String?          @db.Text // "Paid via check #1234"

  // Credit tracking (for memberships purchased with credit from expired membership)
  creditAppliedFromId String?       @unique // ID of expired membership whose payment was credited
  creditAmount        Decimal?      @db.Decimal(10, 2) // Amount of credit applied

  createdAt        DateTime         @default(now())
  updatedAt        DateTime         @updatedAt

  user             User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  membershipType   MembershipType   @relation(fields: [membershipTypeId], references: [id])
  approvedBy       User?            @relation("ApprovedByAdmin", fields: [approvedById], references: [id])

  // Credit tracking relations (bidirectional for audit trail)
  creditAppliedFrom Membership?     @relation("CreditApplied", fields: [creditAppliedFromId], references: [id])
  creditUsedIn      Membership?     @relation("CreditApplied")

  @@index([status])
  @@index([expiryDate])
  @@index([creditAppliedFromId])
  @@map("memberships")
}

/// Credit System Explanation:
///
/// When a user with an expired membership (within 365 days) purchases a new membership,
/// they receive credit equal to the amount paid for the expired membership.
///
/// Example Flow:
/// 1. User has membership A (Annual, $50) that expired on Jan 1, 2025
/// 2. User purchases membership B (Lifetime, $500) on Jun 1, 2025
/// 3. System creates membership B with:
///    - creditAppliedFromId = A.id
///    - creditAmount = 50.00
///    - status = PENDING
/// 4. Checkout session created for $450 ($500 - $50)
/// 5. After payment, membership B becomes ACTIVE
/// 6. Membership A now has creditUsedIn = B.id (prevents reuse)
///
/// This bidirectional relationship ensures:
/// - Audit trail for all credit usage
/// - Prevention of double-spending (one expired membership can only credit one new membership)
/// - Historical tracking of which memberships benefited from credit

// ============================================================================
// EVENT DOMAIN
// ============================================================================

/// Event categories (seeded, managed by admin)
model EventCategory {
  id          String   @id @default(uuid())
  name        String   @unique  // "Education", "Cultural", etc.
  slug        String   @unique  // "education", "cultural", etc.
  description String?  @db.Text
  color       String?  // Hex color for UI badges: "#3B82F6"
  icon        String?  // Lucide icon name: "GraduationCap"
  isActive    Boolean  @default(true)
  sortOrder   Int      @default(0)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  events      Event[]

  @@index([isActive, sortOrder])
  @@map("event_categories")
}

/// Event model
model Event {
  id                   String    @id @default(uuid())
  title                String
  slug                 String    @unique
  excerpt              String?   @db.VarChar(500)  // Short description for listings
  content              String    @db.Text          // TipTap HTML with embedded images
  categoryId           String
  
  // Scheduling
  startDate            DateTime
  endDate              DateTime?
  registrationDeadline DateTime?
  
  // Capacity management
  maxSeats             Int
  currentSeats         Int       @default(0)  // Managed by database trigger
  
  // Location
  location             String?
  locationDetails      Json?     // {address, city, state, zip, coordinates}
  isVirtual            Boolean   @default(false)
  virtualLink          String?   // Zoom/Meet link (shown only to registered users)
  
  // Payment
  isFree               Boolean   @default(true)
  price                Decimal?  @db.Decimal(10, 2)
  isRecurring          Boolean   @default(false)
  recurringInterval    String?   // "weekly", "monthly"
  stripePriceId        String?   // Stripe Price ID for recurring
  
  // Media
  featuredImage        String?   // Supabase Storage URL
  gallery              Json?     // Array of image URLs
  
  // Status
  status               String    @default("DRAFT")  // DRAFT, PUBLISHED, CANCELLED, COMPLETED
  isActive             Boolean   @default(true)
  publishedAt          DateTime?
  
  // Audit
  createdById          String
  createdAt            DateTime  @default(now())
  updatedAt            DateTime  @updatedAt
  
  // Relations
  category             EventCategory       @relation(fields: [categoryId], references: [id])
  createdBy            User                @relation("CreatedEvents", fields: [createdById], references: [id])
  registrations        EventRegistration[]
  waitlist             WaitlistEntry[]

  @@index([status, startDate])
  @@index([categoryId])
  @@index([isActive])
  @@index([slug])
  @@map("events")
}

/// Event registration record
model EventRegistration {
  id              String             @id @default(uuid())
  eventId         String
  userId          String
  status          RegistrationStatus @default(PENDING)
  
  // Payment info (for paid events)
  paymentStatus   PaymentStatus?
  stripeSessionId String?            // Checkout session ID
  stripeSubId     String?            // Subscription ID (for recurring)
  
  // Timestamps
  registeredAt    DateTime           @default(now())
  confirmedAt     DateTime?
  cancelledAt     DateTime?
  cancelReason    String?            @db.Text
  
  // Relations
  event           Event              @relation(fields: [eventId], references: [id], onDelete: Cascade)
  user            User               @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([eventId, userId])  // One registration per event per user
  @@index([eventId, status])
  @@index([userId])
  @@map("event_registrations")
}

/// Waitlist for full events
model WaitlistEntry {
  id          String         @id @default(uuid())
  eventId     String
  userId      String
  email       String         // Denormalized for faster email sending
  position    Int            // Queue position (1 = first in line)
  status      WaitlistStatus @default(WAITING)
  
  // Offer tracking
  offeredAt   DateTime?      // When spot was offered
  expiresAt   DateTime?      // Deadline to accept offer (e.g., 48 hours)
  respondedAt DateTime?      // When user responded
  
  createdAt   DateTime       @default(now())
  updatedAt   DateTime       @updatedAt
  
  // Relations
  event       Event          @relation(fields: [eventId], references: [id], onDelete: Cascade)
  user        User           @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([eventId, userId])  // One waitlist entry per event per user
  @@index([eventId, status, position])  // For efficient queue processing
  @@map("waitlist")
}

// ============================================================================
// CONTENT DOMAIN
// ============================================================================

/// News articles
model Article {
  id            String    @id @default(uuid())
  title         String
  slug          String    @unique
  excerpt       String?   @db.VarChar(500)  // For list views
  content       String    @db.Text          // TipTap HTML
  featuredImage String?   // Supabase Storage URL
  authorId      String
  status        String    @default("DRAFT")  // DRAFT, PUBLISHED, ARCHIVED
  isActive      Boolean   @default(true)
  publishedAt   DateTime?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  
  // SEO
  metaTitle       String?  @db.VarChar(60)
  metaDescription String?  @db.VarChar(160)
  
  author        User      @relation("AuthoredArticles", fields: [authorId], references: [id])

  @@index([status, publishedAt])
  @@index([isActive])
  @@index([slug])
  @@map("articles")
}

/// Static CMS pages (About, Contact, etc.)
model StaticPage {
  id              String   @id @default(uuid())
  title           String
  slug            String   @unique  // "about", "contact", "privacy-policy"
  content         String   @db.Text // TipTap HTML
  
  // Navigation
  showInNav       Boolean  @default(false)
  navOrder        Int      @default(0)
  parentId        String?  // For nested pages (future)
  
  // SEO
  metaTitle       String?  @db.VarChar(60)
  metaDescription String?  @db.VarChar(160)
  
  // Status
  isPublished     Boolean  @default(false)
  
  // Audit
  createdById     String
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  
  createdBy       User     @relation("CreatedPages", fields: [createdById], references: [id])

  @@index([isPublished])
  @@index([showInNav, navOrder])
  @@map("static_pages")
}

// ============================================================================
// PAYMENT DOMAIN
// ============================================================================

/// Payment records (all Stripe transactions)
model Payment {
  id              String        @id @default(uuid())
  userId          String
  type            PaymentType
  amount          Decimal       @db.Decimal(10, 2)
  currency        String        @default("USD")
  stripePaymentId String        @unique  // Stripe PaymentIntent or Subscription ID
  stripeSessionId String?       // Checkout Session ID
  status          PaymentStatus @default(PENDING)

  // Contextual data
  metadata        Json?         // {membershipTypeId, eventId, adminNote, adminUpdated, etc.}

  // Timestamps
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt // Auto-updated by Prisma on any change

  user            User          @relation(fields: [userId], references: [id])

  @@index([userId, createdAt])
  @@index([stripePaymentId])
  @@index([status])
  @@map("payments")
}

/// Admin Override Capability:
///
/// Admins can update payment amounts directly via PUT /payments/:id endpoint.
/// When admin updates occur:
/// - amount field is updated to new value
/// - updatedAt timestamp is automatically updated by Prisma
/// - metadata JSON is extended with:
///   {
///     adminNote: "Reason for update",
///     adminUpdated: true,
///     adminUpdatedAt: "2025-06-01T12:00:00Z"
///   }
///
/// This provides complete audit trail for admin modifications.

// ============================================================================
// MEDIA DOMAIN
// ============================================================================

/// Media uploads tracking
model Media {
  id            String   @id @default(uuid())
  fileName      String   // Generated unique filename
  originalName  String   // Original uploaded filename
  fileSize      Int      // Bytes
  mimeType      String   // "image/jpeg", "image/png", etc.
  url           String   // Full Supabase Storage URL
  bucket        String   @default("public")  // Supabase bucket name
  
  // Usage tracking
  entityType    String?  // "event", "article", "page", "profile"
  entityId      String?  // ID of the related entity
  
  // Audit
  uploadedById  String
  createdAt     DateTime @default(now())
  
  uploadedBy    User     @relation("UploadedByUser", fields: [uploadedById], references: [id])

  @@index([entityType, entityId])
  @@index([uploadedById])
  @@map("media")
}

// ============================================================================
// AUDIT & COMPLIANCE
// ============================================================================

/// Audit log for tracking all important actions
model AuditLog {
  id          String   @id @default(uuid())
  userId      String?  // Null for system actions
  action      String   // CREATE, UPDATE, DELETE, APPROVE, LOGIN, ROLE_CHANGE, etc.
  entityType  String   // User, Event, Membership, Article, etc.
  entityId    String?  // ID of affected entity
  
  // Change tracking
  oldValue    Json?    // Previous state
  newValue    Json?    // New state
  
  // Request context
  ipAddress   String?
  userAgent   String?
  
  createdAt   DateTime @default(now())
  
  user        User?    @relation("PerformedByUser", fields: [userId], references: [id])

  @@index([entityType, entityId])
  @@index([userId])
  @@index([action])
  @@index([createdAt])
  @@map("audit_logs")
}
```

---

## 2. Database Triggers

### Auth User Sync Trigger

```sql
-- Automatically create a user record when someone signs up via Supabase Auth
-- This is a backup to the JIT Sync in the API

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, role, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    'GUEST',
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on auth.users
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();
```

### Seat Counter Trigger

```sql
-- Automatically update event.currentSeats when registrations change

CREATE OR REPLACE FUNCTION public.update_event_seat_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'CONFIRMED' THEN
      UPDATE events 
      SET current_seats = current_seats + 1,
          updated_at = NOW()
      WHERE id = NEW.event_id;
    END IF;
    RETURN NEW;
    
  ELSIF TG_OP = 'UPDATE' THEN
    -- Seat was confirmed
    IF OLD.status != 'CONFIRMED' AND NEW.status = 'CONFIRMED' THEN
      UPDATE events 
      SET current_seats = current_seats + 1,
          updated_at = NOW()
      WHERE id = NEW.event_id;
    -- Seat was released
    ELSIF OLD.status = 'CONFIRMED' AND NEW.status IN ('CANCELLED', 'COMPLETED') THEN
      UPDATE events 
      SET current_seats = GREATEST(current_seats - 1, 0),
          updated_at = NOW()
      WHERE id = NEW.event_id;
    END IF;
    RETURN NEW;
    
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.status = 'CONFIRMED' THEN
      UPDATE events 
      SET current_seats = GREATEST(current_seats - 1, 0),
          updated_at = NOW()
      WHERE id = OLD.event_id;
    END IF;
    RETURN OLD;
  END IF;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_event_seats
  AFTER INSERT OR UPDATE OR DELETE ON event_registrations
  FOR EACH ROW EXECUTE FUNCTION public.update_event_seat_count();
```

### Waitlist Position Trigger

```sql
-- Automatically assign position when adding to waitlist

CREATE OR REPLACE FUNCTION public.assign_waitlist_position()
RETURNS TRIGGER AS $$
DECLARE
  next_position INT;
BEGIN
  SELECT COALESCE(MAX(position), 0) + 1 
  INTO next_position
  FROM waitlist 
  WHERE event_id = NEW.event_id 
    AND status IN ('WAITING', 'OFFERED');
  
  NEW.position := next_position;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_assign_waitlist_position
  BEFORE INSERT ON waitlist
  FOR EACH ROW EXECUTE FUNCTION public.assign_waitlist_position();
```

---

## 3. Seed Data

```typescript
// prisma/seed.ts

import { PrismaClient, UserRole } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Event Categories (as specified by OSA)
  const categories = [
    { name: 'Education', slug: 'education', color: '#3B82F6', icon: 'GraduationCap', sortOrder: 1 },
    { name: 'Cultural', slug: 'cultural', color: '#F59E0B', icon: 'Music', sortOrder: 2 },
    { name: 'Professional Networking', slug: 'professional-networking', color: '#6366F1', icon: 'Briefcase', sortOrder: 3 },
    { name: 'Health & Wellness', slug: 'health-wellness', color: '#10B981', icon: 'Heart', sortOrder: 4 },
    { name: 'Womens', slug: 'womens', color: '#EC4899', icon: 'Users', sortOrder: 5 },
    { name: 'Youths', slug: 'youths', color: '#8B5CF6', icon: 'Sparkles', sortOrder: 6 },
    { name: 'Skill Development', slug: 'skill-development', color: '#F97316', icon: 'Wrench', sortOrder: 7 },
    { name: 'Spiritual', slug: 'spiritual', color: '#14B8A6', icon: 'Sun', sortOrder: 8 },
    { name: 'Humanitarian', slug: 'humanitarian', color: '#EF4444', icon: 'HandHeart', sortOrder: 9 },
    { name: 'Odisha Development', slug: 'odisha-development', color: '#84CC16', icon: 'Building', sortOrder: 10 },
  ];

  for (const category of categories) {
    await prisma.eventCategory.upsert({
      where: { slug: category.slug },
      update: category,
      create: category,
    });
  }

  console.log('✅ Event categories seeded');

  // Membership Types
  const membershipTypes = [
    {
      name: 'Individual',
      slug: 'individual',
      description: 'Individual membership for one person',
      price: 50.00,
      benefits: ['Event registration', 'Newsletter subscription', 'Voting rights'],
      durationMonths: 12,
      isActive: true,
      sortOrder: 1,
    },
    {
      name: 'Family',
      slug: 'family',
      description: 'Family membership for household',
      price: 75.00,
      benefits: ['All Individual benefits', 'Family event discounts', 'Multiple family members'],
      durationMonths: 12,
      isActive: true,
      sortOrder: 2,
    },
    {
      name: 'Student',
      slug: 'student',
      description: 'Discounted membership for students',
      price: 25.00,
      benefits: ['Event registration', 'Newsletter subscription'],
      durationMonths: 12,
      isActive: true,
      sortOrder: 3,
    },
    {
      name: 'Lifetime',
      slug: 'lifetime',
      description: 'One-time payment for lifetime membership',
      price: 500.00,
      benefits: ['All Family benefits', 'Lifetime access', 'VIP event access'],
      durationMonths: null, // Lifetime
      isActive: true,
      sortOrder: 4,
    },
    {
      name: 'Honorary',
      slug: 'honorary',
      description: 'Special honorary membership - Admin assigned only',
      price: 0.00,
      benefits: [
        'Lifetime membership',
        'All benefits of premium membership',
        'Recognition as honorary member',
        'No payment required',
      ],
      durationMonths: null, // Lifetime
      isActive: false, // Hidden from public listing, admin-only assignment
      sortOrder: 999,
    },
  ];

  for (const type of membershipTypes) {
    await prisma.membershipType.upsert({
      where: { slug: type.slug },
      update: type,
      create: type,
    });
  }

  console.log('✅ Membership types seeded');

  // Default static pages
  const staticPages = [
    {
      title: 'About Us',
      slug: 'about',
      content: '<h1>About OSA</h1><p>The Odisha Society of the Americas...</p>',
      isPublished: true,
      showInNav: true,
      navOrder: 1,
    },
    {
      title: 'Contact',
      slug: 'contact',
      content: '<h1>Contact Us</h1><p>Get in touch with OSA...</p>',
      isPublished: true,
      showInNav: true,
      navOrder: 2,
    },
    {
      title: 'Privacy Policy',
      slug: 'privacy-policy',
      content: '<h1>Privacy Policy</h1><p>Your privacy is important...</p>',
      isPublished: true,
      showInNav: false,
      navOrder: 0,
    },
    {
      title: 'Terms of Service',
      slug: 'terms-of-service',
      content: '<h1>Terms of Service</h1><p>By using this website...</p>',
      isPublished: true,
      showInNav: false,
      navOrder: 0,
    },
  ];

  // Note: Static pages need a createdById - skip in seed or create admin user first

  console.log('✅ Database seeded successfully');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

---

## 4. Indexes and Performance

### Critical Indexes

The schema includes indexes for:

| Table | Index | Purpose |
|-------|-------|---------|
| `users` | `email` | Login lookups |
| `users` | `role` | Role-based queries |
| `users` | `deletedAt` | Active user filtering |
| `events` | `status, startDate` | Event listings |
| `events` | `categoryId` | Category filtering |
| `events` | `slug` | SEO-friendly URLs |
| `event_registrations` | `eventId, status` | Seat counting |
| `waitlist` | `eventId, status, position` | Queue processing |
| `articles` | `status, publishedAt` | News listings |
| `audit_logs` | `entityType, entityId` | Entity history |
| `audit_logs` | `createdAt` | Chronological queries |

### Query Optimization Tips

```typescript
// ✅ Good: Use select to fetch only needed fields
const events = await prisma.event.findMany({
  where: { status: 'PUBLISHED', isActive: true },
  select: {
    id: true,
    title: true,
    slug: true,
    excerpt: true,
    startDate: true,
    featuredImage: true,
    category: { select: { name: true, color: true } },
    _count: { select: { registrations: { where: { status: 'CONFIRMED' } } } },
  },
  orderBy: { startDate: 'asc' },
  take: 10,
});

// ❌ Bad: Fetching all fields and relations
const events = await prisma.event.findMany({
  include: { category: true, registrations: true, waitlist: true },
});
```

---

## 5. Migration Commands

```bash
# Generate migration from schema changes
pnpm prisma migrate dev --name <migration_name>

# Apply migrations to production
pnpm prisma migrate deploy

# Reset database (development only)
pnpm prisma migrate reset

# View database in browser
pnpm prisma studio

# Generate Prisma Client
pnpm prisma generate

# Seed database
pnpm prisma db seed
```

---

## 6. Entity Relationship Diagram

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│      User       │────▶│     Profile     │     │   AuditLog      │
│                 │     └─────────────────┘     │                 │
│  id (PK)        │                             │  id (PK)        │
│  email          │◀────────────────────────────│  userId (FK)    │
│  role           │     ┌─────────────────┐     │  action         │
│  createdAt      │────▶│   Membership    │     │  entityType     │
│  deletedAt      │     │                 │     │  entityId       │
└────────┬────────┘     │  id (PK)        │     └─────────────────┘
         │              │  userId (FK)    │
         │              │  typeId (FK)    │──────┐
         │              │  status         │      │
         │              │  approvedById   │      ▼
         │              └─────────────────┘  ┌─────────────────┐
         │                                   │ MembershipType  │
         │              ┌─────────────────┐  │                 │
         │              │   Payment       │  │  id (PK)        │
         └─────────────▶│                 │  │  name           │
                        │  id (PK)        │  │  price          │
                        │  userId (FK)    │  │  durationMonths │
                        │  type           │  └─────────────────┘
                        │  stripePaymentId│
                        └─────────────────┘

┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ EventCategory   │◀────│     Event       │────▶│     User        │
│                 │     │                 │     │  (createdBy)    │
│  id (PK)        │     │  id (PK)        │     └─────────────────┘
│  name           │     │  slug           │
│  slug           │     │  categoryId(FK) │
│  color          │     │  maxSeats       │
└─────────────────┘     │  currentSeats   │
                        │  status         │
                        └────────┬────────┘
                                 │
              ┌──────────────────┴──────────────────┐
              │                                     │
              ▼                                     ▼
    ┌─────────────────┐                   ┌─────────────────┐
    │EventRegistration│                   │  WaitlistEntry  │
    │                 │                   │                 │
    │  id (PK)        │                   │  id (PK)        │
    │  eventId (FK)   │                   │  eventId (FK)   │
    │  userId (FK)    │                   │  userId (FK)    │
    │  status         │                   │  position       │
    │  paymentStatus  │                   │  status         │
    └─────────────────┘                   │  expiresAt      │
                                          └─────────────────┘

┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│    Article      │     │   StaticPage    │     │     Media       │
│                 │     │                 │     │                 │
│  id (PK)        │     │  id (PK)        │     │  id (PK)        │
│  slug           │     │  slug           │     │  fileName       │
│  authorId (FK)  │     │  createdById(FK)│     │  url            │
│  status         │     │  isPublished    │     │  entityType     │
│  content (HTML) │     │  content (HTML) │     │  entityId       │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```
