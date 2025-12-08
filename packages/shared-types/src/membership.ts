import { MembershipStatus } from './index';

export interface Membership {
  id: string;
  userId: string;
  membershipTypeId: string;
  status: MembershipStatus;
  startDate: Date;
  endDate: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface MembershipType {
  id: string;
  name: string;
  description?: string | null;
  price: number;
  durationMonths: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
