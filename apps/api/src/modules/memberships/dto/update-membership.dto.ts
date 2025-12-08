import { PartialType } from '@nestjs/mapped-types';
import { CreateMembershipDto } from './create-membership.dto';

/**
 * DTO for updating membership details
 * Currently only allows changing membership type
 */
export class UpdateMembershipDto extends PartialType(CreateMembershipDto) {}
