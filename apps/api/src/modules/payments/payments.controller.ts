import {
  Controller,
  Post,
  Get,
  Put,
  Body,
  Param,
  Headers,
  RawBodyRequest,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';
import { StripeService } from './stripe.service';
import { CreateCheckoutSessionDto, UpdatePaymentDto } from './dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Controller('payments')
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(
    private readonly stripeService: StripeService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Create a Stripe checkout session for membership payment
   * POST /api/payments/checkout-session
   */
  @Post('checkout-session')
  @UseGuards(JwtAuthGuard)
  async createCheckoutSession(
    @CurrentUser() user: any,
    @Body() dto: CreateCheckoutSessionDto,
  ) {
    // Get membership details
    const membership = await this.prisma.membership.findUnique({
      where: { id: dto.membershipId },
      include: {
        membershipType: true,
        user: {
          include: { profile: true },
        },
      },
    });

    if (!membership) {
      throw new BadRequestException('Membership not found');
    }

    if (membership.userId !== user.id) {
      throw new BadRequestException('You can only pay for your own membership');
    }

    if (membership.status !== 'PENDING') {
      throw new BadRequestException('Membership is not in PENDING status');
    }

    // Calculate the final amount to charge (apply credit if available)
    const basePrice = Number(membership.membershipType.price);
    const creditAmount = membership.creditAmount ? Number(membership.creditAmount) : 0;
    const finalAmount = Math.max(0, basePrice - creditAmount);

    if (creditAmount > 0) {
      this.logger.log(
        `Applying $${creditAmount} credit to membership ${membership.id}. Original: $${basePrice}, Final: $${finalAmount}`,
      );
    }

    // Create checkout session
    const session = await this.stripeService.createMembershipCheckoutSession({
      userId: user.id,
      membershipId: membership.id,
      membershipTypeId: membership.membershipTypeId,
      membershipTypeName: membership.membershipType.name,
      amount: finalAmount,
      currency: 'usd',
      customerEmail: user.email,
      successUrl: dto.successUrl,
      cancelUrl: dto.cancelUrl,
    });

    return {
      sessionId: session.id,
      url: session.url,
    };
  }

  /**
   * Stripe webhook endpoint for handling payment events
   * POST /api/payments/webhook
   *
   * IMPORTANT: This endpoint must be accessible without authentication
   * and must use raw body parsing for signature verification
   */
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Headers('stripe-signature') signature: string,
    @Req() req: RawBodyRequest<Request>,
  ) {
    if (!signature) {
      throw new BadRequestException('Missing stripe-signature header');
    }

    // Get raw body for signature verification
    const rawBody = req.rawBody;
    if (!rawBody) {
      throw new BadRequestException('Missing raw body');
    }

    // Verify webhook signature and construct event
    const event = this.stripeService.verifyWebhookSignature(rawBody, signature);

    this.logger.log(`Received Stripe webhook: ${event.type}`);

    // Handle the event
    switch (event.type) {
      case 'checkout.session.completed':
        const session = event.data.object;
        if (session.payment_status === 'paid') {
          await this.stripeService.handlePaymentSuccess(session);
        }
        break;

      case 'checkout.session.async_payment_succeeded':
        await this.stripeService.handlePaymentSuccess(event.data.object);
        break;

      case 'checkout.session.async_payment_failed':
      case 'checkout.session.expired':
        await this.stripeService.handlePaymentFailure(event.data.object);
        break;

      default:
        this.logger.log(`Unhandled event type: ${event.type}`);
    }

    return { received: true };
  }

  /**
   * Get current user's payment history
   * GET /api/payments/me
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getMyPayments(@CurrentUser() user: any) {
    return this.stripeService.getUserPayments(user.id);
  }

  /**
   * Update payment amount (admin only)
   * PUT /api/payments/:id
   */
  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async updatePayment(
    @Param('id') id: string,
    @Body() dto: UpdatePaymentDto,
  ) {
    return this.stripeService.updatePaymentAmount(id, dto.amount, dto.note);
  }
}
