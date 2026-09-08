import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { PaginationDto } from '../../../common/dto/pagination.dto';

/** 15 characters: two state digits, a PAN, and three more. */
const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9]Z[A-Z0-9]$/;

/** Empty means "clear it", and skips the pattern check. */
const given = (value: unknown) => value !== '';

/**
 * A GSTIN is upper case wherever it is printed.
 *
 * Tidied before it is judged, because it is copied off a bill and typed by
 * somebody in a hurry. Refusing what is on the paper would be pedantry rather
 * than validation — the same lesson the employee PAN taught.
 */
function upper({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.replace(/\s+/g, '').toUpperCase() : value;
}

export class VendorDto {
  @IsString() @MinLength(2) @MaxLength(160) name!: string;
  @IsOptional() @IsString() @MaxLength(20) phone?: string;
  @IsOptional() @IsString() @MaxLength(20) altPhone?: string;
  @IsOptional() @IsString() @MaxLength(200) email?: string;

  /**
   * Checked rather than accepted as free text.
   *
   * A wrong GSTIN on a purchase bill is input credit the shop does not get,
   * and it is found either the day it is typed or a quarter later.
   */
  @IsOptional()
  @Transform(upper)
  @ValidateIf((_, value) => given(value))
  @Matches(GSTIN, { message: 'A GSTIN is 15 characters, like 08AAACH7409R1ZS' })
  gstin?: string;

  @IsOptional() @IsString() @MaxLength(160) company?: string;
  @IsOptional() @IsString() @MaxLength(4) stateCode?: string;
  @IsOptional() @IsString() @MaxLength(60) stateName?: string;
  @IsOptional() @IsString() @MaxLength(500) address?: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
  /** What the shop buys from them, in its own words. */
  @IsOptional() @IsString() @MaxLength(200) supplies?: string;
  @IsOptional() @IsInt() @Min(0) @Max(365) @Type(() => Number) paymentTermDays?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class VendorQueryDto extends PaginationDto {
  @IsOptional() @IsBoolean() @Type(() => Boolean) includeInactive?: boolean;
  /** Name, code, phone, or what they supply. */
  @IsOptional() @IsString() declare search?: string;
}

export { GSTIN };
