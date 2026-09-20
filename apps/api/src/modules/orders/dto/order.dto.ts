import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  AttachmentKind,
  PricingMode,
  Priority,
  RateUnit,
  TaxTreatment,
} from '@prisma/client';
import { LENGTH_UNITS, LengthUnit } from '@fas/shared';
import { MeasurementDto } from '../../config/dto/config.dto';
import { CreateClientDto } from '../../clients/dto/client.dto';

export class PunchItemDto {
  /** Pick a configured size, or give explicit dimensions, or both (explicit wins). */
  @IsOptional() @IsString() sizePresetId?: string;
  /**
   * How long the piece is, in whatever unit it was measured in — the tape on
   * site reads in feet and inches, the drawing is in millimetres, and both are
   * accepted as given. Everything is stored in millimetres and shown back in
   * the unit the reader asked for, so nobody converts by hand and nobody
   * converts wrongly.
   */
  @IsOptional() @ValidateNested() @Type(() => MeasurementDto) length?: MeasurementDto;
  /** How wide, in whatever unit it was measured in. */
  @IsOptional() @ValidateNested() @Type(() => MeasurementDto) width?: MeasurementDto;
  /**
   * How thick. Given here when it is a one-off; usually picked from the
   * thicknesses configured against the material instead.
   */
  @IsOptional() @ValidateNested() @Type(() => MeasurementDto) thickness?: MeasurementDto;

  /**
   * What it is being made out of, from the materials the shop has configured.
   * The one thing on a line that is always required: a piece with no material
   * cannot be cut, priced or bought for.
   */
  @IsString() materialId: string;
  /** A configured thickness option for that material. */
  @IsOptional() @IsString() materialThicknessId?: string;

  /** How many of this exact piece. One if nobody says otherwise. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) quantity?: number;
  /**
   * Anything about this line the floor needs — a finish, an edge, which way
   * the grain runs. It is printed on the job card, so it is read by whoever
   * makes the piece rather than by whoever sold it.
   */
  @IsOptional() @IsString() notes?: string;

  /**
   * Priced the way it was quoted. `rateUnit` decides what `rate` means — a
   * price per square foot, per piece, per running foot, or the line total
   * itself when it was quoted as one figure.
   */
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) rate?: number;
  /**
   * What the rate is per: a square foot, a running foot, a piece, or the line
   * total as one figure. The same number means four different prices
   * depending on this, so it travels with the rate rather than being assumed.
   */
  @IsOptional() @IsEnum(RateUnit) rateUnit?: RateUnit;
  /** GST slab for this line. Falls back to the tenant's default. */
  @IsOptional() @IsString() gstSlabId?: string;
}

/**
 * Punching an order. The client is either an existing id or a new one created
 * inline — the person taking the order should never have to leave the screen to
 * add a client first.
 */
export class PunchOrderDto {
  /** A client already on file. Send this or `newClient`, never both. */
  @IsOptional() @IsString() clientId?: string;
  /**
   * A client who is not on file yet, created as the order is punched. The name
   * and a number are enough; the GST details can be filled in on the day
   * somebody asks for a bill. If the number given is already on file the order
   * attaches to that client rather than making a second one.
   */
  @IsOptional() @ValidateNested() @Type(() => CreateClientDto) newClient?: CreateClientDto;

  /**
   * Where the work is going — the site, as the shop says it: "Bandra flat",
   * "Andheri showroom". Required, because a finished piece with no destination
   * is a piece nobody can deliver. It is remembered against the client, so the
   * next order for them offers the sites they have used before.
   */
  @IsString() @MinLength(1) location: string;

  /**
   * Which set of stages this order moves through. A shop can keep more than
   * one — a flow for furniture and a flow for a glass job do not have the same
   * steps. Left out, the shop's default flow is used.
   */
  @IsOptional() @IsString() workflowId?: string;
  /**
   * How urgent it is. It orders the board and nothing else — it does not
   * change a date or jump a queue by itself, because who works on what next is
   * a decision for whoever runs the floor.
   */
  @IsOptional() @IsEnum(Priority) priority?: Priority;
  /** When it was promised. What "late" is measured against. */
  @IsOptional() @IsDateString() dueDate?: string;
  /**
   * Anything about the order as a whole, as opposed to one line of it —
   * access to the site, who to call on arrival, what the client is fussy
   * about.
   */
  @IsOptional() @IsString() notes?: string;

  /** Which stage to start at. Defaults to the workflow's default entry point. */
  @IsOptional() @IsString() startStatusId?: string;

  /** ITEMISED adds up the lines; LUMP_SUM uses `total` as quoted. */
  @IsOptional() @IsEnum(PricingMode) pricingMode?: PricingMode;
  /**
   * Money taken off the order — an amount in rupees, not a percentage. It is
   * subtracted after the lines are added up, so the discount is visible on the
   * invoice as its own line rather than hidden inside the rates. What was
   * given away is a thing the shop should be able to see.
   */
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) discount?: number;
  /** Required for LUMP_SUM — the single figure that was quoted. */
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) total?: number;
  /** GST slab for a LUMP_SUM order, applied to the whole quoted figure. */
  @IsOptional() @IsString() gstSlabId?: string;
  /**
   * How the quoted figure relates to the GST on it. EXCLUSIVE adds the tax on
   * top; INCLUSIVE and ABSORBED take it out of what was quoted.
   */
  @IsOptional() @IsEnum(TaxTreatment) taxTreatment?: TaxTreatment;

  /**
   * The pieces being made. This is the order: everything else on it says who,
   * where and on what terms, and these say what.
   *
   * An order can be punched with lines that have no price on them at all —
   * that is the normal case on a phone call. Pricing them is a separate job,
   * done when the number is known.
   */
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PunchItemDto)
  items: PunchItemDto[];
}

/**
 * Changing an order that already exists. Every field is optional: an edit says
 * only what changed, and anything left out is left alone.
 */
export class UpdateOrderDto {
  /** Where the work is going, if it has moved. */
  @IsOptional() @IsString() location?: string;
  /** ITEMISED adds up the lines; LUMP_SUM uses `total` as quoted. */
  @IsOptional() @IsEnum(PricingMode) pricingMode?: PricingMode;
  /**
   * Whether the tax goes on top of the figure quoted, comes out of it, or is
   * absorbed by the shop.
   */
  @IsOptional() @IsEnum(TaxTreatment) taxTreatment?: TaxTreatment;
  /** The GST slab for a LUMP_SUM order, applied to the whole quoted figure. */
  @IsOptional() @IsString() gstSlabId?: string;
  /** Money taken off the order, in rupees rather than as a percentage. */
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) discount?: number;
  /** For a LUMP_SUM order, the single figure the client was given. */
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) total?: number;
  /** How urgent it is, which orders the board. */
  @IsOptional() @IsEnum(Priority) priority?: Priority;
  /** When it was promised. */
  @IsOptional() @IsDateString() dueDate?: string;
  /** Anything about the order as a whole. */
  @IsOptional() @IsString() notes?: string;
}

/**
 * Re-stating the money terms of an order that already exists.
 *
 * Separate from UpdateOrderDto because it re-prices every line and can change
 * whether the order is settled — that is not something to slip into a general
 * edit of the notes field.
 */
export class RepriceOrderDto {
  /**
   * How this order is priced. ITEMISED adds up the lines; LUMP_SUM keeps the
   * one figure that was quoted and leaves the lines unpriced, because
   * back-calculating a rate from a lump sum invents a number nobody agreed to.
   */
  @IsOptional() @IsEnum(PricingMode) pricingMode?: PricingMode;
  /**
   * How the quoted figure relates to the GST on it. EXCLUSIVE adds the tax on
   * top of it; INCLUSIVE takes the tax out of it; ABSORBED means the shop
   * pays the tax out of what it quoted. The figure the client heard does not
   * change — what changes is how much of it is the shop's.
   */
  @IsOptional() @IsEnum(TaxTreatment) taxTreatment?: TaxTreatment;
  /** Only meaningful for a LUMP_SUM order. */
  @IsOptional() @IsString() gstSlabId?: string;
  /** Money taken off the order, in rupees rather than as a percentage. */
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) discount?: number;
  /** For a LUMP_SUM order, the single figure the client was given. */
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) total?: number;
}

export class ChangeStatusDto {
  /**
   * The stage to move it to. It has to be a move the shop's own flow draws —
   * the stages and the steps between them are configured per shop, and an
   * order cannot skip from cutting to delivered because somebody tapped the
   * wrong card.
   */
  @IsString() toStatusId: string;
  /**
   * Why it moved, when that is worth keeping — what was waiting on, what went
   * wrong. It is kept against the order forever, so "why did this sit for
   * three days in March" has an answer.
   */
  @IsOptional() @IsString() note?: string;
  /**
   * "Yes, I know this goes back."
   *
   * A move the flow does not draw is refused unless the caller says this — the
   * machine half of the question the screen asks, so an older client or a
   * stray script can never walk an order backwards without meaning to.
   */
  @IsOptional() @IsBoolean() reverse?: boolean;
}

export class AttachmentMetaDto {
  /**
   * What the picture is. A REFERENCE_IMAGE is what the client wants it to look
   * like; a SIZE_IMAGE is the measured drawing or the tape-on-site photo; a
   * DOCUMENT is everything else. They are told apart because the floor needs
   * the sizes and the salesperson needs the look, and hunting through one pile
   * for the other wastes both of their time.
   */
  @IsEnum(AttachmentKind) kind: AttachmentKind;
  /** Required for reference images — a picture with no context is not useful. */
  @IsOptional() @IsString() description?: string;
}

export class OrderQueryDto {
  /** Only this client's orders. */
  @IsOptional() @IsString() clientId?: string;
  /** Only orders sitting at one stage — everything in QC, everything cut. */
  @IsOptional() @IsString() statusId?: string;
  /**
   * Only orders using one material. What is asked when a sheet has run out and
   * somebody needs to know what is waiting on it.
   */
  @IsOptional() @IsString() materialId?: string;
  /**
   * Matches the order number, the client's name or the site. One box, because
   * whoever is looking knows one of those and not which kind it is.
   */
  @IsOptional() @IsString() search?: string;
  /** Punched on or after this date. */
  @IsOptional() @IsDateString() from?: string;
  /** Punched on or before this date. */
  @IsOptional() @IsDateString() to?: string;

  /** Unit the caller wants dimensions rendered in. Storage is always mm. */
  @IsOptional() @IsIn(LENGTH_UNITS as unknown as string[]) unit?: LengthUnit;

  /** Which page of the list. Counting starts at one. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  /** How many orders on a page. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) limit = 25;

  get skip(): number {
    return (this.page - 1) * this.limit;
  }
}
