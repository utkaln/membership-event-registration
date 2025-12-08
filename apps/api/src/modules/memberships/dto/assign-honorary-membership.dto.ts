import { IsString, IsOptional, IsUUID } from 'class-validator';

/**
 * DTO for admin to assign honorary membership to a user
 */
export class AssignHonoraryMembershipDto {
  @IsUUID()
  userId: string; // User to assign honorary membership to

  @IsOptional()
  @IsString()
  note?: string; // Optional note explaining why honorary membership was granted
}
