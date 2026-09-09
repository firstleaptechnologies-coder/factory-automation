import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { StatusCategory, UserRole } from '@prisma/client';
import { HOME_CARD_LIMIT } from '@fas/shared';

export class CreateWorkflowDto {
  @IsString() @MinLength(1) code: string;
  @IsString() @MinLength(1) name: string;
  @IsOptional() @IsString() description?: string;
}

/**
 * What can be changed about a flow itself, rather than its stages.
 */
export class UpdateWorkflowDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsString() description?: string;
  /**
   * Days an enquiry may sit untouched before it goes quiet. Zero or null turns
   * it off — nothing is ever archived by age.
   */
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(3650) leadExpiryDays?: number | null;
  /**
   * The stage an enquiry moves to when a quote is sent. Null means sending one
   * records itself against the enquiry but moves nothing.
   */
  @IsOptional() @IsString() quoteStatusId?: string | null;
  /** Where an enquiry goes when the client turns the quote down. */
  @IsOptional() @IsString() lostStatusId?: string | null;
}

export class StatusDto {
  @IsString() @MinLength(1) code: string;
  @IsString() @MinLength(1) name: string;
  @IsOptional() @IsString() color?: string;
  @IsOptional() @IsEnum(StatusCategory) category?: StatusCategory;
  /** Parent status, for grouping. Null clears the parent. */
  @IsOptional() @IsString() parentId?: string | null;
  @IsOptional() @IsBoolean() isInitial?: boolean;
  @IsOptional() @IsBoolean() isTerminal?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
  @IsOptional() @Type(() => Number) @IsNumber() canvasX?: number;
  @IsOptional() @Type(() => Number) @IsNumber() canvasY?: number;
}

export class UpdateStatusDto {
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() color?: string;
  @IsOptional() @IsEnum(StatusCategory) category?: StatusCategory;
  @IsOptional() @IsString() parentId?: string | null;
  @IsOptional() @IsBoolean() isInitial?: boolean;
  @IsOptional() @IsBoolean() isTerminal?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
  @IsOptional() @Type(() => Number) @IsNumber() canvasX?: number;
  @IsOptional() @Type(() => Number) @IsNumber() canvasY?: number;
}

export class TransitionDto {
  @IsString() fromStatusId: string;
  @IsString() toStatusId: string;
  @IsOptional() @IsString() label?: string;
  @IsOptional() @IsBoolean() requiresNote?: boolean;
  @IsOptional() @IsArray() @IsEnum(UserRole, { each: true }) allowedRoles?: UserRole[];
}

export class NodePositionDto {
  @IsString() id: string;
  @Type(() => Number) @IsNumber() canvasX: number;
  @Type(() => Number) @IsNumber() canvasY: number;
}

/**
 * What the drag-and-drop canvas sends on save: the whole graph at once.
 *
 * Saving the diagram as a unit rather than one edge at a time keeps the stored
 * flow consistent with what the admin sees — a half-applied set of edits would
 * leave orders in statuses with no way out.
 */
export class SaveGraphDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NodePositionDto)
  positions: NodePositionDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TransitionDto)
  transitions: TransitionDto[];
}

/**
 * Which stages the home screen counts, in the order they appear there.
 *
 * Five, because the card is read at a glance from across a workshop — a longer
 * list stops being a summary. Which five is the shop's own decision, so it is
 * stored rather than derived from the flow.
 */
export class HomeCardDto {
  @IsArray()
  @ArrayMaxSize(HOME_CARD_LIMIT)
  @IsString({ each: true })
  statusIds: string[];
}
