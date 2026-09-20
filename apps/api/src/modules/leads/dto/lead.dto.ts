import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { CustomFieldEntity, CustomFieldType, Priority } from '@prisma/client';
import { PunchItemDto } from '../../orders/dto/order.dto';

/**
 * An enquiry, before there is any work.
 *
 * Somebody rings, walks in, or sends a photograph — nothing is agreed and it
 * is still worth writing down. Deliberately cheap to record: a title is all
 * that is required, because an enquiry that takes five minutes to log is an
 * enquiry nobody logs.
 */
export class CreateLeadDto {
  /**
   * What the enquiry is, in a line — "wardrobe for Bandra flat". What somebody
   * reads off the board without opening it.
   */
  @IsString() @MinLength(2) title: string;

  /** Either an existing client, or loose contact details for someone who rang. */
  @IsOptional() @IsString() clientId?: string;
  /**
   * Who rang, when they are not on file. Kept loose on purpose: an enquiry is
   * not yet worth creating a client for, and most never become one.
   */
  @IsOptional() @IsString() contactName?: string;
  /** Their number — the one thing that makes an enquiry followable-up. */
  @IsOptional() @IsString() contactPhone?: string;
  /** Their email, where the enquiry arrived by email. */
  @IsOptional() @IsString() contactEmail?: string;
  /** The firm they are from, when they mentioned one. */
  @IsOptional() @IsString() company?: string;
  /** Where the work would be, if it happens. */
  @IsOptional() @IsString() location?: string;

  /**
   * Where the enquiry came from — a walk-in, a referral, Instagram. Worth
   * telling apart when deciding where the next rupee of advertising goes, and
   * the reason this is a list the shop keeps rather than free text.
   */
  @IsOptional() @IsString() sourceId?: string;
  /** Which pipeline it moves through, when the shop keeps more than one. */
  @IsOptional() @IsString() workflowId?: string;
  /** Who is chasing it. An enquiry nobody owns is an enquiry nobody rings back. */
  @IsOptional() @IsString() ownerId?: string;
  /** How urgent it is, which orders the board. */
  @IsOptional() @IsEnum(Priority) priority?: Priority;
  /**
   * What it might be worth, as a guess. A guess is the point: it is what makes
   * a pipeline addable-up, and nobody is held to it.
   */
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) estimatedValue?: number;
  /** When it might be decided — what a follow-up is planned around. */
  @IsOptional() @IsDateString() expectedDate?: string;
  /** Whatever was said on the call that does not fit anywhere else. */
  @IsOptional() @IsString() notes?: string;

  /** Values for the admin-defined fields, keyed by their `key`. */
  @IsOptional() @IsObject() customFields?: Record<string, unknown>;
}

/** Changing an enquiry. Every field means what it does on CreateLeadDto. */
export class UpdateLeadDto {
  /** What the enquiry is, in a line. */
  @IsOptional() @IsString() @MinLength(2) title?: string;
  /** Attaching it to a client, usually once they are on file. */
  @IsOptional() @IsString() clientId?: string;
  /** Who rang. */
  @IsOptional() @IsString() contactName?: string;
  /** Their number. */
  @IsOptional() @IsString() contactPhone?: string;
  /** Their email. */
  @IsOptional() @IsString() contactEmail?: string;
  /** The firm they are from. */
  @IsOptional() @IsString() company?: string;
  /** Where the work would be. */
  @IsOptional() @IsString() location?: string;
  /** Where the enquiry came from. */
  @IsOptional() @IsString() sourceId?: string;
  /** Who is chasing it. */
  @IsOptional() @IsString() ownerId?: string;
  /** How urgent it is. */
  @IsOptional() @IsEnum(Priority) priority?: Priority;
  /** What it might be worth. */
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) estimatedValue?: number;
  /** When it might be decided. */
  @IsOptional() @IsDateString() expectedDate?: string;
  /** Whatever was said that does not fit anywhere else. */
  @IsOptional() @IsString() notes?: string;
  /** Values for the shop's own extra questions, keyed by their `key`. */
  @IsOptional() @IsObject() customFields?: Record<string, unknown>;
}

export class ChangeLeadStatusDto {
  /** The stage to move it to, from the shop's own pipeline. */
  @IsString() toStatusId: string;
  /**
   * Why it moved — what they said, what is being waited on. A pipeline is only
   * as useful as the reasons kept against it.
   */
  @IsOptional() @IsString() note?: string;
  /** "Yes, I know this goes back." See ChangeStatusDto on orders. */
  @IsOptional() @IsBoolean() reverse?: boolean;
}

/**
 * Converting a lead into work.
 *
 * The items are punched exactly as they would be on the order screen — a lead
 * carries an enquiry, not sizes, so the sizes are supplied at conversion.
 */
export class ConvertLeadDto {
  /** Where the work is going — required on an order as it is on any other. */
  @IsString() location: string;
  /** Which set of stages the new order moves through. */
  @IsOptional() @IsString() workflowId?: string;
  /** How urgent the order is, which need not be how urgent the enquiry was. */
  @IsOptional() @IsEnum(Priority) priority?: Priority;
  /** When it is promised. */
  @IsOptional() @IsDateString() dueDate?: string;
  /** Anything about the order that the enquiry's notes do not cover. */
  @IsOptional() @IsString() notes?: string;

  /**
   * The pieces being made. Supplied here because an enquiry carries an
   * interest and not measurements — the sizes are taken when the job is real.
   */
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PunchItemDto)
  items: PunchItemDto[];

  /** Status to leave the lead in. Defaults to a terminal status if there is one. */
  @IsOptional() @IsString() convertedStatusId?: string;
}

export class LeadQueryDto {
  /** Only enquiries sitting at one stage. */
  @IsOptional() @IsString() statusId?: string;
  /** Only what one person is chasing. */
  @IsOptional() @IsString() ownerId?: string;
  /** Only what came from one source — everything Instagram brought in. */
  @IsOptional() @IsString() sourceId?: string;
  /** Matches the title, the contact's name, their number or the company. */
  @IsOptional() @IsString() search?: string;
  /**
   * Only the ones that became orders, or only the ones that did not. What a
   * source is judged on: how many enquiries it brought against how many turned
   * into work.
   */
  @IsOptional() @IsBoolean() @Type(() => Boolean) converted?: boolean;
  /** The enquiries that have gone quiet, rather than the ones that have not. */
  @IsOptional() @IsBoolean() @Type(() => Boolean) archived?: boolean;
  /** Which page of the list. Counting starts at one. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  /** How many enquiries on a page. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) limit = 50;

  get skip(): number {
    return (this.page - 1) * this.limit;
  }
}

// -- admin-defined fields ---------------------------------------------------

/**
 * An extra question the shop wants asked, defined once and then present on
 * every enquiry.
 *
 * What an architectural-decor shop needs to know is not what a joinery needs
 * to know, so the questions are the shop's rather than ours.
 */
export class CustomFieldDto {
  /** What it is asked about. Enquiries today; the mechanism is not specific to them. */
  @IsEnum(CustomFieldEntity) entity: CustomFieldEntity;
  /**
   * The short name the answer is stored under. Fixed once created, because
   * every enquiry already answered refers to it — the label can be corrected,
   * this cannot.
   */
  @IsString() @MinLength(1) key: string;
  /** The question as it is asked on screen. */
  @IsString() @MinLength(1) label: string;
  /** What kind of answer it takes — text, a number, a date, a choice. */
  @IsOptional() @IsEnum(CustomFieldType) type?: CustomFieldType;
  /** The choices, for a field that offers a list. */
  @IsOptional() @IsArray() @IsString({ each: true }) options?: string[];
  /** A line under the question, for when the question alone is not clear. */
  @IsOptional() @IsString() helpText?: string;
  /**
   * Whether an enquiry can be saved without it. Worth using sparingly: a
   * required field on an enquiry is a reason not to record the enquiry.
   */
  @IsOptional() @IsBoolean() required?: boolean;
  /** Where it appears on the form. */
  @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
}

export class UpdateCustomFieldDto {
  /** The question as it is asked. Correcting it leaves past answers alone. */
  @IsOptional() @IsString() label?: string;
  /** What kind of answer it takes. */
  @IsOptional() @IsEnum(CustomFieldType) type?: CustomFieldType;
  /** The choices, for a field that offers a list. */
  @IsOptional() @IsArray() @IsString({ each: true }) options?: string[];
  /** A line under the question. */
  @IsOptional() @IsString() helpText?: string;
  /** Whether an enquiry can be saved without it. */
  @IsOptional() @IsBoolean() required?: boolean;
  /** Where it appears on the form. */
  @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
  /**
   * Whether it is still asked. Switching it off takes the question off the
   * form and keeps every answer already given — those are part of the
   * enquiries they were recorded against.
   */
  @IsOptional() @IsBoolean() isActive?: boolean;
}

/** Where enquiries come from — the shop's own list. */
export class LeadSourceDto {
  /** A short code for it, fixed once created because enquiries refer to it. */
  @IsString() @MinLength(1) code: string;
  /** What it is called on screen — "Walk-in", "Instagram", "Referral". */
  @IsString() @MinLength(1) name: string;
  /** A colour, so the board can be read at a glance rather than word by word. */
  @IsOptional() @IsString() color?: string;
  /** Where it sits in the list. */
  @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
}
