import { MembershipStatus } from '@prisma/client';

/**
 * Response DTO for membership data
 * Includes membership details and related type information
 */
export class MembershipResponseDto {
  id: string;
  userId: string;
  membershipTypeId: string;
  status: MembershipStatus;
  startDate: Date | null;
  expiryDate: Date | null;
  stripeCustomerId: string | null;
  approvedById: string | null;
  approvedAt: Date | null;
  approvalNote: string | null;
  upgradedFromId: string | null;
  upgradedToId: string | null;
  creditAppliedFromId: string | null;
  creditAmount: number | null;
  createdAt: Date;
  updatedAt: Date;

  // Related data
  membershipType?: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    price: number;
    benefits: any;
    durationMonths: number | null;
    isActive: boolean;
    sortOrder: number;
  };

  user?: {
    id: string;
    email: string;
    profile?: {
      firstName: string;
      lastName: string;
    };
  };

  approvedBy?: {
    id: string;
    email: string;
    profile?: {
      firstName: string;
      lastName: string;
    };
  };

  // Upgrade tracking
  upgradedFrom?: {
    id: string;
    status: MembershipStatus;
    membershipType?: {
      id: string;
      name: string;
      slug: string;
      price: number;
    };
  };

  upgradedTo?: {
    id: string;
    status: MembershipStatus;
    membershipType?: {
      id: string;
      name: string;
      slug: string;
      price: number;
    };
  };

  // Credit tracking
  creditAppliedFrom?: {
    id: string;
    status: MembershipStatus;
    expiryDate: Date | null;
    membershipType?: {
      id: string;
      name: string;
      slug: string;
      price: number;
    };
  };
}
