# OSA Community Platform - Cost Optimization Specification

> **Reference**: This document defines cost-aware design decisions and optimization strategies. Consult when making infrastructure or architectural decisions.

---

## 1. Cost Overview

### Current Monthly Budget

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         MONTHLY COST BREAKDOWN                               │
└─────────────────────────────────────────────────────────────────────────────┘

Fixed Costs:
├── Vercel Pro (Next.js hosting)     $0/mo    ← Non-profit program
├── Railway (NestJS backend)         $12/mo   ← Usage-based, estimate
├── Supabase Pro (Database + Auth)   $25/mo   ← Fixed tier
├── Cloudflare (DNS/CDN/Security)    $0/mo    ← Project Galileo
├── Resend (Email)                   $0/mo    ← Free tier (3K/mo)
├── GitHub (Source control)          $0/mo    ← Non-profit program
└── Domain (odishasociety.org)       $1/mo    ← ~$12/year
                                    ─────────
Total Fixed:                         $38/mo   (~$456/year)

Variable Costs:
├── Stripe fees (2.2% + $0.30)       ~$35/mo  ← Based on transaction volume
└── Overage (if any)                 ~$0/mo   ← Unlikely at current scale
                                    ─────────
Total Variable:                      ~$35/mo  (~$420/year)

═══════════════════════════════════════════════════════════════════════════════
TOTAL ESTIMATED:                     ~$73/mo  (~$876/year)
═══════════════════════════════════════════════════════════════════════════════
```

### Non-Profit Programs Applied

| Service | Program | Savings | Application Link |
|---------|---------|---------|------------------|
| Vercel | Non-Profit | ~$240/year | https://vercel.com/contact/non-profit |
| Cloudflare | Project Galileo | ~$200+/year | https://www.cloudflare.com/galileo/ |
| GitHub | Non-Profit | ~$200/year | https://support.github.com/contact?tags=dotcom-direct |
| Stripe | Non-Profit Rate | 0.7% savings | Contact with 501(c)(3) docs |

**Required Documentation**: 501(c)(3) determination letter, EIN number

---

## 2. Architecture Cost Decisions

### 2.1 Database-Driven State Machine vs Queue System

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    STATE MACHINE DECISION                                    │
└─────────────────────────────────────────────────────────────────────────────┘

Option A: BullMQ + Redis (REJECTED)
├── Redis hosting (Upstash): $10-20/mo
├── Additional complexity
├── Another service to monitor
└── Total additional cost: $120-240/year

Option B: Database State Machine + Vercel Cron (SELECTED) ✓
├── Uses existing Supabase: $0 additional
├── Vercel Cron: Free (included)
├── Simpler architecture
└── Total additional cost: $0/year

SAVINGS: $120-240/year
```

**Implementation**:
- State transitions in PostgreSQL with transactions
- Database triggers for seat counting
- Vercel Cron for time-based operations (every 15 min)

### 2.2 Separate Backend vs Consolidated

```
Option A: Separate NestJS Backend (SELECTED) ✓
├── Railway: ~$12/mo
├── Better separation of concerns
├── Easier to scale independently
├── More robust architecture
└── Cost: ~$144/year

Option B: Next.js API Routes Only (REJECTED)
├── Vercel: $0 (included)
├── Limited to serverless model
├── Harder to manage complex logic
├── State machine complexity
└── Cost: $0/year

DECISION: Chose Option A for architectural robustness
The $144/year is justified for maintainability and scalability.
```

### 2.3 Image Storage

```
Supabase Storage (SELECTED) ✓
├── 100GB included in Pro plan
├── CDN delivery included
├── Image transforms included
├── No additional cost
└── Cost: $0/year (included in Supabase Pro)

Alternative: Cloudinary
├── Better transforms
├── Free tier limited
├── Additional service
└── Cost: $0-50/year

DECISION: Use Supabase Storage to avoid additional service costs
```

### 2.4 Email Provider

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         EMAIL PROVIDER COMPARISON                            │
└─────────────────────────────────────────────────────────────────────────────┘

Resend (SELECTED) ✓
├── Free tier: 3,000 emails/month
├── Excellent developer experience
├── Modern API
└── Cost: $0/mo at current volume

SendGrid
├── Free tier: 100 emails/day
├── More established
├── Complex dashboard
└── Cost: $0-20/mo

AWS SES
├── $0.10 per 1,000 emails
├── Requires more setup
├── Domain verification
└── Cost: ~$1/mo at current volume

DECISION: Resend free tier covers our needs (3K/month)
Expected volume: ~500-1000 emails/month
```

---

## 3. Scaling Cost Projections

### User Growth Scenarios

```
Current State (Year 1):
├── Active Users: 1,000/month
├── Concurrent Peak: 20 users
├── Database Size: <5GB
├── Monthly Cost: ~$73
└── Cost per User: $0.073

Growth Stage (Year 2-3): 10,000 users
├── Active Users: 10,000/month
├── Concurrent Peak: 200 users
├── Database Size: ~20GB
├── Monthly Cost: ~$100-150
└── Cost per User: $0.01-0.015

Scale Stage (Year 4+): 50,000+ users
├── Active Users: 50,000/month
├── Concurrent Peak: 1,000 users
├── Database Size: ~100GB
├── Monthly Cost: ~$300-500
└── Cost per User: $0.006-0.01
```

### Scaling Triggers

| Metric | Current Limit | Action Required | Cost Impact |
|--------|---------------|-----------------|-------------|
| Database size | 8GB (Supabase Pro) | Upgrade to Team | +$574/mo |
| Email volume | 3K/mo (Resend Free) | Upgrade to Pro | +$20/mo |
| API requests | Unlimited (Railway) | Add replicas | +$12/mo each |
| File storage | 100GB (Supabase) | Upgrade plan | Included in Team |

### When to Upgrade

```typescript
const UPGRADE_THRESHOLDS = {
  // Supabase: Pro → Team
  supabase: {
    trigger: 'Database > 6GB OR monthly active users > 50K',
    currentPlan: 'Pro ($25/mo)',
    nextPlan: 'Team ($599/mo)',
    action: 'Contact Supabase for non-profit discount',
  },
  
  // Resend: Free → Pro
  resend: {
    trigger: 'Emails > 2,500/month consistently',
    currentPlan: 'Free (3K/mo)',
    nextPlan: 'Pro ($20/mo for 50K)',
    action: 'Upgrade when approaching limit',
  },
  
  // Railway: Single → Multiple instances
  railway: {
    trigger: 'API response time p95 > 500ms',
    currentPlan: 'Single instance (~$12/mo)',
    nextPlan: 'Multiple replicas (~$24/mo)',
    action: 'Add horizontal scaling',
  },
};
```

---

## 4. Cost Optimization Strategies

### 4.1 Caching Strategy

```typescript
// Reduce database queries and API calls through aggressive caching

// Layer 1: Next.js ISR (Free - reduces origin requests)
export const revalidate = 60; // Homepage
export const revalidate = 300; // Article pages
export const revalidate = 3600; // Static pages

// Layer 2: API Cache Headers (Free - Cloudflare caches)
@Get('events')
@Header('Cache-Control', 'public, max-age=60, s-maxage=60')
async getEvents() { ... }

// Layer 3: Client-side SWR (Free - reduces redundant fetches)
const { data } = useSWR('/api/events', fetcher, {
  revalidateOnFocus: false,
  dedupingInterval: 60000,
});

// Cost Impact: Reduces database reads by ~70%
// Supabase pricing is usage-based beyond limits
```

### 4.2 Image Optimization

```typescript
// Use Supabase Image Transforms instead of uploading multiple sizes

// ❌ Expensive: Store multiple sizes
await uploadImage(original);
await uploadImage(resizeToThumbnail(original));
await uploadImage(resizeToMedium(original));

// ✅ Cost-effective: Transform on-the-fly
const thumbnailUrl = `${supabaseUrl}/storage/v1/render/image/public/events/${imageId}?width=200&height=200`;
const mediumUrl = `${supabaseUrl}/storage/v1/render/image/public/events/${imageId}?width=800`;

// Cost Impact: 3x less storage usage
```

### 4.3 Database Query Optimization

```typescript
// Minimize database reads for cost control

// ❌ Expensive: Multiple queries
const event = await prisma.event.findUnique({ where: { id } });
const registrations = await prisma.eventRegistration.findMany({ where: { eventId: id } });
const category = await prisma.eventCategory.findUnique({ where: { id: event.categoryId } });

// ✅ Cost-effective: Single query with includes
const event = await prisma.event.findUnique({
  where: { id },
  include: {
    category: true,
    registrations: { where: { status: 'CONFIRMED' } },
    _count: { select: { registrations: true } },
  },
});

// Use denormalization for frequently accessed counts
// currentSeats on Event table instead of counting registrations
```

### 4.4 Email Batching

```typescript
// Stay within free tier limits

// ❌ Individual emails (wastes quota)
for (const user of users) {
  await sendEmail(user.email, template);
}

// ✅ Batch processing with rate limiting
const BATCH_SIZE = 100;
const DELAY_MS = 1000;

for (let i = 0; i < users.length; i += BATCH_SIZE) {
  const batch = users.slice(i, i + BATCH_SIZE);
  await Promise.all(batch.map(user => sendEmail(user.email, template)));
  await sleep(DELAY_MS);
}

// Also: Use digest emails instead of individual notifications
// Weekly event digest instead of per-event emails
```

---

## 5. Monitoring & Alerts

### 5.1 Cost Monitoring Dashboard

```typescript
// Track these metrics to predict costs

const COST_METRICS = {
  // Supabase
  databaseSize: 'SELECT pg_database_size(current_database())',
  monthlyReads: 'Check Supabase dashboard',
  storageUsed: 'Check Supabase dashboard',
  
  // Railway
  cpuHours: 'Railway dashboard → Usage',
  memoryGB: 'Railway dashboard → Usage',
  
  // Resend
  emailsSent: 'Resend dashboard → Usage',
  
  // Stripe
  transactionVolume: 'Stripe dashboard → Reports',
};
```

### 5.2 Cost Alerts

```typescript
// Set up alerts before hitting limits

const COST_ALERTS = [
  {
    metric: 'Supabase database size',
    threshold: '6GB', // 75% of 8GB limit
    action: 'Review data retention, consider archiving',
  },
  {
    metric: 'Resend emails',
    threshold: '2500/month', // 83% of 3K limit
    action: 'Review email frequency, consider upgrade',
  },
  {
    metric: 'Railway monthly cost',
    threshold: '$20',
    action: 'Review for inefficiencies',
  },
  {
    metric: 'Stripe fees',
    threshold: '$50/month',
    action: 'Review transaction volume, ensure non-profit rate',
  },
];
```

---

## 6. Cost-Effective Feature Implementation

### 6.1 File Uploads

```typescript
// Limit file sizes to control storage costs

const FILE_LIMITS = {
  avatar: {
    maxSize: 1 * 1024 * 1024, // 1MB
    formats: ['image/jpeg', 'image/png', 'image/webp'],
  },
  eventImage: {
    maxSize: 2 * 1024 * 1024, // 2MB
    formats: ['image/jpeg', 'image/png', 'image/webp'],
  },
  articleImage: {
    maxSize: 2 * 1024 * 1024, // 2MB
    formats: ['image/jpeg', 'image/png', 'image/webp'],
  },
};

// Cleanup orphaned files monthly
async function cleanupOrphanedMedia() {
  // Find media not linked to any entity
  const orphaned = await prisma.media.findMany({
    where: {
      entityId: null,
      createdAt: { lt: thirtyDaysAgo },
    },
  });
  
  // Delete from storage and database
  for (const file of orphaned) {
    await supabase.storage.from(file.bucket).remove([file.fileName]);
    await prisma.media.delete({ where: { id: file.id } });
  }
}
```

### 6.2 Search Implementation

```typescript
// Use PostgreSQL full-text search instead of paid services

// ❌ Expensive: Algolia, Elasticsearch
// Cost: $29+/month for Algolia

// ✅ Cost-effective: PostgreSQL Full-Text Search (included)
const searchEvents = async (query: string) => {
  return prisma.$queryRaw`
    SELECT * FROM events
    WHERE to_tsvector('english', title || ' ' || COALESCE(excerpt, ''))
          @@ plainto_tsquery('english', ${query})
    AND status = 'PUBLISHED'
    ORDER BY ts_rank(
      to_tsvector('english', title || ' ' || COALESCE(excerpt, '')),
      plainto_tsquery('english', ${query})
    ) DESC
    LIMIT 20
  `;
};

// Add index for performance
// CREATE INDEX idx_events_search ON events 
// USING gin(to_tsvector('english', title || ' ' || COALESCE(excerpt, '')));
```

### 6.3 Analytics

```typescript
// Use built-in analytics instead of paid services

// ❌ Expensive: Mixpanel, Amplitude
// Cost: $25+/month

// ✅ Cost-effective options:
// 1. Vercel Analytics (included in Pro/Non-profit)
// 2. Cloudflare Analytics (included in Galileo)
// 3. Simple PostgreSQL tracking

// Custom event tracking in database
const trackEvent = async (event: {
  type: string;
  userId?: string;
  metadata?: Record<string, any>;
}) => {
  await prisma.analyticsEvent.create({
    data: {
      type: event.type,
      userId: event.userId,
      metadata: event.metadata,
      createdAt: new Date(),
    },
  });
};

// Aggregate for dashboards
const getEventStats = async (eventId: string) => {
  return prisma.eventRegistration.groupBy({
    by: ['status'],
    where: { eventId },
    _count: true,
  });
};
```

---

## 7. Alternative Cost Scenarios

### If Budget Needs to Decrease

```
Minimum Viable Setup (~$25/month):
├── Vercel (Non-profit): $0
├── Supabase Pro: $25 (can't reduce further for features needed)
├── Backend: Move to Vercel Functions (remove Railway): $0
├── Cloudflare: $0
├── Resend: $0
└── Total: $25/month

Trade-offs:
- More complex state management in serverless
- Cold starts may affect UX
- Less separation of concerns
```

### If Budget Increases (Premium Features)

```
Enhanced Setup (~$150/month):
├── Vercel Pro: $0 (non-profit)
├── Supabase Pro: $25
├── Railway (with replica): $24
├── Resend Pro: $20
├── Sentry (error tracking): $26
├── Upstash Redis (for rate limiting): $10
├── Better Stack (logging): $24
└── Total: ~$130/month

Benefits:
- Better error tracking
- Improved rate limiting
- Centralized logging
- Email flexibility
```

---

## 8. Cost Review Checklist

### Monthly Review

```
□ Check Supabase dashboard for database size trend
□ Review Railway usage/billing
□ Check Resend email count
□ Review Stripe transaction fees
□ Identify any unexpected costs
□ Update projections if needed
```

### Quarterly Review

```
□ Evaluate if current tier is optimal
□ Review caching effectiveness
□ Analyze query patterns for optimization
□ Consider archiving old data
□ Update cost projections
□ Review non-profit program status
```

### Annual Review

```
□ Renew non-profit program applications
□ Evaluate architecture decisions
□ Compare with alternative providers
□ Plan for expected growth
□ Budget for next year
□ Update this document
```

---

## 9. Cost Decision Matrix

When making technical decisions, use this matrix:

| Decision | Low Cost Option | Trade-off | When to Choose Expensive |
|----------|----------------|-----------|--------------------------|
| Database | PostgreSQL (Supabase) | Limited features | Never (PostgreSQL is sufficient) |
| Search | PostgreSQL FTS | Less sophisticated | When >100K documents |
| Queue | Database + Cron | Less real-time | When >1K jobs/minute |
| Email | Resend Free | 3K limit | When >3K emails/month |
| Storage | Supabase Storage | Basic transforms | When advanced CDN needed |
| Monitoring | Vercel + Cloudflare | Basic metrics | When detailed APM needed |
| Auth | Supabase Auth | Tied to Supabase | Never (Supabase is excellent) |

---

## 10. Emergency Cost Reduction

If costs spike unexpectedly:

```
1. IMMEDIATE (Minutes)
   □ Check for runaway queries in Supabase
   □ Review Railway logs for loops/crashes
   □ Check for email loops in Resend
   
2. SHORT-TERM (Hours)
   □ Increase cache durations
   □ Disable non-critical features
   □ Add rate limiting
   
3. MEDIUM-TERM (Days)
   □ Optimize expensive queries
   □ Archive old data
   □ Review and fix root cause
   
4. LONG-TERM (Weeks)
   □ Re-architect if needed
   □ Implement better monitoring
   □ Update cost alerts
```
