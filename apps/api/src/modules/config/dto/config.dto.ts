import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { LENGTH_UNITS, LengthUnit } from '@fas/shared';

/**
 * Admin screens let people type sizes in whatever unit they think in, so every
 * dimension arrives as a value plus its unit and is converted to millimetres
 * before it is stored. The DTO never carries a bare number.
 */
export class MeasurementDto {
  /** The number as it was measured — 2.5, 600, 18. */
  @Type(() => Number) @IsNumber() @Min(0) value: number;
  /**
   * What that number is in: millimetres, inches, feet. It travels with the
   * number because the same figure means four different sizes without it, and
   * a shop whose tape reads in feet should not be converting in its head.
   */
  @IsIn(LENGTH_UNITS as unknown as string[]) unit: LengthUnit;
}

/**
 * Something the shop works in, and what can be picked while punching.
 *
 * The list is the shop's own. What one shop calls "18mm ply" another calls by
 * a brand name, and an order priced against the wrong material is an order
 * priced wrongly.
 */
export class CreateMaterialDto {
  /**
   * A short code for it, used on job cards and purchase orders. Fixed once
   * created, because orders and stock already refer to it.
   */
  @IsString() @MinLength(1) code: string;
  /** What it is called when picking it — what the floor says out loud. */
  @IsString() @MinLength(1) name: string;
  /** Anything worth knowing about it — a grade, a finish, a supplier's name. */
  @IsOptional() @IsString() description?: string;
  /** A colour, so a board of orders can be read at a glance. */
  @IsOptional() @IsString() color?: string;
  /**
   * Where it sits in the list. What the shop uses daily belongs at the top,
   * because this is picked while somebody is on the phone.
   */
  @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;

  /** Thickness options offered for this material. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ThicknessDto)
  thicknesses?: ThicknessDto[];
}

/** One thickness this material is stocked and sold in. */
export class ThicknessDto {
  /** The thickness itself, in whatever unit it is spoken of. */
  @ValidateNested() @Type(() => MeasurementDto) value: MeasurementDto;
  /**
   * What the shop calls it, when that is not just the number — "18mm", "3/4
   * inch", "single". Printed on the job card so the floor reads its own words.
   */
  @IsOptional() @IsString() label?: string;
  /** Where it sits in the list offered for this material. */
  @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
}

export class UpdateMaterialDto {
  /** The short code used on job cards and purchase orders. */
  @IsOptional() @IsString() code?: string;
  /** What it is called when picking it. */
  @IsOptional() @IsString() name?: string;
  /** Anything worth knowing about it. */
  @IsOptional() @IsString() description?: string;
  /** A colour, so a board can be read at a glance. */
  @IsOptional() @IsString() color?: string;
  /** Where it sits in the list. */
  @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
  /**
   * Whether it is still offered while punching. Switching it off takes it out
   * of the list and leaves every order already made from it alone — those are
   * a record of what was built.
   */
  @IsOptional() @IsBoolean() isActive?: boolean;
}

/**
 * A size the shop makes often enough to name.
 *
 * A standard door, a shutter, a drawer front. Picking one is faster than
 * typing three dimensions, and faster on the phone is the whole point of
 * punching.
 */
export class CreateSizePresetDto {
  /** A short code for it. Fixed once created, because orders refer to it. */
  @IsString() @MinLength(1) code: string;
  /** What the shop calls this size — "Standard door", "Full shutter". */
  @IsString() @MinLength(1) name: string;
  /** How long, in whatever unit the shop thinks in. */
  @ValidateNested() @Type(() => MeasurementDto) length: MeasurementDto;
  /** How wide. */
  @ValidateNested() @Type(() => MeasurementDto) width: MeasurementDto;
  /** How thick, where the size implies one. */
  @IsOptional() @ValidateNested() @Type(() => MeasurementDto) thickness?: MeasurementDto;
  /** Where it sits in the list offered while punching. */
  @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
}

export class UpdateSizePresetDto {
  /** The short code orders refer to. */
  @IsOptional() @IsString() code?: string;
  /** What the shop calls this size. */
  @IsOptional() @IsString() name?: string;
  /**
   * How long. Changing it changes what the preset offers from now on and
   * leaves orders already punched at the old size exactly as they were.
   */
  @IsOptional() @ValidateNested() @Type(() => MeasurementDto) length?: MeasurementDto;
  /** How wide. */
  @IsOptional() @ValidateNested() @Type(() => MeasurementDto) width?: MeasurementDto;
  /** How thick. */
  @IsOptional() @ValidateNested() @Type(() => MeasurementDto) thickness?: MeasurementDto;
  /** Where it sits in the list. */
  @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
  /** Whether it is still offered while punching. */
  @IsOptional() @IsBoolean() isActive?: boolean;
}


/**
 * A GST rate the tenant can apply.
 *
 * Slabs are per tenant because rates differ by what a shop sells and change
 * with the law; hard-coding 5/12/18/28 would date the product.
 */
export class GstSlabDto {
  /** What it is called on screen — "18%", "Plywood 18". */
  @IsString() @MinLength(1) name: string;
  /** The rate itself, as a percentage. */
  @Type(() => Number) @IsNumber() @Min(0) ratePct: number;
  /**
   * Whether this is the rate used when a line does not name one. Exactly one
   * slab is the default, so a line that says nothing still gets taxed rather
   * than silently getting nothing.
   */
  @IsOptional() @IsBoolean() isDefault?: boolean;
  /** Where it sits in the list. */
  @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
}

export class UpdateGstSlabDto {
  /** What it is called on screen. */
  @IsOptional() @IsString() name?: string;
  /**
   * The rate. Changing it applies to what is priced from now on; invoices
   * already raised keep the rate they were raised at, because that is what was
   * charged and what was filed.
   */
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) ratePct?: number;
  /** Whether this is the rate used when a line does not name one. */
  @IsOptional() @IsBoolean() isDefault?: boolean;
  /** Whether it is still offered when pricing. */
  @IsOptional() @IsBoolean() isActive?: boolean;
  /** Where it sits in the list. */
  @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
}
