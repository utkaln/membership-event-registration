# OSA Community Platform - Architecture Specification

> **Reference**: This document defines the system architecture. Consult when starting new features or understanding system design.

---

## 1. System Architecture Overview

### High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              INTERNET                                        │
└─────────────────────────────────────┬───────────────────────────────────────┘
                                      │
                    ┌─────────────────▼─────────────────┐
                    │     Cloudflare (FREE - Galileo)   │
                    │     • DNS Management              │
                    │     • DDoS Protection             │
                    │     • Edge Caching                │
                    │     • SSL/TLS Termination         │
                    └─────────────────┬─────────────────┘
                                      │
          ┌───────────────────────────┼───────────────────────────┐
          │                           │                           │
          ▼                           ▼                           ▼
┌─────────────────────┐   ┌─────────────────────┐   ┌─────────────────────┐
│  Vercel (FREE)      │   │  Railway (~$12/mo)  │   │  Stripe             │
│                     │   │                     │   │  (2.2% + $0.30)     │
│  Next.js 14+        │   │  NestJS Backend     │   │                     │
│  ├─ App Router      │   │  ├─ REST API        │   │  • Checkout         │
│  ├─ Server Actions  │   │  ├─ Prisma ORM      │   │  • Webhooks         │
│  ├─ ISR/SSR         │   │  ├─ Auth Guards     │   │  • Subscriptions    │
│  ├─ Edge Middleware │   │  ├─ State Machine   │   │  • Customer Portal  │
│  └─ API Routes      │   │  └─ Email Service   │   │                     │
│      (Cron proxy)   │   │                     │   │                     │
└──────────┬──────────┘   └──────────┬──────────┘   └──────────┬──────────┘
           │                         │                         │
           │    ┌────────────────────┘                         │
           │    │                                              │
           │    │         ┌────────────────────────────────────┘
           │    │         │
           ▼    ▼         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Supabase ($25/mo)                                     │
│                        Region: US East (N. Virginia)                         │
│                                                                              │
│  ┌─────────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐  │
│  │    PostgreSQL       │  │  Supabase Auth  │  │   Supabase Storage      │  │
│  │                     │  │                 │  │                         │  │
│  │  Tables:            │  │  Providers:     │  │  Buckets:               │  │
│  │  • users            │  │  • Google       │  │  • avatars              │  │
│  │  • profiles         │  │  • Microsoft    │  │  • event-images         │  │
│  │  • memberships      │  │  • Email/Pass   │  │  • article-images       │  │
│  │  • membership_types │  │                 │  │  • page-images          │  │
│  │  • events           │  │  Features:      │  │                         │  │
│  │  • event_categories │  │  • JWT tokens   │  │  Features:              │  │
│  │  • registrations    │  │  • Row Level    │  │  • CDN delivery         │  │
│  │  • waitlist         │  │    Security     │  │  • Image transforms     │  │
│  │  • articles         │  │  • MFA (future) │  │  • Access policies      │  │
│  │  • static_pages     │  │                 │  │                         │  │
│  │  • payments         │  │                 │  │                         │  │
│  │  • media            │  │                 │  │                         │  │
│  │  • audit_logs       │  │                 │  │                         │  │
│  │                     │  │                 │  │                         │  │
│  │  Triggers:          │  │                 │  │                         │  │
│  │  • auth_user_sync   │  │                 │  │                         │  │
│  │  • seat_counter     │  │                 │  │                         │  │
│  └─────────────────────┘  └─────────────────┘  └─────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
                    ┌─────────────────────────────────┐
                    │        Resend (FREE tier)       │
                    │                                 │
                    │  Transactional Emails:          │
                    │  • Welcome                      │
                    │  • Membership confirmation      │
                    │  • Event registration           │
                    │  • Waitlist notifications       │
                    │  • Event reminders              │
                    │  • Password reset               │
                    └─────────────────────────────────┘
```

---

## 2. Monorepo Structure

```
osa-community-platform/
├── apps/
│   ├── web/                          # Next.js Frontend
│   │   ├── app/                      # App Router
│   │   │   ├── (public)/             # Public routes (guests)
│   │   │   │   ├── page.tsx          # Homepage
│   │   │   │   ├── events/
│   │   │   │   │   ├── page.tsx      # Event listing (ISR)
│   │   │   │   │   └── [slug]/
│   │   │   │   │       └── page.tsx  # Event detail (ISR)
│   │   │   │   ├── news/
│   │   │   │   │   ├── page.tsx      # News listing (ISR)
│   │   │   │   │   └── [slug]/
│   │   │   │   │       └── page.tsx  # Article detail (ISR)
│   │   │   │   └── [slug]/
│   │   │   │       └── page.tsx      # Static pages (ISR)
│   │   │   │
│   │   │   ├── (auth)/               # Auth routes
│   │   │   │   ├── login/
│   │   │   │   │   └── page.tsx
│   │   │   │   ├── register/
│   │   │   │   │   └── page.tsx
│   │   │   │   └── callback/
│   │   │   │       └── page.tsx      # OAuth callback
│   │   │   │
│   │   │   ├── (member)/             # Member routes (protected)
│   │   │   │   ├── layout.tsx        # Auth check
│   │   │   │   ├── dashboard/
│   │   │   │   │   └── page.tsx
│   │   │   │   ├── profile/
│   │   │   │   │   └── page.tsx
│   │   │   │   ├── membership/
│   │   │   │   │   └── page.tsx
│   │   │   │   └── my-events/
│   │   │   │       └── page.tsx
│   │   │   │
│   │   │   ├── (contributor)/        # Contributor routes
│   │   │   │   ├── layout.tsx        # Role check
│   │   │   │   └── manage/
│   │   │   │       ├── events/
│   │   │   │       │   ├── page.tsx
│   │   │   │       │   ├── new/
│   │   │   │       │   └── [id]/edit/
│   │   │   │       ├── articles/
│   │   │   │       │   ├── page.tsx
│   │   │   │       │   ├── new/
│   │   │   │       │   └── [id]/edit/
│   │   │   │       └── pages/
│   │   │   │           ├── page.tsx
│   │   │   │           ├── new/
│   │   │   │           └── [id]/edit/
│   │   │   │
│   │   │   ├── (admin)/              # Admin routes
│   │   │   │   ├── layout.tsx        # Admin role check
│   │   │   │   └── admin/
│   │   │   │       ├── page.tsx      # Admin dashboard
│   │   │   │       ├── users/
│   │   │   │       │   └── page.tsx
│   │   │   │       ├── memberships/
│   │   │   │       │   └── page.tsx
│   │   │   │       ├── categories/
│   │   │   │       │   └── page.tsx
│   │   │   │       └── settings/
│   │   │   │           └── page.tsx
│   │   │   │
│   │   │   ├── api/                  # API routes (Cron proxy)
│   │   │   │   └── cron/
│   │   │   │       ├── process-expired-offers/
│   │   │   │       ├── send-event-reminders/
│   │   │   │       └── update-expired-memberships/
│   │   │   │
│   │   │   ├── layout.tsx            # Root layout
│   │   │   ├── globals.css
│   │   │   └── providers.tsx         # Context providers
│   │   │
│   │   ├── components/
│   │   │   ├── ui/                   # shadcn/ui components
│   │   │   ├── forms/                # Form components
│   │   │   ├── layout/               # Layout components
│   │   │   │   ├── Header.tsx
│   │   │   │   ├── Footer.tsx
│   │   │   │   ├── Sidebar.tsx
│   │   │   │   └── Navigation.tsx
│   │   │   └── editor/               # TipTap editor
│   │   │       ├── Editor.tsx
│   │   │       ├── Toolbar.tsx
│   │   │       └── ImageUpload.tsx
│   │   │
│   │   ├── lib/
│   │   │   ├── supabase/
│   │   │   │   ├── client.ts         # Browser client
│   │   │   │   ├── server.ts         # Server client
│   │   │   │   └── middleware.ts     # Auth middleware
│   │   │   ├── api/
│   │   │   │   └── client.ts         # NestJS API client
│   │   │   ├── stripe/
│   │   │   │   └── client.ts
│   │   │   └── utils/
│   │   │       ├── cn.ts             # classnames utility
│   │   │       └── format.ts         # Formatters
│   │   │
│   │   ├── hooks/
│   │   │   ├── useAuth.ts
│   │   │   ├── useUser.ts
│   │   │   └── useEvents.ts
│   │   │
│   │   ├── types/
│   │   │   └── index.ts              # Frontend types
│   │   │
│   │   ├── next.config.js
│   │   ├── tailwind.config.ts
│   │   ├── vercel.json               # Cron configuration
│   │   └── package.json
│   │
│   └── api/                          # NestJS Backend
│       ├── src/
│       │   ├── main.ts               # Entry point
│       │   ├── app.module.ts         # Root module
│       │   │
│       │   ├── modules/
│       │   │   ├── auth/
│       │   │   │   ├── auth.module.ts
│       │   │   │   ├── auth.controller.ts
│       │   │   │   ├── auth.service.ts
│       │   │   │   ├── guards/
│       │   │   │   │   ├── jwt-auth.guard.ts
│       │   │   │   │   └── roles.guard.ts
│       │   │   │   ├── decorators/
│       │   │   │   │   ├── current-user.decorator.ts
│       │   │   │   │   └── roles.decorator.ts
│       │   │   │   └── strategies/
│       │   │   │       └── supabase.strategy.ts
│       │   │   │
│       │   │   ├── users/
│       │   │   │   ├── users.module.ts
│       │   │   │   ├── users.controller.ts
│       │   │   │   ├── users.service.ts
│       │   │   │   └── dto/
│       │   │   │       ├── create-profile.dto.ts
│       │   │   │       └── update-profile.dto.ts
│       │   │   │
│       │   │   ├── memberships/
│       │   │   │   ├── memberships.module.ts
│       │   │   │   ├── memberships.controller.ts
│       │   │   │   ├── memberships.service.ts
│       │   │   │   └── dto/
│       │   │   │
│       │   │   ├── events/
│       │   │   │   ├── events.module.ts
│       │   │   │   ├── events.controller.ts
│       │   │   │   ├── events.service.ts
│       │   │   │   ├── registration.service.ts      # State machine
│       │   │   │   ├── waitlist.service.ts          # State machine
│       │   │   │   └── dto/
│       │   │   │
│       │   │   ├── content/
│       │   │   │   ├── content.module.ts
│       │   │   │   ├── articles.controller.ts
│       │   │   │   ├── articles.service.ts
│       │   │   │   ├── pages.controller.ts
│       │   │   │   ├── pages.service.ts
│       │   │   │   └── dto/
│       │   │   │
│       │   │   ├── payments/
│       │   │   │   ├── payments.module.ts
│       │   │   │   ├── payments.controller.ts
│       │   │   │   ├── stripe.service.ts
│       │   │   │   └── webhooks.controller.ts
│       │   │   │
│       │   │   ├── media/
│       │   │   │   ├── media.module.ts
│       │   │   │   ├── media.controller.ts
│       │   │   │   └── media.service.ts
│       │   │   │
│       │   │   ├── email/
│       │   │   │   ├── email.module.ts
│       │   │   │   ├── email.service.ts
│       │   │   │   └── templates/
│       │   │   │
│       │   │   └── cron/
│       │   │       ├── cron.module.ts
│       │   │       └── cron.controller.ts
│       │   │
│       │   ├── common/
│       │   │   ├── guards/
│       │   │   ├── decorators/
│       │   │   ├── interceptors/
│       │   │   │   └── audit-log.interceptor.ts
│       │   │   ├── filters/
│       │   │   │   └── http-exception.filter.ts
│       │   │   └── pipes/
│       │   │       └── validation.pipe.ts
│       │   │
│       │   ├── prisma/
│       │   │   ├── prisma.module.ts
│       │   │   └── prisma.service.ts
│       │   │
│       │   └── config/
│       │       ├── configuration.ts
│       │       └── validation.ts
│       │
│       ├── prisma/
│       │   ├── schema.prisma
│       │   ├── migrations/
│       │   └── seed.ts
│       │
│       ├── test/
│       │   ├── app.e2e-spec.ts
│       │   └── jest-e2e.json
│       │
│       ├── Dockerfile
│       ├── nest-cli.json
│       └── package.json
│
├── packages/
│   ├── shared-types/                 # Shared TypeScript types
│   │   ├── src/
│   │   │   ├── user.ts
│   │   │   ├── event.ts
│   │   │   ├── membership.ts
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── validation/                   # Shared Zod schemas
│   │   ├── src/
│   │   │   ├── user.schema.ts
│   │   │   ├── event.schema.ts
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   └── config/                       # Shared configurations
│       ├── eslint/
│       ├── typescript/
│       └── tailwind/
│
├── turbo.json                        # Turborepo config
├── pnpm-workspace.yaml
├── package.json
└── README.md
```

---

## 3. Module Responsibilities

### Frontend Modules (Next.js)

| Module | Responsibility |
|--------|---------------|
| `(public)/*` | Guest-accessible pages with ISR caching |
| `(auth)/*` | Login, registration, OAuth callback |
| `(member)/*` | Authenticated member pages |
| `(contributor)/*` | Content management for contributors |
| `(admin)/*` | Administrative functions |
| `components/ui` | shadcn/ui primitive components |
| `components/editor` | TipTap rich text editor |
| `lib/supabase` | Supabase client initialization |
| `lib/api` | NestJS API client |

### Backend Modules (NestJS)

| Module | Responsibility |
|--------|---------------|
| `AuthModule` | JWT validation, JIT sync, role guards |
| `UsersModule` | User profiles, GDPR operations |
| `MembershipsModule` | Membership types, payments, approvals |
| `EventsModule` | Events CRUD, registration state machine |
| `ContentModule` | Articles, static pages |
| `PaymentsModule` | Stripe integration, webhooks |
| `MediaModule` | File uploads to Supabase Storage |
| `EmailModule` | Resend integration, templates |
| `CronModule` | Scheduled task endpoints |

---

## 4. Authentication Flow

### OAuth Flow (Gmail/Microsoft)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         OAUTH AUTHENTICATION FLOW                            │
└─────────────────────────────────────────────────────────────────────────────┘

1. User clicks "Sign in with Google"
   │
   ▼
2. Next.js redirects to Supabase Auth
   │  supabase.auth.signInWithOAuth({ provider: 'google' })
   │
   ▼
3. User authenticates with Google
   │
   ▼
4. Google redirects to Supabase callback
   │
   ▼
5. Supabase creates/updates auth.users record
   │  Returns JWT in URL fragment
   │
   ▼
6. Next.js callback page extracts JWT
   │  Stores in httpOnly cookie via Server Action
   │
   ▼
7. User accesses protected route
   │
   ▼
8. Edge Middleware checks cookie
   │  If missing → redirect to login
   │
   ▼
9. Next.js calls NestJS API with JWT
   │  Authorization: Bearer <jwt>
   │
   ▼
10. NestJS AuthGuard validates JWT
    │
    ├─── JWT Invalid → 401 Unauthorized
    │
    └─── JWT Valid → JIT Sync
         │
         ├─── User exists in DB → Continue
         │
         └─── User not in DB → Create user record
              │  Extract email from JWT
              │  Insert into users table
              │  Return user
```

### JIT (Just-In-Time) Sync Implementation

```typescript
// NestJS: auth/guards/jwt-auth.guard.ts

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

    // Attach user to request
    request.user = dbUser;
    return true;
  }

  private extractToken(request: Request): string | null {
    const auth = request.headers.authorization;
    if (auth?.startsWith('Bearer ')) {
      return auth.substring(7);
    }
    return null;
  }
}
```

---

## 5. Caching Strategy

### ISR (Incremental Static Regeneration)

```typescript
// Next.js: app/(public)/events/page.tsx

export const revalidate = 60; // Revalidate every 60 seconds

async function EventsPage() {
  const events = await fetch(`${API_URL}/events`, {
    next: { revalidate: 60 }
  }).then(res => res.json());

  return <EventList events={events} />;
}
```

### Cache Configuration by Page Type

| Page Type | Strategy | Revalidation | Location |
|-----------|----------|--------------|----------|
| Homepage | ISR | 60 seconds | Vercel Edge |
| Events List | ISR | 60 seconds | Vercel Edge |
| Event Detail | ISR | 60 seconds | Vercel Edge |
| News List | ISR | 60 seconds | Vercel Edge |
| Article Detail | ISR | 300 seconds | Vercel Edge |
| Static Pages | ISR | 3600 seconds | Vercel Edge |
| Member Dashboard | Dynamic | No cache | Origin |
| Admin Pages | Dynamic | No cache | Origin |

### API Cache Headers

```typescript
// NestJS: Set cache headers for public endpoints

@Get('events')
@Header('Cache-Control', 'public, max-age=60, s-maxage=60')
async getEvents() {
  return this.eventsService.findAll();
}

@Get('events/:slug')
@Header('Cache-Control', 'public, max-age=60, s-maxage=60')
async getEvent(@Param('slug') slug: string) {
  return this.eventsService.findBySlug(slug);
}
```

---

## 6. Error Handling

### Global Exception Filter

```typescript
// NestJS: common/filters/http-exception.filter.ts

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status = exception instanceof HttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    const message = exception instanceof HttpException
      ? exception.message
      : 'Internal server error';

    // Log error
    this.logger.error({
      statusCode: status,
      path: request.url,
      method: request.method,
      message,
      stack: exception instanceof Error ? exception.stack : undefined,
    });

    response.status(status).json({
      statusCode: status,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
```

### Frontend Error Boundary

```typescript
// Next.js: app/error.tsx

'use client';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen">
      <h2 className="text-2xl font-bold">Something went wrong!</h2>
      <button onClick={() => reset()}>Try again</button>
    </div>
  );
}
```

---

## 7. Deployment Configuration

### Vercel (vercel.json)

```json
{
  "framework": "nextjs",
  "regions": ["iad1"],
  "crons": [
    {
      "path": "/api/cron/process-expired-offers",
      "schedule": "*/15 * * * *"
    },
    {
      "path": "/api/cron/send-event-reminders",
      "schedule": "0 9 * * *"
    },
    {
      "path": "/api/cron/update-expired-memberships",
      "schedule": "0 0 * * *"
    }
  ]
}
```

### Railway (Dockerfile)

```dockerfile
# apps/api/Dockerfile

FROM node:20-alpine AS base
RUN npm install -g pnpm

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm prisma generate
RUN pnpm build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma

EXPOSE 3001
CMD ["node", "dist/main.js"]
```

### Railway Configuration (railway.toml)

```toml
[build]
builder = "dockerfile"
dockerfilePath = "Dockerfile"

[deploy]
healthcheckPath = "/health"
healthcheckTimeout = 100
restartPolicyType = "on_failure"
restartPolicyMaxRetries = 3
```

---

## 8. Performance Requirements

| Metric | Target | Measurement |
|--------|--------|-------------|
| First Contentful Paint (FCP) | < 1.0s | Lighthouse |
| Largest Contentful Paint (LCP) | < 2.5s | Lighthouse |
| Time to Interactive (TTI) | < 3.0s | Lighthouse |
| API Response Time (p95) | < 500ms | Railway metrics |
| Database Query Time (p95) | < 100ms | Supabase dashboard |
| Page Load (with cache) | < 1.0s | User requirement |

---

## 9. Scalability Considerations

### Current Capacity
- 1,000 active users/month
- 20 concurrent users peak
- 100,000 membership records

### Future Scaling (500K members)
1. **Database**: Upgrade to Supabase Team ($599/mo) at 250K+ records
2. **Backend**: Railway auto-scales; add replicas if needed
3. **Frontend**: Vercel Edge handles global traffic automatically
4. **Storage**: Supabase Storage scales automatically

### Optimization Strategies
1. Database indexes on frequently queried columns
2. Pagination for all list endpoints
3. Image optimization via Supabase transforms
4. Lazy loading for images and heavy components
