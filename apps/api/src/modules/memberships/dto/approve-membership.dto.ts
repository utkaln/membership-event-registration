import { IsString, IsOptional, MaxLength } from 'class-validator';

/**
 * DTO for admin approval of membership application
 */
export class ApproveMembershipDto {
  @IsString()
  @IsOptional()
  @MaxLength(500)
  approvalNote?: string;
}
