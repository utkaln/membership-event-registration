import { IsString, IsNotEmpty, IsUUID, Matches } from 'class-validator';

/**
 * DTO for creating a Stripe checkout session for membership payment
 */
export class CreateCheckoutSessionDto {
  @IsUUID()
  @IsNotEmpty()
  membershipId: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^https?:\/\/.+/, {
    message: 'successUrl must be a valid URL starting with http:// or https://',
  })
  successUrl: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^https?:\/\/.+/, {
    message: 'cancelUrl must be a valid URL starting with http:// or https://',
  })
  cancelUrl: string;
}
