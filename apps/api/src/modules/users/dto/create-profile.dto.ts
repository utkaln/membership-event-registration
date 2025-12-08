import { IsString, IsOptional, IsObject, IsDateString, IsEnum, Length, Matches, ValidateNested } from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class AddressDto {
  @IsString()
  street: string;

  @IsString()
  city: string;

  @IsString()
  state: string;

  @IsString()
  @Length(5, 10)
  zip: string;

  @IsString()
  @IsOptional()
  country?: string;
}

export class ChildDto {
  @IsString()
  name: string;

  @IsOptional()
  age?: number;

  @IsString()
  @IsOptional()
  gender?: string;
}

export class CreateProfileDto {
  @IsString()
  @Length(1, 100)
  firstName: string;

  @IsString()
  @Length(1, 100)
  lastName: string;

  @IsString()
  @IsOptional()
  @Length(1, 100)
  spouseName?: string;

  @IsDateString()
  @IsOptional()
  dateOfBirth?: string;

  @IsEnum(['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY'])
  @IsOptional()
  gender?: string;

  // Accept flat address fields
  @IsString()
  @IsOptional()
  addressLine1?: string;

  @IsString()
  @IsOptional()
  addressLine2?: string;

  @IsString()
  @IsOptional()
  city?: string;

  @IsString()
  @IsOptional()
  state?: string;

  @IsString()
  @IsOptional()
  zipCode?: string;

  @IsString()
  @IsOptional()
  country?: string;

  // OR accept nested address object
  @IsObject()
  @ValidateNested()
  @Type(() => AddressDto)
  @IsOptional()
  address?: AddressDto;

  @IsString()
  @IsOptional()
  @Matches(/^\+?[1-9]\d{1,14}$/, {
    message: 'Phone must be a valid international phone number',
  })
  phone?: string;

  @IsString()
  @IsOptional()
  @Length(0, 500)
  bio?: string;

  @IsOptional()
  children?: ChildDto[];
}
