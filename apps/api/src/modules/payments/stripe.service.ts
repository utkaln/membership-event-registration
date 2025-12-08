import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { PrismaService } from '../../prisma/prisma.service';
import { PaymentType, PaymentStatus } from '@prisma/client';

@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  private stripe: Stripe;

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    const secretKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    if (!secretKey) {
      this.logger.warn('STRIPE_SECRET_KEY not configured');
    }
    this.stripe = new Stripe(secretKey || '', {
      apiVersion: '2025-11-17.clover',
    });
  }

  /**
   * Create a Stripe Customer for a user
   */
  async createCustomer(
    userId: string,
    email: string,
    name?: string,
  ): Promise<string> {
    try {
      const customer = await this.stripe.customers.create({
        email,
        name,
        metadata: {
          userId,
        },
      });

      this.logger.log(`Created Stripe customer ${customer.id} for user ${userId}`);
      return customer.id;
    } catch (error) {
      this.logger.error(`Failed to create Stripe customer: ${error.message}`);
      throw new BadRequestException('Failed to create customer');
    }
  }

  /**
   * Create a checkout session for membership payment
   */
  async createMembershipCheckoutSession(params: {
    userId: string;
    membershipId: string;
    membershipTypeId: string;
    membershipTypeName: string;
    amount: number;
    currency: string;
    customerEmail: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<Stripe.Checkout.Session> {
    try {
      const session = await this.stripe.checkout.sessions.create({
        customer_email: params.customerEmail,
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: params.currency,
              product_data: {
                name: `${params.membershipTypeName} Membership`,
                description: `OSA ${params.membershipTypeName} Membership`,
              },
              unit_amount: Math.round(params.amount * 100), // Convert to cents
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: params.successUrl,
        cancel_url: params.cancelUrl,
        metadata: {
          userId: params.userId,
          membershipId: params.membershipId,
          membershipTypeId: params.membershipTypeId,
          paymentType: PaymentType.MEMBERSHIP,
        },
      });

      this.logger.log(`Created checkout session ${session.id} for membership ${params.membershipId}`);
      return session;
    } catch (error) {
      this.logger.error(`Failed to create checkout session: ${error.message}`);
      throw new BadRequestException('Failed to create checkout session');
    }
  }

  /**
   * Handle successful payment from Stripe webhook
   */
  async handlePaymentSuccess(session: Stripe.Checkout.Session): Promise<void> {
    const metadata = session.metadata || {};
    const { userId, membershipId, membershipTypeId, paymentType } = metadata;

    if (!userId || !paymentType) {
      throw new BadRequestException('Missing required metadata in session');
    }

    if (!session.amount_total || !session.currency) {
      throw new BadRequestException('Missing payment amount or currency');
    }

    this.logger.log(`Processing successful payment for session ${session.id}`);

    try {
      // Create payment record
      const payment = await this.prisma.payment.create({
        data: {
          userId,
          type: paymentType as PaymentType,
          amount: session.amount_total / 100, // Convert from cents
          currency: session.currency.toUpperCase(),
          stripePaymentId: session.payment_intent as string,
          stripeSessionId: session.id,
          status: PaymentStatus.COMPLETED,
          metadata: {
            membershipId,
            membershipTypeId,
            customerEmail: session.customer_email,
          },
        },
      });

      this.logger.log(`Created payment record ${payment.id} for user ${userId}`);

      // Update membership status and link payment
      if (paymentType === PaymentType.MEMBERSHIP && membershipId) {
        const membership = await this.prisma.membership.findUnique({
          where: { id: membershipId },
          include: {
            membershipType: true,
            creditAppliedFrom: {
              include: {
                membershipType: true,
              },
            },
          },
        });

        if (membership) {
          // Log credit usage if applicable
          if (membership.creditAmount && membership.creditAppliedFrom) {
            this.logger.log(
              `Credit of $${membership.creditAmount} from expired ${membership.creditAppliedFrom.membershipType.name} membership was applied`,
            );
          }

          // Calculate expiry date
          const startDate = new Date();
          let expiryDate: Date | null = null;
          if (membership.membershipType.durationMonths) {
            expiryDate = new Date(startDate);
            expiryDate.setMonth(expiryDate.getMonth() + membership.membershipType.durationMonths);
          }

          // Use transaction to update membership and user role atomically
          await this.prisma.$transaction(async (tx) => {
            // If this is an upgrade (has upgradedFromId), mark the old membership as UPGRADED
            if (membership.upgradedFromId) {
              await tx.membership.update({
                where: { id: membership.upgradedFromId },
                data: {
                  status: 'UPGRADED',
                  upgradedToId: membershipId,
                },
              });
              this.logger.log(`Marked old membership ${membership.upgradedFromId} as UPGRADED`);
            }

            // Activate new membership
            await tx.membership.update({
              where: { id: membershipId },
              data: {
                status: 'ACTIVE',
                startDate,
                expiryDate,
                lastPaymentId: payment.id,
                stripeCustomerId: session.customer as string,
              },
            });

            // Promote user to MEMBER role if they're currently GUEST
            await tx.user.updateMany({
              where: {
                id: userId,
                role: 'GUEST',
              },
              data: {
                role: 'MEMBER',
              },
            });
          });

          this.logger.log(`Activated membership ${membershipId} and promoted user to MEMBER role`);
        }
      }
    } catch (error) {
      this.logger.error(`Failed to process payment success: ${error.message}`);
      throw error;
    }
  }

  /**
   * Handle failed payment from Stripe webhook
   */
  async handlePaymentFailure(session: Stripe.Checkout.Session): Promise<void> {
    const metadata = session.metadata || {};
    const { userId, membershipId, paymentType } = metadata;

    if (!userId || !paymentType) {
      throw new BadRequestException('Missing required metadata in session');
    }

    if (!session.amount_total || !session.currency) {
      throw new BadRequestException('Missing payment amount or currency');
    }

    this.logger.warn(`Processing failed payment for session ${session.id}`);

    try {
      // Create payment record with FAILED status
      await this.prisma.payment.create({
        data: {
          userId,
          type: paymentType as PaymentType,
          amount: session.amount_total / 100,
          currency: session.currency.toUpperCase(),
          stripePaymentId: session.payment_intent as string || session.id,
          stripeSessionId: session.id,
          status: PaymentStatus.FAILED,
          metadata: {
            membershipId,
            customerEmail: session.customer_email,
          },
        },
      });

      this.logger.log(`Created failed payment record for user ${userId}`);
    } catch (error) {
      this.logger.error(`Failed to process payment failure: ${error.message}`);
      throw error;
    }
  }

  /**
   * Verify Stripe webhook signature
   */
  verifyWebhookSignature(
    payload: string | Buffer,
    signature: string,
  ): Stripe.Event {
    const webhookSecret = this.configService.get<string>('STRIPE_WEBHOOK_SECRET');

    if (!webhookSecret) {
      throw new BadRequestException('Webhook secret not configured');
    }

    try {
      return this.stripe.webhooks.constructEvent(
        payload,
        signature,
        webhookSecret,
      );
    } catch (error) {
      this.logger.error(`Webhook signature verification failed: ${error.message}`);
      throw new BadRequestException('Invalid webhook signature');
    }
  }

  /**
   * Get payment by Stripe session ID
   */
  async getPaymentBySessionId(sessionId: string) {
    return this.prisma.payment.findFirst({
      where: { stripeSessionId: sessionId },
      include: { user: true },
    });
  }

  /**
   * Get all payments for a user
   */
  async getUserPayments(userId: string) {
    return this.prisma.payment.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Update payment amount (admin only)
   * This updates the payment record in the database
   * Note: This does not modify the Stripe payment, only our local record
   */
  async updatePaymentAmount(paymentId: string, amount: number, note?: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
    });

    if (!payment) {
      throw new BadRequestException('Payment not found');
    }

    const updatedPayment = await this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        amount,
        metadata: {
          ...(payment.metadata as any),
          ...(note && { adminNote: note }),
          adminUpdated: true,
          adminUpdatedAt: new Date().toISOString(),
        },
      },
    });

    this.logger.log(
      `Admin updated payment ${paymentId} amount to $${amount}${note ? ` - Note: ${note}` : ''}`,
    );

    return updatedPayment;
  }
}
