import { IsString, IsNotEmpty, IsUUID } from 'class-validator';

/**
 * DTO for creating a new membership application
 * User selects a membership type and applies
 */
export class CreateMembershipDto {
  @IsUUID()
  @IsNotEmpty()
  membershipTypeId: string;
}
