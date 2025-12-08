import { UserRole } from '@prisma/client';

export class UserResponseDto {
  id: string;
  email: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
  profile?: ProfileResponseDto;
}

export class ProfileResponseDto {
  id: string;
  firstName: string;
  lastName: string;
  spouseName?: string;
  children?: any;
  address: any;
  phone?: string;
  avatarUrl?: string;
  bio?: string;
  createdAt: Date;
  updatedAt: Date;
}
