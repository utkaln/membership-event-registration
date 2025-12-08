# OSA Community Platform - Security Specification

> **Reference**: This document defines security requirements, best practices, and implementation patterns. Consult for ALL development to ensure security compliance.

---

## 1. Security Overview

### Threat Model

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           THREAT LANDSCAPE                                   │
└─────────────────────────────────────────────────────────────────────────────┘

External Threats:
├── Unauthorized access to member data
├── Payment fraud
├── Account takeover
├── DDoS attacks
├── Data scraping
└── Injection attacks (SQL, XSS)

Internal Threats:
├── Privilege escalation
├── Data leakage by contributors
└── Audit trail tampering

Compliance Requirements:
├── GDPR (data protection, right to deletion)
├── PCI-DSS (payment card security - handled by Stripe)
└── US data residency
```

### Security Layers

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              SECURITY LAYERS                                 │
└─────────────────────────────────────────────────────────────────────────────┘

Layer 1: Edge (Cloudflare)
├── DDoS protection
├── WAF (Web Application Firewall)
├── Rate limiting
├── Bot protection
└── SSL/TLS termination

Layer 2: Application (Next.js + NestJS)
├── Authentication (Supabase Auth)
├── Authorization (Role-based)
├── Input validation (Zod)
├── CSRF protection
├── XSS prevention
└── Security headers

Layer 3: Data (Supabase/PostgreSQL)
├── Row-level security
├── Encryption at rest
├── Connection encryption (SSL)
├── Parameterized queries
└── Audit logging

Layer 4: Infrastructure
├── Environment variable protection
├── Secret management
├── Network isolation
└── Least privilege access
```

---

## 2. Authentication Security

### 2.1 Supabase Auth Configuration

```typescript
// Secure Supabase Auth settings (Dashboard configuration)
{
  "auth": {
    "site_url": "https://odishasociety.org",
    "additional_redirect_urls": [
      "https://odishasociety.org/callback",
      "http://localhost:3000/callback" // Dev only
    ],
    "jwt_expiry": 3600, // 1 hour
    "refresh_token_rotation_enabled": true,
    "security_captcha_enabled": true, // hCaptcha for signup
    "password_min_length": 8,
    "mailer_secure_email_change_enabled": true,
    "mailer_autoconfirm": false
  }
}
```

### 2.2 JWT Handling

```typescript
// ❌ NEVER do this
const token = localStorage.getItem('token');

// ✅ DO this - httpOnly cookies
// lib/supabase/middleware.ts

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options) {
          // Set httpOnly, secure, sameSite cookies
          response.cookies.set({
            name,
            value,
            ...options,
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
          });
        },
        remove(name: string, options) {
          response.cookies.set({
            name,
            value: '',
            ...options,
            maxAge: 0,
          });
        },
      },
    }
  );

  await supabase.auth.getUser();
  return response;
}
```

### 2.3 Session Management

```typescript
// NestJS: Validate session on every request
@Injectable()
export class JwtAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException();
    }

    // ALWAYS validate with Supabase - don't just decode JWT
    const { data: { user }, error } = await this.supabase
      .auth
      .getUser(token);

    if (error || !user) {
      throw new UnauthorizedException();
    }

    // Check if user is soft-deleted
    const dbUser = await this.usersService.findById(user.id);
    if (dbUser?.deletedAt) {
      throw new UnauthorizedException('Account deactivated');
    }

    request.user = dbUser;
    return true;
  }
}
```

---

## 3. Authorization Security

### 3.1 Role-Based Access Control (RBAC)

```typescript
// auth/guards/roles.guard.ts

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
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()]
    );

    if (!requiredRoles?.length) return true;

    const { user } = context.switchToHttp().getRequest();
    
    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    const userLevel = ROLE_HIERARCHY[user.role];
    const requiredLevel = Math.min(...requiredRoles.map(r => ROLE_HIERARCHY[r]));

    if (userLevel < requiredLevel) {
      // Log unauthorized access attempt
      this.auditService.log({
        action: 'UNAUTHORIZED_ACCESS_ATTEMPT',
        userId: user.id,
        entityType: context.getClass().name,
        metadata: { requiredRoles, userRole: user.role },
      });
      throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }
}

// Usage in controllers
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminController {
  // All endpoints require ADMIN role
}
```

### 3.2 Resource-Level Authorization

```typescript
// events/events.service.ts

async update(id: string, userId: string, userRole: UserRole, dto: UpdateEventDto) {
  const event = await this.prisma.event.findUnique({
    where: { id },
    select: { id: true, createdById: true },
  });

  if (!event) {
    throw new NotFoundException('Event not found');
  }

  // Check ownership or admin role
  if (event.createdById !== userId && userRole !== 'ADMIN') {
    throw new ForbiddenException('Not authorized to edit this event');
  }

  return this.prisma.event.update({
    where: { id },
    data: dto,
  });
}
```

### 3.3 Supabase Row Level Security (RLS)

```sql
-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_registrations ENABLE ROW LEVEL SECURITY;

-- Users can only read their own profile
CREATE POLICY "Users can read own profile" ON profiles
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can only update their own profile
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can only see their own registrations
CREATE POLICY "Users can view own registrations" ON event_registrations
  FOR SELECT
  USING (auth.uid() = user_id);

-- Admins can see all (via service role key in backend)
-- Note: Backend uses service role key which bypasses RLS
```

---

## 4. Input Validation & Sanitization

### 4.1 Zod Validation Schemas

```typescript
// validation/event.schema.ts

import { z } from 'zod';

// Strict input validation
export const CreateEventSchema = z.object({
  title: z
    .string()
    .min(1, 'Title is required')
    .max(200, 'Title too long')
    .transform(val => val.trim()),
  
  slug: z
    .string()
    .regex(/^[a-z0-9-]+$/, 'Invalid slug format')
    .max(100)
    .optional(),
  
  content: z
    .string()
    .max(100000, 'Content too long'), // 100KB limit
  
  maxSeats: z
    .number()
    .int()
    .positive()
    .max(10000, 'Max 10,000 seats'),
  
  price: z
    .number()
    .positive()
    .max(10000, 'Max price $10,000')
    .optional(),
  
  // Prevent path traversal in URLs
  featuredImage: z
    .string()
    .url()
    .refine(url => {
      const parsed = new URL(url);
      return parsed.host.endsWith('supabase.co');
    }, 'Invalid image URL')
    .optional(),
});

// NestJS: Apply validation pipe globally
// main.ts
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true,        // Strip unknown properties
    forbidNonWhitelisted: true, // Throw on unknown properties
    transform: true,        // Auto-transform types
    transformOptions: {
      enableImplicitConversion: false, // Explicit conversion only
    },
  })
);
```

### 4.2 XSS Prevention

```typescript
// TipTap content sanitization
import DOMPurify from 'isomorphic-dompurify';

// Sanitize HTML content before storing
function sanitizeContent(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'h1', 'h2', 'h3', 'p', 'br', 'strong', 'em', 'u',
      'ul', 'ol', 'li', 'blockquote', 'a', 'img', 'pre', 'code',
    ],
    ALLOWED_ATTR: [
      'href', 'src', 'alt', 'title', 'class',
    ],
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: ['script', 'style', 'iframe', 'form', 'input'],
    FORBID_ATTR: ['onerror', 'onclick', 'onload', 'style'],
  });
}

// In service
async createArticle(dto: CreateArticleDto) {
  return this.prisma.article.create({
    data: {
      ...dto,
      content: sanitizeContent(dto.content), // Sanitize before storing
    },
  });
}

// React: Safe rendering
function ArticleContent({ content }: { content: string }) {
  // Content is already sanitized on backend
  // dangerouslySetInnerHTML is safe here
  return (
    <div 
      className="prose"
      dangerouslySetInnerHTML={{ __html: content }}
    />
  );
}
```

### 4.3 SQL Injection Prevention

```typescript
// ✅ Prisma uses parameterized queries by default
const user = await prisma.user.findUnique({
  where: { email: userInput }, // Safe - parameterized
});

// ✅ If using raw queries, use tagged template literals
const result = await prisma.$queryRaw`
  SELECT * FROM users WHERE email = ${userInput}
`;

// ❌ NEVER do this
const result = await prisma.$queryRawUnsafe(
  `SELECT * FROM users WHERE email = '${userInput}'`
);
```

---

## 5. API Security

### 5.1 Rate Limiting

```typescript
// NestJS: Rate limiting with @nestjs/throttler
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1000,  // 1 second
        limit: 10,  // 10 requests per second
      },
      {
        name: 'medium',
        ttl: 60000, // 1 minute
        limit: 100, // 100 requests per minute
      },
      {
        name: 'long',
        ttl: 3600000, // 1 hour
        limit: 1000,  // 1000 requests per hour
      },
    ]),
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}

// Custom rate limits for sensitive endpoints
@Controller('auth')
export class AuthController {
  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 attempts per minute
  async login() {}
}

@Controller('payments')
export class PaymentsController {
  @Post('checkout')
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 per minute
  async createCheckout() {}
}
```

### 5.2 Security Headers

```typescript
// Next.js: next.config.js
const securityHeaders = [
  {
    key: 'X-DNS-Prefetch-Control',
    value: 'on',
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'X-Frame-Options',
    value: 'DENY',
  },
  {
    key: 'X-XSS-Protection',
    value: '1; mode=block',
  },
  {
    key: 'Referrer-Policy',
    value: 'origin-when-cross-origin',
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=()',
  },
  {
    key: 'Content-Security-Policy',
    value: `
      default-src 'self';
      script-src 'self' 'unsafe-eval' 'unsafe-inline' https://js.stripe.com;
      style-src 'self' 'unsafe-inline';
      img-src 'self' data: https://*.supabase.co;
      font-src 'self';
      connect-src 'self' https://*.supabase.co https://api.stripe.com wss://*.supabase.co;
      frame-src https://js.stripe.com https://hooks.stripe.com;
    `.replace(/\s{2,}/g, ' ').trim(),
  },
];

module.exports = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
};
```

### 5.3 CORS Configuration

```typescript
// NestJS: main.ts
app.enableCors({
  origin: (origin, callback) => {
    const allowedOrigins = [
      process.env.FRONTEND_URL,
      'https://odishasociety.org',
      'https://www.odishasociety.org',
    ];
    
    if (process.env.NODE_ENV === 'development') {
      allowedOrigins.push('http://localhost:3000');
    }
    
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
});
```

---

## 6. Payment Security

### 6.1 Stripe Webhook Verification

```typescript
// payments/webhooks.controller.ts

@Controller('webhooks')
export class WebhooksController {
  @Post('stripe')
  async handleStripeWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    if (!signature) {
      throw new BadRequestException('Missing stripe-signature header');
    }

    let event: Stripe.Event;

    try {
      // ALWAYS verify webhook signature
      event = this.stripe.webhooks.constructEvent(
        req.rawBody!, // Must use raw body
        signature,
        this.configService.get('STRIPE_WEBHOOK_SECRET'),
      );
    } catch (err) {
      // Log suspicious activity
      this.logger.warn('Invalid Stripe webhook signature', {
        signature: signature.substring(0, 20) + '...',
        error: err.message,
      });
      throw new BadRequestException('Invalid signature');
    }

    // Process event...
  }
}

// Enable raw body parsing for webhooks
// main.ts
import * as bodyParser from 'body-parser';

app.use('/webhooks/stripe', bodyParser.raw({ type: 'application/json' }));
```

### 6.2 Payment Data Handling

```typescript
// ❌ NEVER store card details
// ❌ NEVER log payment details
// ❌ NEVER transmit card numbers through your servers

// ✅ DO use Stripe Checkout (card never touches our servers)
async createCheckoutSession(data: CheckoutData) {
  const session = await this.stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [{
      price_data: {
        currency: 'usd',
        product_data: { name: data.productName },
        unit_amount: data.amount * 100, // Cents
      },
      quantity: 1,
    }],
    success_url: `${this.frontendUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${this.frontendUrl}/payment/cancel`,
    metadata: {
      // Store non-sensitive data only
      userId: data.userId,
      type: data.type,
      entityId: data.entityId,
    },
    // Don't store customer card
    payment_intent_data: {
      setup_future_usage: undefined, // Don't save card
    },
  });

  // Log only session ID, never payment details
  this.logger.log('Checkout session created', { sessionId: session.id });

  return session.url;
}
```

---

## 7. Data Protection (GDPR)

### 7.1 Soft Delete Implementation

```typescript
// users/users.service.ts

async deleteUser(userId: string, requesterId: string, requesterRole: UserRole) {
  // Authorization check
  if (userId !== requesterId && requesterRole !== 'ADMIN') {
    throw new ForbiddenException();
  }

  // Soft delete - set deletedAt timestamp
  await this.prisma.user.update({
    where: { id: userId },
    data: { 
      deletedAt: new Date(),
      // Anonymize email to allow re-registration
      email: `deleted_${userId}@deleted.local`,
    },
  });

  // Revoke all sessions
  await this.supabase.auth.admin.deleteUser(userId);

  // Log the action
  await this.auditService.log({
    action: 'USER_DELETED',
    userId: requesterId,
    entityType: 'User',
    entityId: userId,
  });
}
```

### 7.2 Data Export

```typescript
// users/users.service.ts

async exportUserData(userId: string): Promise<UserDataExport> {
  const user = await this.prisma.user.findUnique({
    where: { id: userId },
    include: {
      profile: true,
      membership: { include: { membershipType: true } },
      eventRegistrations: { include: { event: true } },
      waitlistEntries: { include: { event: true } },
      payments: true,
    },
  });

  if (!user) {
    throw new NotFoundException();
  }

  // Remove internal IDs and sensitive data
  return {
    personalInfo: {
      email: user.email,
      profile: user.profile ? {
        firstName: user.profile.firstName,
        lastName: user.profile.lastName,
        phone: user.profile.phone,
        address: user.profile.address,
      } : null,
    },
    membership: user.membership ? {
      type: user.membership.membershipType.name,
      status: user.membership.status,
      startDate: user.membership.startDate,
      expiryDate: user.membership.expiryDate,
    } : null,
    eventHistory: user.eventRegistrations.map(r => ({
      eventTitle: r.event.title,
      status: r.status,
      registeredAt: r.registeredAt,
    })),
    paymentHistory: user.payments.map(p => ({
      type: p.type,
      amount: p.amount,
      status: p.status,
      date: p.createdAt,
    })),
    exportedAt: new Date().toISOString(),
  };
}
```

### 7.3 Data Retention

```typescript
// cron/data-retention.ts

// Run monthly to clean up old data
async cleanupOldData() {
  const retentionPeriod = 7 * 365; // 7 years for financial records
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionPeriod);

  // Delete old audit logs (keep 7 years)
  await this.prisma.auditLog.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });

  // Hard delete soft-deleted users after 30 days
  const deletionCutoff = new Date();
  deletionCutoff.setDate(deletionCutoff.getDate() - 30);

  await this.prisma.user.deleteMany({
    where: {
      deletedAt: { lt: deletionCutoff },
    },
  });
}
```

---

## 8. Audit Logging

### 8.1 Audit Log Implementation

```typescript
// common/interceptors/audit-log.interceptor.ts

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  constructor(private prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const method = request.method;
    const path = request.path;

    // Skip GET requests (read operations)
    if (method === 'GET') {
      return next.handle();
    }

    const beforeState = request.body;

    return next.handle().pipe(
      tap(async (response) => {
        // Log write operations
        await this.prisma.auditLog.create({
          data: {
            userId: user?.id,
            action: this.getAction(method),
            entityType: this.getEntityType(path),
            entityId: response?.id,
            oldValue: beforeState,
            newValue: response,
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
          },
        });
      }),
    );
  }

  private getAction(method: string): string {
    const actions: Record<string, string> = {
      POST: 'CREATE',
      PATCH: 'UPDATE',
      PUT: 'UPDATE',
      DELETE: 'DELETE',
    };
    return actions[method] || method;
  }
}
```

### 8.2 Security-Critical Audit Events

```typescript
// Always log these events
const CRITICAL_EVENTS = [
  'USER_LOGIN',
  'USER_LOGOUT',
  'USER_CREATED',
  'USER_DELETED',
  'ROLE_CHANGED',
  'MEMBERSHIP_APPROVED',
  'PAYMENT_COMPLETED',
  'UNAUTHORIZED_ACCESS_ATTEMPT',
  'RATE_LIMIT_EXCEEDED',
  'WEBHOOK_SIGNATURE_INVALID',
];

// Service method for critical logging
async logSecurityEvent(event: SecurityEvent) {
  await this.prisma.auditLog.create({
    data: {
      userId: event.userId,
      action: event.action,
      entityType: event.entityType,
      entityId: event.entityId,
      metadata: event.metadata,
      ipAddress: event.ipAddress,
      userAgent: event.userAgent,
      createdAt: new Date(),
    },
  });

  // Alert on suspicious activity
  if (event.action === 'UNAUTHORIZED_ACCESS_ATTEMPT') {
    await this.alertService.sendSecurityAlert(event);
  }
}
```

---

## 9. Environment & Secrets

### 9.1 Environment Variables

```bash
# .env.example (NEVER commit actual .env files)

# Supabase (Required)
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...  # Public key - safe to expose
SUPABASE_SERVICE_KEY=eyJ...           # PRIVATE - server only

# Database
DATABASE_URL=postgresql://...         # PRIVATE
DIRECT_URL=postgresql://...           # PRIVATE

# Stripe (Required)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_... # Public key
STRIPE_SECRET_KEY=sk_live_...         # PRIVATE
STRIPE_WEBHOOK_SECRET=whsec_...       # PRIVATE

# App
CRON_SECRET=...                       # PRIVATE - min 32 chars
JWT_SECRET=...                        # PRIVATE - min 32 chars

# NEVER commit these values
# Use environment variables in deployment platforms
```

### 9.2 Secret Rotation

```typescript
// Document secret rotation procedures
const SECRET_ROTATION = {
  STRIPE_WEBHOOK_SECRET: {
    frequency: '90 days',
    procedure: [
      '1. Create new webhook in Stripe dashboard',
      '2. Update STRIPE_WEBHOOK_SECRET in Railway',
      '3. Verify new webhook works',
      '4. Delete old webhook in Stripe',
    ],
  },
  SUPABASE_SERVICE_KEY: {
    frequency: '180 days',
    procedure: [
      '1. Generate new service key in Supabase',
      '2. Update in Railway environment',
      '3. Redeploy application',
      '4. Revoke old key',
    ],
  },
  CRON_SECRET: {
    frequency: '90 days',
    procedure: [
      '1. Generate new secret: openssl rand -hex 32',
      '2. Update in both Vercel and Railway',
      '3. Verify cron jobs work',
    ],
  },
};
```

---

## 10. Security Checklist

### Pre-Deployment Checklist

```
Authentication & Authorization
□ All protected routes require authentication
□ Role checks on all sensitive endpoints
□ JWT tokens stored in httpOnly cookies
□ Session validation on every request
□ Soft-deleted users cannot authenticate

Input Validation
□ All user inputs validated with Zod
□ HTML content sanitized (DOMPurify)
□ File uploads validated (type, size)
□ URL parameters sanitized

API Security
□ Rate limiting configured
□ CORS properly configured
□ Security headers set
□ Webhook signatures verified

Data Protection
□ Sensitive data encrypted at rest (Supabase handles this)
□ TLS for all connections
□ PII not logged
□ Audit logging for sensitive operations

Payment Security
□ Stripe Checkout used (no card data on our servers)
□ Webhook signatures verified
□ Payment amounts validated server-side

Infrastructure
□ Environment variables not committed
□ Production secrets different from development
□ Dependencies up to date (npm audit)
□ Error messages don't leak sensitive info
```

### Regular Security Tasks

| Task | Frequency |
|------|-----------|
| Dependency audit (`npm audit`) | Weekly |
| Review audit logs | Weekly |
| Secret rotation | 90 days |
| Penetration testing | Annually |
| Security training | Annually |
| Backup verification | Monthly |

---

## 11. Incident Response

### Security Incident Procedure

```
1. DETECT
   - Monitor error logs
   - Review audit logs
   - Check Cloudflare analytics
   
2. CONTAIN
   - Block suspicious IPs (Cloudflare)
   - Disable compromised accounts
   - Revoke leaked credentials
   
3. INVESTIGATE
   - Analyze audit logs
   - Determine scope
   - Identify root cause
   
4. REMEDIATE
   - Patch vulnerability
   - Rotate affected secrets
   - Update security rules
   
5. RECOVER
   - Restore from backup if needed
   - Re-enable services
   - Notify affected users
   
6. DOCUMENT
   - Write incident report
   - Update security procedures
   - Implement preventive measures
```
