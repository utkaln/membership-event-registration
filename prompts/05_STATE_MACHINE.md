# OSA Community Platform - State Machine Specification

> **Reference**: This document defines the state machine logic for event registrations and waitlist management. Consult when implementing registration features.

---

## 1. Overview

The platform uses a **database-driven state machine** approach instead of external job queues. This eliminates the need for Redis/BullMQ while maintaining reliable state transitions.

**Key Principles:**
- All state transitions happen through dedicated service methods
- Database triggers maintain seat counts automatically
- Vercel Cron handles time-based transitions (expired offers)
- Email notifications are sent synchronously after state changes

---

## 2. Registration State Machine

### 2.1 State Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    EVENT REGISTRATION STATE MACHINE                          │
└─────────────────────────────────────────────────────────────────────────────┘

                              User Initiates Registration
                                         │
                                         ▼
                            ┌────────────────────────┐
                            │   Check Availability   │
                            └───────────┬────────────┘
                                        │
                    ┌───────────────────┴───────────────────┐
                    │                                       │
           Seats Available                           Event Full
           (current < max)                       (current >= max)
                    │                                       │
                    ▼                                       ▼
        ┌───────────────────┐                   ┌───────────────────┐
        │    Is Free?       │                   │   Add to Waitlist │
        └─────────┬─────────┘                   │   status=WAITING  │
                  │                             └───────────────────┘
          ┌───────┴───────┐                              │
          │               │                              │
        Free            Paid                             │
          │               │                              │
          ▼               ▼                              ▼
┌─────────────────┐ ┌─────────────────┐       ┌─────────────────┐
│   CONFIRMED     │ │    PENDING      │       │  (See Waitlist  │
│ (seat secured)  │ │(awaiting payment│       │   State Machine)│
└────────┬────────┘ └────────┬────────┘       └─────────────────┘
         │                   │
         │           Payment Success
         │           (Stripe Webhook)
         │                   │
         │                   ▼
         │          ┌─────────────────┐
         │          │   CONFIRMED     │
         │          │ (seat secured)  │
         │          └────────┬────────┘
         │                   │
         └───────────┬───────┘
                     │
         ┌───────────┴───────────┐
         │                       │
    User Cancels           Event Ends
         │                       │
         ▼                       ▼
┌─────────────────┐     ┌─────────────────┐
│   CANCELLED     │     │   COMPLETED     │
│(seat released)  │     │  (historical)   │
└─────────────────┘     └─────────────────┘
         │
         ▼
  Process Waitlist
  (offer to next)
```

### 2.2 State Definitions

```typescript
enum RegistrationStatus {
  PENDING,    // Awaiting payment (paid events only)
  CONFIRMED,  // Seat secured, user can attend
  CANCELLED,  // Registration cancelled (by user or admin)
  COMPLETED,  // Event has ended (historical record)
}
```

| State | Description | Entry Condition | Exit Conditions |
|-------|-------------|-----------------|-----------------|
| `PENDING` | User registered for paid event, awaiting payment | User registers for paid event | Payment success → CONFIRMED, Timeout (24h) → Auto-cancel |
| `CONFIRMED` | Seat secured | Free event registration OR payment success | User/Admin cancels → CANCELLED, Event ends → COMPLETED |
| `CANCELLED` | Registration cancelled | User cancels OR Admin cancels OR Payment timeout | Terminal state |
| `COMPLETED` | Event has ended | Event end date passed | Terminal state |

### 2.3 Implementation

```typescript
// events/registration.service.ts

import { Injectable, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StripeService } from '../payments/stripe.service';
import { EmailService } from '../email/email.service';
import { WaitlistService } from './waitlist.service';
import { RegistrationStatus } from '@prisma/client';

@Injectable()
export class RegistrationService {
  constructor(
    private prisma: PrismaService,
    private stripeService: StripeService,
    private emailService: EmailService,
    private waitlistService: WaitlistService,
  ) {}

  /**
   * Main registration entry point
   * Handles all registration logic based on event availability and payment requirements
   */
  async register(userId: string, eventId: string): Promise<RegistrationResult> {
    // Use transaction to prevent race conditions
    return this.prisma.$transaction(async (tx) => {
      // 1. Get event with lock
      const event = await tx.event.findUnique({
        where: { id: eventId },
        select: {
          id: true,
          title: true,
          maxSeats: true,
          currentSeats: true,
          isFree: true,
          price: true,
          stripePriceId: true,
          registrationDeadline: true,
          status: true,
        },
      });

      if (!event) {
        throw new BadRequestException('Event not found');
      }

      // 2. Validate event is open for registration
      this.validateEventRegistration(event);

      // 3. Check if user is already registered
      const existingRegistration = await tx.eventRegistration.findUnique({
        where: { eventId_userId: { eventId, userId } },
      });

      if (existingRegistration && existingRegistration.status !== 'CANCELLED') {
        throw new ConflictException('Already registered for this event');
      }

      // 4. Check waitlist status
      const existingWaitlist = await tx.waitlistEntry.findUnique({
        where: { eventId_userId: { eventId, userId } },
      });

      if (existingWaitlist && ['WAITING', 'OFFERED'].includes(existingWaitlist.status)) {
        throw new ConflictException('Already on waitlist for this event');
      }

      // 5. Check seat availability
      if (event.currentSeats >= event.maxSeats) {
        // Event is full - add to waitlist
        return this.addToWaitlist(tx, userId, eventId, event.title);
      }

      // 6. Seats available - process registration
      if (event.isFree) {
        // Free event - confirm immediately
        return this.createConfirmedRegistration(tx, userId, eventId, event.title);
      } else {
        // Paid event - create pending registration and checkout session
        return this.createPendingRegistration(tx, userId, eventId, event);
      }
    });
  }

  /**
   * Validate event is open for registration
   */
  private validateEventRegistration(event: any): void {
    if (event.status !== 'PUBLISHED') {
      throw new BadRequestException('Event is not open for registration');
    }

    if (event.registrationDeadline && new Date() > event.registrationDeadline) {
      throw new BadRequestException('Registration deadline has passed');
    }
  }

  /**
   * Create confirmed registration (free events)
   */
  private async createConfirmedRegistration(
    tx: any,
    userId: string,
    eventId: string,
    eventTitle: string,
  ): Promise<RegistrationResult> {
    const registration = await tx.eventRegistration.create({
      data: {
        eventId,
        userId,
        status: 'CONFIRMED',
        confirmedAt: new Date(),
      },
    });

    // Note: Seat count is incremented by database trigger

    // Send confirmation email
    const user = await tx.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });

    await this.emailService.sendEventRegistrationConfirmation(user!.email, {
      eventTitle,
      userName: user!.profile?.firstName || 'Member',
    });

    return {
      type: 'registration',
      registration,
    };
  }

  /**
   * Create pending registration and Stripe checkout (paid events)
   */
  private async createPendingRegistration(
    tx: any,
    userId: string,
    eventId: string,
    event: any,
  ): Promise<RegistrationResult> {
    const registration = await tx.eventRegistration.create({
      data: {
        eventId,
        userId,
        status: 'PENDING',
        paymentStatus: 'PENDING',
      },
    });

    // Create Stripe checkout session
    const user = await tx.user.findUnique({ where: { id: userId } });
    
    const checkoutUrl = await this.stripeService.createEventCheckoutSession({
      userId,
      userEmail: user!.email,
      eventId,
      registrationId: registration.id,
      eventTitle: event.title,
      price: Number(event.price),
      isRecurring: event.isRecurring,
      stripePriceId: event.stripePriceId,
    });

    return {
      type: 'checkout',
      checkoutUrl,
      registration,
    };
  }

  /**
   * Add user to waitlist
   */
  private async addToWaitlist(
    tx: any,
    userId: string,
    eventId: string,
    eventTitle: string,
  ): Promise<RegistrationResult> {
    const user = await tx.user.findUnique({ where: { id: userId } });

    // Position is assigned by database trigger
    const waitlistEntry = await tx.waitlistEntry.create({
      data: {
        eventId,
        userId,
        email: user!.email,
        status: 'WAITING',
        position: 0, // Will be set by trigger
      },
    });

    // Send waitlist confirmation email
    await this.emailService.sendWaitlistConfirmation(user!.email, {
      eventTitle,
      position: waitlistEntry.position,
    });

    return {
      type: 'waitlist',
      waitlistEntry,
    };
  }

  /**
   * Handle successful payment (called by Stripe webhook)
   */
  async confirmPayment(registrationId: string, stripeSessionId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const registration = await tx.eventRegistration.findUnique({
        where: { id: registrationId },
        include: { event: true, user: { include: { profile: true } } },
      });

      if (!registration) {
        throw new Error('Registration not found');
      }

      if (registration.status !== 'PENDING') {
        throw new Error('Registration is not pending');
      }

      // Update registration status
      await tx.eventRegistration.update({
        where: { id: registrationId },
        data: {
          status: 'CONFIRMED',
          paymentStatus: 'COMPLETED',
          stripeSessionId,
          confirmedAt: new Date(),
        },
      });

      // Note: Seat count is incremented by database trigger

      // Send confirmation email
      await this.emailService.sendEventRegistrationConfirmation(
        registration.user.email,
        {
          eventTitle: registration.event.title,
          userName: registration.user.profile?.firstName || 'Member',
        },
      );
    });
  }

  /**
   * Cancel registration
   */
  async cancelRegistration(
    userId: string,
    eventId: string,
    reason?: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const registration = await tx.eventRegistration.findUnique({
        where: { eventId_userId: { eventId, userId } },
        include: { event: true },
      });

      if (!registration) {
        throw new BadRequestException('Registration not found');
      }

      if (!['PENDING', 'CONFIRMED'].includes(registration.status)) {
        throw new BadRequestException('Cannot cancel this registration');
      }

      // Update status
      await tx.eventRegistration.update({
        where: { id: registration.id },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelReason: reason,
        },
      });

      // Note: Seat count is decremented by database trigger (only for CONFIRMED)

      // Process waitlist if seat was released
      if (registration.status === 'CONFIRMED') {
        await this.waitlistService.processWaitlist(tx, eventId);
      }
    });
  }
}

// Types
interface RegistrationResult {
  type: 'registration' | 'checkout' | 'waitlist';
  registration?: EventRegistration;
  checkoutUrl?: string;
  waitlistEntry?: WaitlistEntry;
}
```

---

## 3. Waitlist State Machine

### 3.1 State Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       WAITLIST STATE MACHINE                                 │
└─────────────────────────────────────────────────────────────────────────────┘

                    User Added to Waitlist (Event Full)
                                   │
                                   ▼
                        ┌───────────────────┐
                        │     WAITING       │
                        │   position = N    │
                        └─────────┬─────────┘
                                  │
                                  │ Spot Opens
                                  │ (another user cancels)
                                  │ AND position = 1
                                  │
                                  ▼
                        ┌───────────────────┐
                        │     OFFERED       │
                        │ expiresAt = +48h  │
                        │ Email sent        │
                        └─────────┬─────────┘
                                  │
              ┌───────────────────┼───────────────────┐
              │                   │                   │
        User Accepts        No Response          User Declines
              │            (48h passes)               │
              │                   │                   │
              ▼                   ▼                   ▼
    ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
    │    ACCEPTED     │ │    EXPIRED      │ │    DECLINED     │
    └────────┬────────┘ └────────┬────────┘ └────────┬────────┘
             │                   │                   │
             │                   │                   │
             ▼                   └─────────┬─────────┘
    ┌─────────────────┐                    │
    │ Create          │                    │
    │ Registration    │                    ▼
    │ (PENDING/       │          ┌─────────────────┐
    │  CONFIRMED)     │          │ Offer to Next   │
    └─────────────────┘          │ in Queue        │
                                 │ (position = 2→1)│
                                 └─────────────────┘
```

### 3.2 State Definitions

```typescript
enum WaitlistStatus {
  WAITING,   // In queue, waiting for spot to open
  OFFERED,   // Spot offered, awaiting response (48h deadline)
  ACCEPTED,  // User accepted offer
  EXPIRED,   // User didn't respond in time
  DECLINED,  // User explicitly declined
}
```

| State | Description | Entry Condition | Exit Conditions |
|-------|-------------|-----------------|-----------------|
| `WAITING` | User is in queue | Event full at registration | Spot offered → OFFERED |
| `OFFERED` | Spot available, email sent | Position = 1 AND spot opens | Accept → ACCEPTED, 48h pass → EXPIRED, Decline → DECLINED |
| `ACCEPTED` | User accepted the offer | User clicks accept | Terminal (moves to registration) |
| `EXPIRED` | Deadline passed | Cron job checks expiresAt | Terminal |
| `DECLINED` | User declined | User clicks decline | Terminal |

### 3.3 Implementation

```typescript
// events/waitlist.service.ts

import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { RegistrationService } from './registration.service';
import { WaitlistStatus } from '@prisma/client';

@Injectable()
export class WaitlistService {
  constructor(
    private prisma: PrismaService,
    private emailService: EmailService,
  ) {}

  /**
   * Process waitlist when a spot opens
   * Called after registration cancellation
   */
  async processWaitlist(tx: any, eventId: string): Promise<void> {
    // Check if there are available seats
    const event = await tx.event.findUnique({
      where: { id: eventId },
      select: { id: true, title: true, maxSeats: true, currentSeats: true },
    });

    if (!event || event.currentSeats >= event.maxSeats) {
      return; // No spots available
    }

    // Get next person in queue (position 1, status WAITING)
    const nextInLine = await tx.waitlistEntry.findFirst({
      where: {
        eventId,
        status: 'WAITING',
      },
      orderBy: { position: 'asc' },
      include: { user: true },
    });

    if (!nextInLine) {
      return; // No one in waitlist
    }

    // Offer spot to this user
    await this.offerSpot(tx, nextInLine, event.title);
  }

  /**
   * Offer spot to waitlisted user
   */
  private async offerSpot(tx: any, entry: any, eventTitle: string): Promise<void> {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 48); // 48 hour deadline

    // Update waitlist entry
    await tx.waitlistEntry.update({
      where: { id: entry.id },
      data: {
        status: 'OFFERED',
        offeredAt: new Date(),
        expiresAt,
      },
    });

    // Send offer email
    await this.emailService.sendWaitlistOffer(entry.email, {
      eventTitle,
      userName: entry.user.profile?.firstName || 'Member',
      expiresAt,
      acceptUrl: `${process.env.FRONTEND_URL}/waitlist/${entry.id}/accept`,
      declineUrl: `${process.env.FRONTEND_URL}/waitlist/${entry.id}/decline`,
    });
  }

  /**
   * User accepts waitlist offer
   */
  async acceptOffer(userId: string, waitlistEntryId: string): Promise<AcceptResult> {
    return this.prisma.$transaction(async (tx) => {
      const entry = await tx.waitlistEntry.findUnique({
        where: { id: waitlistEntryId },
        include: { event: true, user: true },
      });

      if (!entry) {
        throw new BadRequestException('Waitlist entry not found');
      }

      if (entry.userId !== userId) {
        throw new BadRequestException('Not authorized');
      }

      if (entry.status !== 'OFFERED') {
        throw new BadRequestException('No active offer for this entry');
      }

      if (entry.expiresAt && new Date() > entry.expiresAt) {
        // Offer has expired
        await tx.waitlistEntry.update({
          where: { id: entry.id },
          data: { status: 'EXPIRED', respondedAt: new Date() },
        });
        throw new BadRequestException('Offer has expired');
      }

      // Check if event still has capacity (race condition protection)
      const event = await tx.event.findUnique({
        where: { id: entry.eventId },
        select: { maxSeats: true, currentSeats: true, isFree: true, price: true },
      });

      if (!event || event.currentSeats >= event.maxSeats) {
        throw new BadRequestException('No spots available');
      }

      // Update waitlist status
      await tx.waitlistEntry.update({
        where: { id: entry.id },
        data: { status: 'ACCEPTED', respondedAt: new Date() },
      });

      // Create registration
      if (event.isFree) {
        // Free event - create confirmed registration
        const registration = await tx.eventRegistration.create({
          data: {
            eventId: entry.eventId,
            userId: entry.userId,
            status: 'CONFIRMED',
            confirmedAt: new Date(),
          },
        });

        // Send confirmation
        await this.emailService.sendEventRegistrationConfirmation(entry.email, {
          eventTitle: entry.event.title,
          userName: entry.user.profile?.firstName || 'Member',
        });

        return { type: 'confirmed', registration };
      } else {
        // Paid event - create pending registration with checkout
        const registration = await tx.eventRegistration.create({
          data: {
            eventId: entry.eventId,
            userId: entry.userId,
            status: 'PENDING',
            paymentStatus: 'PENDING',
          },
        });

        // Note: Checkout URL should be created by the caller
        return { type: 'pending', registration };
      }
    });
  }

  /**
   * User declines waitlist offer
   */
  async declineOffer(userId: string, waitlistEntryId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const entry = await tx.waitlistEntry.findUnique({
        where: { id: waitlistEntryId },
      });

      if (!entry) {
        throw new BadRequestException('Waitlist entry not found');
      }

      if (entry.userId !== userId) {
        throw new BadRequestException('Not authorized');
      }

      if (entry.status !== 'OFFERED') {
        throw new BadRequestException('No active offer to decline');
      }

      // Update status
      await tx.waitlistEntry.update({
        where: { id: entry.id },
        data: { status: 'DECLINED', respondedAt: new Date() },
      });

      // Offer to next person
      await this.processWaitlist(tx, entry.eventId);
    });
  }

  /**
   * Process expired offers (called by cron)
   */
  async processExpiredOffers(): Promise<{ processed: number }> {
    const now = new Date();
    let processed = 0;

    // Find all expired offers
    const expiredOffers = await this.prisma.waitlistEntry.findMany({
      where: {
        status: 'OFFERED',
        expiresAt: { lt: now },
      },
      include: { event: true },
    });

    for (const offer of expiredOffers) {
      await this.prisma.$transaction(async (tx) => {
        // Update status to expired
        await tx.waitlistEntry.update({
          where: { id: offer.id },
          data: { status: 'EXPIRED' },
        });

        // Reorder remaining waitlist positions
        await this.reorderWaitlistPositions(tx, offer.eventId);

        // Offer to next person
        await this.processWaitlist(tx, offer.eventId);
      });

      processed++;
    }

    return { processed };
  }

  /**
   * Reorder waitlist positions after removal
   */
  private async reorderWaitlistPositions(tx: any, eventId: string): Promise<void> {
    const activeEntries = await tx.waitlistEntry.findMany({
      where: {
        eventId,
        status: 'WAITING',
      },
      orderBy: { position: 'asc' },
    });

    for (let i = 0; i < activeEntries.length; i++) {
      await tx.waitlistEntry.update({
        where: { id: activeEntries[i].id },
        data: { position: i + 1 },
      });
    }
  }
}

interface AcceptResult {
  type: 'confirmed' | 'pending';
  registration: EventRegistration;
}
```

---

## 4. Cron Jobs

### 4.1 Process Expired Waitlist Offers

```typescript
// cron/cron.controller.ts

@Post('process-expired-offers')
async processExpiredOffers(@Headers('authorization') auth: string) {
  this.verifyCronSecret(auth);
  
  const result = await this.waitlistService.processExpiredOffers();
  
  return {
    success: true,
    processed: result.processed,
    timestamp: new Date().toISOString(),
  };
}
```

**Schedule**: Every 15 minutes (`*/15 * * * *`)

### 4.2 Clean Stale Pending Registrations

```typescript
@Post('cleanup-pending-registrations')
async cleanupPendingRegistrations(@Headers('authorization') auth: string) {
  this.verifyCronSecret(auth);
  
  const cutoff = new Date();
  cutoff.setHours(cutoff.getHours() - 24); // 24 hours ago
  
  const stale = await this.prisma.eventRegistration.findMany({
    where: {
      status: 'PENDING',
      registeredAt: { lt: cutoff },
    },
  });
  
  let cleaned = 0;
  for (const registration of stale) {
    await this.registrationService.cancelRegistration(
      registration.userId,
      registration.eventId,
      'Payment timeout - auto cancelled'
    );
    cleaned++;
  }
  
  return { success: true, cleaned };
}
```

**Schedule**: Every hour (`0 * * * *`)

### 4.3 Send Event Reminders

```typescript
@Post('send-event-reminders')
async sendEventReminders(@Headers('authorization') auth: string) {
  this.verifyCronSecret(auth);
  
  // Find events starting in 24 hours
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  const startOfTomorrow = new Date(tomorrow.setHours(0, 0, 0, 0));
  const endOfTomorrow = new Date(tomorrow.setHours(23, 59, 59, 999));
  
  const upcomingEvents = await this.prisma.event.findMany({
    where: {
      startDate: { gte: startOfTomorrow, lte: endOfTomorrow },
      status: 'PUBLISHED',
    },
    include: {
      registrations: {
        where: { status: 'CONFIRMED' },
        include: { user: { include: { profile: true } } },
      },
    },
  });
  
  let sent = 0;
  for (const event of upcomingEvents) {
    for (const registration of event.registrations) {
      await this.emailService.sendEventReminder(registration.user.email, {
        eventTitle: event.title,
        userName: registration.user.profile?.firstName || 'Member',
        startDate: event.startDate,
        location: event.location || 'See event details',
      });
      sent++;
    }
  }
  
  return { success: true, sent };
}
```

**Schedule**: Daily at 9 AM EST (`0 9 * * *`)

---

## 5. Database Triggers

### Seat Counter Trigger

```sql
-- See 02_DATABASE_SCHEMA.md for full implementation
-- Automatically updates event.currentSeats when:
-- - Registration changes to CONFIRMED (+1)
-- - Registration changes from CONFIRMED to CANCELLED (-1)
```

### Waitlist Position Trigger

```sql
-- See 02_DATABASE_SCHEMA.md for full implementation
-- Automatically assigns position when adding to waitlist
-- Position = MAX(position) + 1 for the event
```

---

## 6. Edge Cases & Error Handling

### Race Conditions

| Scenario | Prevention |
|----------|------------|
| Two users register for last seat | Database transaction with row-level locking |
| User accepts offer after another fills spot | Check capacity inside transaction before confirming |
| Cron runs while user is accepting | Transaction isolation |

### Error Recovery

| Error | Recovery |
|-------|----------|
| Email fails to send | Log error, continue (don't block transaction) |
| Stripe checkout creation fails | Return error, keep registration PENDING |
| Database transaction fails | Automatic rollback |

### Timeouts

| Operation | Timeout | Action |
|-----------|---------|--------|
| Pending registration (no payment) | 24 hours | Auto-cancel via cron |
| Waitlist offer | 48 hours | Mark EXPIRED via cron, offer to next |
| Stripe checkout session | 30 minutes | Stripe handles expiry |
