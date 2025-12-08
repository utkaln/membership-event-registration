import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

/**
 * DTO for admin to update payment amount
 */
export class UpdatePaymentDto {
  @IsNumber()
  @Min(0)
  amount: number;

  @IsOptional()
  @IsString()
  note?: string; // Optional note explaining the amount change
}
