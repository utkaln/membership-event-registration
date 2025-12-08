import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateMembershipDto,
  UpdateMembershipDto,
  ApproveMembershipDto,
  MembershipResponseDto,
} from './dto';
import { MembershipStatus } from '@prisma/client';

@Injectable()
export class MembershipsService {
  private readonly logger = new Logger(MembershipsService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Get all available membership types (public)
   */
  async getMembershipTypes() {
    const types = await this.prisma.membershipType.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        price: true,
        benefits: true,
        durationMonths: true,
        sortOrder: true,
      },
    });

    return types;
  }

  /**
   * Calculate available credit from recently expired memberships
   * Returns credit info if user has an expired membership within the last 365 days
   * that hasn't been used for credit yet
   */
  async getAvailableCredit(userId: string): Promise<{
    hasCredit: boolean;
    creditAmount: number;
    expiredMembership?: {
      id: string;
      membershipType: string;
      expiryDate: Date;
      amountPaid: number;
    };
  }> {
    // Calculate date 365 days ago
    const oneYearAgo = new Date();
    oneYearAgo.setDate(oneYearAgo.getDate() - 365);

    // Find expired memberships within the last year that haven't been used for credit
    const expiredMemberships = await this.prisma.membership.findMany({
      where: {
        userId,
        status: 'EXPIRED',
        expiryDate: {
          gte: oneYearAgo, // Expired within last 365 days
        },
        creditUsedIn: null, // Credit hasn't been used yet
      },
      include: {
        membershipType: true,
      },
      orderBy: {
        expiryDate: 'desc', // Most recently expired first
      },
    });

    if (expiredMemberships.length === 0) {
      return { hasCredit: false, creditAmount: 0 };
    }

    // Use the most recently expired membership
    const membership = expiredMemberships[0];

    // Find the payment for this membership
    const payment = await this.prisma.payment.findFirst({
      where: {
        userId,
        status: 'COMPLETED',
        metadata: {
          path: ['membershipId'],
          equals: membership.id,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (!payment) {
      this.logger.warn(
        `No payment found for expired membership ${membership.id}, cannot provide credit`,
      );
      return { hasCredit: false, creditAmount: 0 };
    }

    const creditAmount = Number(payment.amount);

    return {
      hasCredit: true,
      creditAmount,
      expiredMembership: {
        id: membership.id,
        membershipType: membership.membershipType.name,
        expiryDate: membership.expiryDate!,
        amountPaid: creditAmount,
      },
    };
  }

  /**
   * Apply for a new membership (or upgrade existing)
   * User must have a complete profile before applying
   * If user has an ACTIVE membership, this will be treated as an upgrade
   */
  async create(
    userId: string,
    dto: CreateMembershipDto,
  ): Promise<MembershipResponseDto> {
    // Check if user has a profile
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.profile) {
      throw new BadRequestException(
        'Please complete your profile before applying for membership',
      );
    }

    // Check if user has a PENDING membership (cannot apply while payment pending)
    const pendingMembership = await this.prisma.membership.findFirst({
      where: {
        userId,
        status: MembershipStatus.PENDING,
      },
    });

    if (pendingMembership) {
      throw new BadRequestException(
        'You already have a pending membership. Please complete payment or cancel it before applying for a new one.',
      );
    }

    // Check if user has an ACTIVE membership (this will be an upgrade)
    const activeMembership = await this.prisma.membership.findFirst({
      where: {
        userId,
        status: MembershipStatus.ACTIVE,
      },
      include: {
        membershipType: true,
      },
    });

    // Validate membership type exists
    const newMembershipType = await this.prisma.membershipType.findUnique({
      where: { id: dto.membershipTypeId },
    });

    if (!newMembershipType) {
      throw new NotFoundException('Membership type not found');
    }

    // If upgrading, check if it's actually an upgrade (not downgrade or same)
    if (activeMembership && activeMembership.membershipTypeId === dto.membershipTypeId) {
      throw new BadRequestException(
        'You already have this membership type. Please select a different type to upgrade.',
      );
    }

    // Check for available credit from recently expired memberships
    const creditInfo = await this.getAvailableCredit(userId);

    if (creditInfo.hasCredit) {
      this.logger.log(
        `User ${userId} has $${creditInfo.creditAmount} credit available from expired membership ${creditInfo.expiredMembership?.id}`,
      );
    }

    // Create new membership with PENDING status (awaiting payment)
    const newMembership = await this.prisma.membership.create({
      data: {
        userId,
        membershipTypeId: dto.membershipTypeId,
        status: MembershipStatus.PENDING,
        startDate: null,
        expiryDate: null,
        // Link to previous membership if upgrading
        upgradedFromId: activeMembership?.id,
        // Apply credit if available
        creditAppliedFromId: creditInfo.hasCredit ? creditInfo.expiredMembership?.id : null,
        creditAmount: creditInfo.hasCredit ? creditInfo.creditAmount : null,
      },
      include: {
        membershipType: true,
        user: {
          include: { profile: true },
        },
        upgradedFrom: {
          include: {
            membershipType: true,
          },
        },
        creditAppliedFrom: {
          include: {
            membershipType: true,
          },
        },
      },
    });

    return this.toResponseDto(newMembership);
  }

  /**
   * Get current user's active or pending membership
   */
  async findMyMembership(userId: string): Promise<MembershipResponseDto | null> {
    const membership = await this.prisma.membership.findFirst({
      where: {
        userId,
        status: {
          in: [MembershipStatus.ACTIVE, MembershipStatus.PENDING],
        },
      },
      include: {
        membershipType: true,
        user: { include: { profile: true } },
        approvedBy: { include: { profile: true } },
        upgradedFrom: { include: { membershipType: true } },
        upgradedTo: { include: { membershipType: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!membership) {
      return null;
    }

    return this.toResponseDto(membership);
  }

  /**
   * Get user's membership history (all statuses)
   */
  async getMembershipHistory(userId: string): Promise<MembershipResponseDto[]> {
    const memberships = await this.prisma.membership.findMany({
      where: { userId },
      include: {
        membershipType: true,
        user: { include: { profile: true } },
        approvedBy: { include: { profile: true } },
        upgradedFrom: { include: { membershipType: true } },
        upgradedTo: { include: { membershipType: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return memberships.map((m) => this.toResponseDto(m));
  }

  /**
   * Get all memberships (admin only)
   */
  async findAll(params: {
    skip?: number;
    take?: number;
    status?: MembershipStatus;
  }): Promise<{ memberships: MembershipResponseDto[]; total: number }> {
    const { skip = 0, take = 10, status } = params;

    const where = status ? { status } : {};

    const [memberships, total] = await Promise.all([
      this.prisma.membership.findMany({
        where,
        skip,
        take,
        include: {
          membershipType: true,
          user: { include: { profile: true } },
          approvedBy: { include: { profile: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.membership.count({ where }),
    ]);

    return {
      memberships: memberships.map((m) => this.toResponseDto(m)),
      total,
    };
  }

  /**
   * Get membership by ID (admin only)
   */
  async findOne(id: string): Promise<MembershipResponseDto> {
    const membership = await this.prisma.membership.findUnique({
      where: { id },
      include: {
        membershipType: true,
        user: { include: { profile: true } },
        approvedBy: { include: { profile: true } },
      },
    });

    if (!membership) {
      throw new NotFoundException('Membership not found');
    }

    return this.toResponseDto(membership);
  }

  /**
   * Approve a pending membership (admin only)
   */
  async approve(
    membershipId: string,
    adminId: string,
    dto: ApproveMembershipDto,
  ): Promise<MembershipResponseDto> {
    const membership = await this.prisma.membership.findUnique({
      where: { id: membershipId },
      include: { membershipType: true },
    });

    if (!membership) {
      throw new NotFoundException('Membership not found');
    }

    if (membership.status !== MembershipStatus.PENDING) {
      throw new BadRequestException(
        'Only pending memberships can be approved',
      );
    }

    // Approve and activate membership, promote user role
    const updatedMembership = await this.prisma.$transaction(async (tx) => {
      // Activate membership
      const activated = await tx.membership.update({
        where: { id: membershipId },
        data: {
          status: MembershipStatus.ACTIVE,
          startDate: new Date(),
          expiryDate: membership.membershipType.durationMonths
            ? this.calculateExpiryDate(membership.membershipType.durationMonths)
            : null, // Lifetime membership if durationMonths is null
          approvedById: adminId,
          approvedAt: new Date(),
          approvalNote: dto.approvalNote,
        },
        include: {
          membershipType: true,
          user: { include: { profile: true } },
          approvedBy: { include: { profile: true } },
        },
      });

      // Promote user to MEMBER role if they're currently GUEST
      await tx.user.updateMany({
        where: {
          id: membership.userId,
          role: 'GUEST',
        },
        data: {
          role: 'MEMBER',
        },
      });

      return activated;
    });

    this.logger.log(
      `Approved membership ${membershipId} and promoted user to MEMBER role`,
    );

    return this.toResponseDto(updatedMembership);
  }

  /**
   * Reject a pending membership (admin only)
   */
  async reject(
    membershipId: string,
    adminId: string,
    reason: string,
  ): Promise<MembershipResponseDto> {
    const membership = await this.prisma.membership.findUnique({
      where: { id: membershipId },
    });

    if (!membership) {
      throw new NotFoundException('Membership not found');
    }

    if (membership.status !== MembershipStatus.PENDING) {
      throw new BadRequestException(
        'Only pending memberships can be rejected',
      );
    }

    const updatedMembership = await this.prisma.membership.update({
      where: { id: membershipId },
      data: {
        status: MembershipStatus.CANCELLED,
        approvedById: adminId,
        approvedAt: new Date(),
        approvalNote: reason,
      },
      include: {
        membershipType: true,
        user: { include: { profile: true } },
        approvedBy: { include: { profile: true } },
      },
    });

    return this.toResponseDto(updatedMembership);
  }

  /**
   * Update membership status (admin only)
   * Allows admin to manually change membership status with optional note
   */
  async updateStatus(
    membershipId: string,
    status: MembershipStatus,
    note?: string,
  ): Promise<MembershipResponseDto> {
    const membership = await this.prisma.membership.findUnique({
      where: { id: membershipId },
    });

    if (!membership) {
      throw new NotFoundException('Membership not found');
    }

    const updatedMembership = await this.prisma.membership.update({
      where: { id: membershipId },
      data: {
        status,
        ...(note && { approvalNote: note }), // Add note if provided
      },
      include: {
        membershipType: true,
        user: { include: { profile: true } },
        approvedBy: { include: { profile: true } },
      },
    });

    this.logger.log(
      `Admin updated membership ${membershipId} status to ${status}${note ? ` - Note: ${note}` : ''}`,
    );

    return this.toResponseDto(updatedMembership);
  }

  /**
   * Assign honorary membership (admin only)
   * Creates ACTIVE honorary membership without payment
   * Promotes user to MEMBER role immediately
   */
  async assignHonoraryMembership(
    userId: string,
    adminId: string,
    note?: string,
  ): Promise<MembershipResponseDto> {
    // Verify user exists and has profile
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.profile) {
      throw new BadRequestException(
        'User must have a complete profile before receiving honorary membership',
      );
    }

    // Get HONORARY membership type
    const honoraryType = await this.prisma.membershipType.findUnique({
      where: { slug: 'honorary' },
    });

    if (!honoraryType) {
      throw new NotFoundException(
        'Honorary membership type not found. Please run seed script.',
      );
    }

    // Create honorary membership with ACTIVE status, no payment needed
    const honoraryMembership = await this.prisma.$transaction(async (tx) => {
      const membership = await tx.membership.create({
        data: {
          userId,
          membershipTypeId: honoraryType.id,
          status: 'ACTIVE',
          startDate: new Date(),
          expiryDate: null, // Lifetime
          approvedById: adminId,
          approvedAt: new Date(),
          approvalNote: note || 'Honorary membership granted by admin',
        },
        include: {
          membershipType: true,
          user: { include: { profile: true } },
          approvedBy: { include: { profile: true } },
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

      return membership;
    });

    this.logger.log(
      `Admin assigned honorary membership to user ${userId}${note ? ` - Note: ${note}` : ''}`,
    );

    return this.toResponseDto(honoraryMembership);
  }

  /**
   * Cancel a membership
   */
  async cancel(membershipId: string, userId: string): Promise<MembershipResponseDto> {
    const membership = await this.prisma.membership.findUnique({
      where: { id: membershipId },
    });

    if (!membership) {
      throw new NotFoundException('Membership not found');
    }

    if (membership.userId !== userId) {
      throw new ForbiddenException('You can only cancel your own membership');
    }

    if (membership.status === MembershipStatus.CANCELLED) {
      throw new BadRequestException('Membership is already cancelled');
    }

    const updatedMembership = await this.prisma.membership.update({
      where: { id: membershipId },
      data: {
        status: MembershipStatus.CANCELLED,
      },
      include: {
        membershipType: true,
        user: { include: { profile: true } },
        approvedBy: { include: { profile: true } },
      },
    });

    return this.toResponseDto(updatedMembership);
  }

  /**
   * Check and update expired memberships (cron job)
   * Also demotes user role to GUEST when membership expires
   */
  async updateExpiredMemberships(): Promise<number> {
    // Find all memberships that have expired
    const expiredMemberships = await this.prisma.membership.findMany({
      where: {
        status: MembershipStatus.ACTIVE,
        expiryDate: {
          lt: new Date(),
        },
      },
      select: {
        id: true,
        userId: true,
      },
    });

    if (expiredMemberships.length === 0) {
      return 0;
    }

    // Use transaction to update both memberships and user roles
    await this.prisma.$transaction(async (tx) => {
      // Mark memberships as expired
      await tx.membership.updateMany({
        where: {
          id: {
            in: expiredMemberships.map((m) => m.id),
          },
        },
        data: {
          status: MembershipStatus.EXPIRED,
        },
      });

      // Demote user roles to GUEST
      await tx.user.updateMany({
        where: {
          id: {
            in: expiredMemberships.map((m) => m.userId),
          },
          role: 'MEMBER', // Only demote if they're currently MEMBER
        },
        data: {
          role: 'GUEST',
        },
      });
    });

    this.logger.log(
      `Expired ${expiredMemberships.length} memberships and demoted users to GUEST role`,
    );

    return expiredMemberships.length;
  }

  /**
   * Calculate expiry date based on duration
   */
  private calculateExpiryDate(durationMonths: number): Date {
    const expiryDate = new Date();
    expiryDate.setMonth(expiryDate.getMonth() + durationMonths);
    return expiryDate;
  }

  /**
   * Convert Prisma model to response DTO
   */
  private toResponseDto(membership: any): MembershipResponseDto {
    return {
      id: membership.id,
      userId: membership.userId,
      membershipTypeId: membership.membershipTypeId,
      status: membership.status,
      startDate: membership.startDate,
      expiryDate: membership.expiryDate,
      stripeCustomerId: membership.stripeCustomerId,
      approvedById: membership.approvedById,
      approvedAt: membership.approvedAt,
      approvalNote: membership.approvalNote,
      upgradedFromId: membership.upgradedFromId,
      upgradedToId: membership.upgradedToId,
      creditAppliedFromId: membership.creditAppliedFromId,
      creditAmount: membership.creditAmount ? Number(membership.creditAmount) : null,
      createdAt: membership.createdAt,
      updatedAt: membership.updatedAt,
      membershipType: membership.membershipType,
      upgradedFrom: membership.upgradedFrom
        ? {
            id: membership.upgradedFrom.id,
            membershipType: membership.upgradedFrom.membershipType,
            status: membership.upgradedFrom.status,
          }
        : undefined,
      upgradedTo: membership.upgradedTo
        ? {
            id: membership.upgradedTo.id,
            membershipType: membership.upgradedTo.membershipType,
            status: membership.upgradedTo.status,
          }
        : undefined,
      creditAppliedFrom: membership.creditAppliedFrom
        ? {
            id: membership.creditAppliedFrom.id,
            membershipType: membership.creditAppliedFrom.membershipType,
            status: membership.creditAppliedFrom.status,
            expiryDate: membership.creditAppliedFrom.expiryDate,
          }
        : undefined,
      user: membership.user
        ? {
            id: membership.user.id,
            email: membership.user.email,
            profile: membership.user.profile
              ? {
                  firstName: membership.user.profile.firstName,
                  lastName: membership.user.profile.lastName,
                }
              : undefined,
          }
        : undefined,
      approvedBy: membership.approvedBy
        ? {
            id: membership.approvedBy.id,
            email: membership.approvedBy.email,
            profile: membership.approvedBy.profile
              ? {
                  firstName: membership.approvedBy.profile.firstName,
                  lastName: membership.approvedBy.profile.lastName,
                }
              : undefined,
          }
        : undefined,
    };
  }
}
