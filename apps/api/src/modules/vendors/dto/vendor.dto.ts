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

/**
 * Somebody the shop buys from.
 *
 * Material is most of a decor shop's cost, so who supplies it, on what terms
 * and how reliably is worth keeping properly rather than in a phone's contacts.
 */
export class VendorDto {
  /**
   * What the shop calls them. A firm's name or a person's — whichever is said
   * when somebody asks where a sheet came from.
   */
  @IsString() @MinLength(2) @MaxLength(160) name!: string;
  /** The number that is rung to chase a delivery. */
  @IsOptional() @IsString() @MaxLength(20) phone?: string;
  /** A second number — the person who actually loads the vehicle, usually. */
  @IsOptional() @IsString() @MaxLength(20) altPhone?: string;
  /** Where purchase orders are sent, when they are sent rather than telephoned. */
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

  /** The trading name on their bills, which is rarely what they are called. */
  @IsOptional() @IsString() @MaxLength(160) company?: string;
  /**
   * Their GST state code, as two digits. Theirs against the shop's decides
   * whether their bill carries CGST and SGST or a single IGST line — which is
   * what the shop has to match when claiming the input credit back.
   */
  @IsOptional() @IsString() @MaxLength(4) stateCode?: string;
  /** The state that code stands for, spelt out. */
  @IsOptional() @IsString() @MaxLength(60) stateName?: string;
  /** Where they are. Kept as one block, because it is usually pasted. */
  @IsOptional() @IsString() @MaxLength(500) address?: string;
  /**
   * Anything worth remembering about dealing with them — who to ask for, how
   * late they usually are, what they are good for and what they are not.
   */
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
  /** What the shop buys from them, in its own words. */
  @IsOptional() @IsString() @MaxLength(200) supplies?: string;
  /**
   * How many days after the bill they expect to be paid. Zero means on
   * delivery. It is what "what do we owe, and when" is worked out from.
   */
  @IsOptional() @IsInt() @Min(0) @Max(365) @Type(() => Number) paymentTermDays?: number;
  /**
   * Whether they are still bought from. Switching this off takes them out of
   * the list offered when raising a purchase order and changes nothing about
   * what was already bought from them — that history is the shop's record of
   * what it paid and when.
   */
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class VendorQueryDto extends PaginationDto {
  /**
   * Show vendors who have been switched off as well. Off by default, because
   * the list is usually being read to decide who to buy from next.
   */
  @IsOptional() @IsBoolean() @Type(() => Boolean) includeInactive?: boolean;
  /** Name, code, phone, or what they supply. */
  @IsOptional() @IsString() declare search?: string;
}

export { GSTIN };
