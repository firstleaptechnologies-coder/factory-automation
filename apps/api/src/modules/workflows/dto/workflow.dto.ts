import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { StatusCategory, UserRole } from '@prisma/client';

export class CreateWorkflowDto {
  @IsString() @MinLength(1) code: string;
  @IsString() @MinLength(1) name: string;
  @IsOptional() @IsString() description?: string;
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
