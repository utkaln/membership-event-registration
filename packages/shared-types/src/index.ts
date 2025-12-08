// Shared TypeScript types across frontend and backend

export enum UserRole {
  GUEST = 'GUEST',
  MEMBER = 'MEMBER',
  CONTRIBUTOR = 'CONTRIBUTOR',
  ADMIN = 'ADMIN',
}

export enum MembershipStatus {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  EXPIRED = 'EXPIRED',
  CANCELLED = 'CANCELLED',
}

export enum RegistrationStatus {
  PENDING_PAYMENT = 'PENDING_PAYMENT',
  CONFIRMED = 'CONFIRMED',
  CANCELLED = 'CANCELLED',
  CHECKED_IN = 'CHECKED_IN',
}

export enum WaitlistStatus {
  WAITING = 'WAITING',
  OFFERED = 'OFFERED',
  ACCEPTED = 'ACCEPTED',
  EXPIRED = 'EXPIRED',
  DECLINED = 'DECLINED',
}

// Add more shared types as needed
export type * from './user';
export type * from './event';
export type * from './membership';
