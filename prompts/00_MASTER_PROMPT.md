# OSA Community Platform - Master Implementation Guide

> **Purpose**: This is the primary orchestration document for Claude Code. Reference this document at the start of every implementation session to maintain architectural integrity.

---

## Project Overview

**Project Name**: OSA Community Platform  
**Organization**: The Odisha Society of the Americas (501(c)(3) Non-Profit)  
**Domain**: odishasociety.org  

### Quick Reference - Tech Stack

| Layer | Technology | Hosting | Cost |
|-------|------------|---------|------|
| Frontend | Next.js 14+ (App Router) | Vercel (Non-profit FREE) | $0 |
| Backend | NestJS + Prisma | Railway | ~$12/mo |
| Database | PostgreSQL | Supabase Pro (US East) | $25/mo |
| Auth | Supabase Auth | Supabase | Included |
| Storage | Supabase Storage | Supabase | Included |
| Email | Resend | Resend | $0 (free tier) |
| Payments | Stripe | Stripe | 2.2% + $0.30 |
| CDN/DNS | Cloudflare | Cloudflare (Galileo) | $0 |

**Total Fixed Monthly Cost**: ~$38/month

---

## Related Prompt Documents

Before implementing any feature, consult the relevant prompt documents:

| Document | Purpose | When to Reference |
|----------|---------|-------------------|
| [01_ARCHITECTURE.md](./01_ARCHITECTURE.md) | System architecture, data flow, module structure | Starting new features, understanding system design |
| [02_DATABASE_SCHEMA.md](./02_DATABASE_SCHEMA.md) | Prisma schema, migrations, triggers | Database changes, model relationships |
| [03_API_SPECIFICATION.md](./03_API_SPECIFICATION.md) | NestJS endpoints, DTOs, guards | Backend API development |
| [04_FRONTEND_SPECIFICATION.md](./04_FRONTEND_SPECIFICATION.md) | Next.js routes, components, pages | Frontend development |
| [05_STATE_MACHINE.md](./05_STATE_MACHINE.md) | Registration & waitlist state logic | Event registration features |
| [06_TESTING.md](./06_TESTING.md) | Test strategies, coverage requirements | Writing tests |
| [07_SECURITY.md](./07_SECURITY.md) | Security practices, vulnerabilities | All development |
| [08_COST_OPTIMIZATION.md](./08_COST_OPTIMIZATION.md) | Cost-aware decisions | Infrastructure decisions |

---

## Core Principles

### 1. Architecture Integrity Rules

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ARCHITECTURE RULES                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ALWAYS:                                                                     │
│  ✓ Keep business logic in NestJS backend, not Next.js                       │
│  ✓ Use Prisma for all database operations                                   │
│  ✓ Validate data with Zod on both frontend and backend                      │
│  ✓ Use the State Machine pattern for registrations/waitlist                 │
│  ✓ Log all admin actions to AuditLog                                        │
│  ✓ Use ISR for public pages, dynamic for authenticated pages                │
│  ✓ Handle payments via Stripe webhooks, never trust client                  │
│                                                                              │
│  NEVER:                                                                      │
│  ✗ Store sensitive data in frontend state or localStorage                   │
│  ✗ Make direct database calls from Next.js (except Server Actions)          │
│  ✗ Skip input validation                                                    │
│  ✗ Bypass the state machine for registration status changes                 │
│  ✗ Store payment card information                                           │
│  ✗ Deploy without running tests                                             │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2. User Roles Hierarchy

```
ADMIN (highest)
  ├── Can: Everything
  ├── Manage user roles
  ├── Approve offline memberships
  ├── Access all dashboards
  └── System configuration

CONTRIBUTOR
  ├── Can: All MEMBER capabilities +
  ├── Create/edit/deactivate events
  ├── Create/edit/deactivate articles
  ├── Create/edit static pages
  └── Upload media

MEMBER
  ├── Can: All GUEST capabilities +
  ├── Register for events
  ├── Join waitlists
  ├── Manage profile
  └── View membership status

GUEST (lowest)
  ├── Can: View public content
  ├── View events (no registration)
  ├── View news articles
  └── View static pages
```

### 3. Membership Features

#### 3.1 Credit System for Upgrades

Users with expired memberships (within 365 days) automatically receive credit toward new memberships:

```
Example:
User purchases Annual membership ($50) → Expires Jan 1, 2025
User wants Lifetime membership ($500) → Jun 1, 2025 (within 365 days)
System applies $50 credit → User pays only $450

Business Rules:
✓ Credit window: 365 days from expiry date
✓ Only EXPIRED memberships qualify (not CANCELLED)
✓ Single use per expired membership
✓ Full credit amount (no partial credits)
✓ Automatic application at checkout
✓ Bidirectional tracking for audit trail
```

#### 3.2 Honorary Membership

Special membership type for recognition purposes:

```
Characteristics:
- $0 price (no payment required)
- Lifetime duration
- Hidden from public listing (isActive: false)
- Admin-only assignment via POST /memberships/honorary/assign
- Immediately ACTIVE upon assignment
- Automatically promotes user to MEMBER role

Use Cases:
- Recognition of special contributions
- Board member benefits
- Community leader acknowledgment
```

#### 3.3 Admin Override Capabilities

Admins can manually override system values for exceptional cases:

```
Membership Status Override:
PUT /memberships/:id/status
- Change status: PENDING → ACTIVE, etc.
- Add admin note explaining the change
- Automatic timestamp update

Payment Amount Override:
PUT /payments/:id
- Update payment amount
- Add admin note
- Tracked in payment metadata for audit
- Automatic timestamp update

Audit Trail:
- All changes tracked with admin ID
- Notes stored for compliance
- Timestamps automatically updated
```

### 4. Data Flow Pattern

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Next.js    │────▶│   NestJS     │────▶│   Supabase   │
│   Frontend   │◀────│   Backend    │◀────│   Database   │
└──────────────┘     └──────────────┘     └──────────────┘
       │                    │                    │
       │                    │                    │
       ▼                    ▼                    ▼
  [Vercel Edge]      [Railway Docker]    [PostgreSQL US-East]
  
  Auth Flow:
  1. User clicks "Login" → Supabase Auth handles OAuth
  2. Supabase returns JWT → Stored in httpOnly cookie
  3. Next.js sends JWT to NestJS → JIT Sync creates/fetches user
  4. NestJS returns user data → Frontend renders dashboard
```

---

## Implementation Phases

### Phase 1: Foundation (Week 1-2)
**Goal**: Project scaffolding, database, authentication

```
Tasks:
├── [ ] Initialize monorepo (Turborepo)
│   ├── apps/web (Next.js)
│   └── apps/api (NestJS)
├── [ ] Set up Supabase project (US East)
├── [ ] Apply Prisma schema
├── [ ] Create database triggers (auth sync, seat counter)
├── [ ] Implement Supabase Auth (Gmail + Microsoft)
├── [ ] Create JIT Sync AuthGuard in NestJS
├── [ ] Deploy to Vercel + Railway
└── [ ] Configure environment variables

Reference: 01_ARCHITECTURE.md, 02_DATABASE_SCHEMA.md
```

### Phase 2: User & Membership (Week 3-4)
**Goal**: User profiles, membership system, payments

```
Tasks:
├── [ ] User profile CRUD (NestJS + Next.js)
├── [ ] Membership types management (Admin)
├── [ ] Stripe integration
│   ├── Checkout session creation
│   ├── Webhook handler
│   └── Customer portal
├── [ ] Auto-approve membership on payment success
├── [ ] Admin manual approval for offline payments
├── [ ] Credit system for expired memberships (365-day window)
├── [ ] Honorary membership type (admin-only assignment)
├── [ ] Admin overrides for membership status and payment amounts
├── [ ] GDPR: soft delete + data export endpoint
└── [ ] Audit logging for admin actions

Reference: 03_API_SPECIFICATION.md, 07_SECURITY.md
```

### Phase 3: Content Management (Week 5-6)
**Goal**: CMS for articles, events, static pages

```
Tasks:
├── [ ] TipTap editor component with image upload
├── [ ] Static pages CRUD
├── [ ] News articles CRUD
├── [ ] Event categories seed data
├── [ ] Events CRUD
├── [ ] Media management (Supabase Storage)
├── [ ] ISR caching configuration
└── [ ] Contributor dashboard

Reference: 04_FRONTEND_SPECIFICATION.md
```

### Phase 4: Event Registration (Week 7-8)
**Goal**: Registration system with state machine

```
Tasks:
├── [ ] Event registration flow
├── [ ] State machine implementation
│   ├── Registration states
│   └── Waitlist states
├── [ ] Seat management (DB triggers)
├── [ ] Waitlist with auto-promotion
├── [ ] Paid events (one-time + recurring)
├── [ ] Email notifications (Resend)
├── [ ] Vercel Cron jobs for expired offers
└── [ ] Event reminders

Reference: 05_STATE_MACHINE.md, 03_API_SPECIFICATION.md
```

### Phase 5: Testing & Optimization (Week 9-10)
**Goal**: Quality assurance, performance

```
Tasks:
├── [ ] Unit tests (80% coverage)
├── [ ] Integration tests
├── [ ] E2E tests (critical paths)
├── [ ] Performance testing
├── [ ] Caching optimization
├── [ ] SEO audit
├── [ ] Accessibility audit (WCAG 2.1 AA)
└── [ ] Security audit

Reference: 06_TESTING.md, 07_SECURITY.md
```

### Phase 6: Launch Preparation (Week 11-12)
**Goal**: Production readiness

```
Tasks:
├── [ ] Production environment setup
├── [ ] DNS configuration (Cloudflare)
├── [ ] SSL certificates
├── [ ] Monitoring setup (Vercel Analytics)
├── [ ] Error tracking (Sentry)
├── [ ] Backup verification
├── [ ] Documentation
├── [ ] Admin training materials
└── [ ] Go-live checklist

Reference: 08_COST_OPTIMIZATION.md
```

---

## Quick Start Commands

### Initial Setup

```bash
# Clone and install
git clone <repo-url>
cd osa-community-platform
pnpm install

# Environment setup
cp apps/web/.env.example apps/web/.env.local
cp apps/api/.env.example apps/api/.env

# Database setup
cd apps/api
pnpm prisma generate
pnpm prisma migrate dev

# Start development
cd ../..
pnpm dev
```

### Common Development Commands

```bash
# Run all apps
pnpm dev

# Run specific app
pnpm dev --filter=web
pnpm dev --filter=api

# Database operations
pnpm prisma studio      # Visual database browser
pnpm prisma migrate dev # Create migration
pnpm prisma db seed     # Seed data

# Testing
pnpm test              # Run all tests
pnpm test:e2e          # E2E tests
pnpm test:coverage     # Coverage report

# Linting & Formatting
pnpm lint
pnpm format
```

---

## Environment Variables Reference

### Next.js (apps/web/.env.local)

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx

# API
NEXT_PUBLIC_API_URL=http://localhost:3001
API_URL=http://localhost:3001

# Stripe
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_xxx

# Cron Secret
CRON_SECRET=xxx
```

### NestJS (apps/api/.env)

```env
# Database
DATABASE_URL=postgresql://xxx
DIRECT_URL=postgresql://xxx

# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=xxx

# Stripe
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
STRIPE_NONPROFIT_RATE=true

# Resend
RESEND_API_KEY=re_xxx

# Security
JWT_SECRET=xxx
CRON_SECRET=xxx
CORS_ORIGIN=http://localhost:3000
```

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| - | Separate NestJS backend | Better separation of concerns, scalability |
| - | Database state machine (no BullMQ) | Cost savings, simpler architecture |
| - | Supabase over custom auth | Integrated auth/storage/realtime, lower cost |
| - | Railway over AWS App Runner | Simpler setup, similar cost |
| - | TipTap over other editors | Industry standard, extensible, headless |
| - | Vercel Cron over dedicated scheduler | Free, sufficient for needs |

---

## Checklist Before Each PR

```
□ Code follows architecture patterns in 01_ARCHITECTURE.md
□ Database changes reviewed against 02_DATABASE_SCHEMA.md
□ API changes match 03_API_SPECIFICATION.md
□ Security checklist from 07_SECURITY.md completed
□ Tests written per 06_TESTING.md requirements
□ No unnecessary costs introduced (08_COST_OPTIMIZATION.md)
□ All new features work on mobile (responsive)
□ Console has no errors or warnings
□ TypeScript has no type errors
□ Linting passes
```

---

## Support Contacts

- **Technical Lead**: [Your Name]
- **Supabase Dashboard**: https://app.supabase.com
- **Vercel Dashboard**: https://vercel.com
- **Railway Dashboard**: https://railway.app
- **Stripe Dashboard**: https://dashboard.stripe.com

---

**Remember**: When in doubt, reference the specific prompt document. Maintain consistency across the codebase by following established patterns.
