import { IsEnum, IsOptional, IsString } from 'class-validator';
import { MembershipStatus } from '@prisma/client';

/**
 * DTO for admin to update membership status
 */
export class UpdateMembershipStatusDto {
  @IsEnum(MembershipStatus)
  status: MembershipStatus;

  @IsOptional()
  @IsString()
  note?: string; // Optional note explaining the status change
}
