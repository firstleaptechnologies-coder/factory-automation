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

export class CreateLeadDto {
  @IsString() @MinLength(2) title: string;

  /** Either an existing client, or loose contact details for someone who rang. */
  @IsOptional() @IsString() clientId?: string;
  @IsOptional() @IsString() contactName?: string;
  @IsOptional() @IsString() contactPhone?: string;
  @IsOptional() @IsString() contactEmail?: string;
  @IsOptional() @IsString() company?: string;
  @IsOptional() @IsString() location?: string;

  @IsOptional() @IsString() sourceId?: string;
  @IsOptional() @IsString() workflowId?: string;
  @IsOptional() @IsString() ownerId?: string;
  @IsOptional() @IsEnum(Priority) priority?: Priority;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) estimatedValue?: number;
  @IsOptional() @IsDateString() expectedDate?: string;
  @IsOptional() @IsString() notes?: string;

  /** Values for the admin-defined fields, keyed by their `key`. */
  @IsOptional() @IsObject() customFields?: Record<string, unknown>;
}

export class UpdateLeadDto {
  @IsOptional() @IsString() @MinLength(2) title?: string;
  @IsOptional() @IsString() clientId?: string;
  @IsOptional() @IsString() contactName?: string;
  @IsOptional() @IsString() contactPhone?: string;
  @IsOptional() @IsString() contactEmail?: string;
  @IsOptional() @IsString() company?: string;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsString() sourceId?: string;
  @IsOptional() @IsString() ownerId?: string;
  @IsOptional() @IsEnum(Priority) priority?: Priority;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) estimatedValue?: number;
  @IsOptional() @IsDateString() expectedDate?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsObject() customFields?: Record<string, unknown>;
}

export class ChangeLeadStatusDto {
  @IsString() toStatusId: string;
  @IsOptional() @IsString() note?: string;
}

/**
 * Converting a lead into work.
 *
 * The items are punched exactly as they would be on the order screen — a lead
 * carries an enquiry, not sizes, so the sizes are supplied at conversion.
 */
export class ConvertLeadDto {
  @IsString() location: string;
  @IsOptional() @IsString() workflowId?: string;
  @IsOptional() @IsEnum(Priority) priority?: Priority;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsString() notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PunchItemDto)
  items: PunchItemDto[];

  /** Status to leave the lead in. Defaults to a terminal status if there is one. */
  @IsOptional() @IsString() convertedStatusId?: string;
}

export class LeadQueryDto {
  @IsOptional() @IsString() statusId?: string;
  @IsOptional() @IsString() ownerId?: string;
  @IsOptional() @IsString() sourceId?: string;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsBoolean() @Type(() => Boolean) converted?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) limit = 50;

  get skip(): number {
    return (this.page - 1) * this.limit;
  }
}

// -- admin-defined fields ---------------------------------------------------

export class CustomFieldDto {
  @IsEnum(CustomFieldEntity) entity: CustomFieldEntity;
  @IsString() @MinLength(1) key: string;
  @IsString() @MinLength(1) label: string;
  @IsOptional() @IsEnum(CustomFieldType) type?: CustomFieldType;
  @IsOptional() @IsArray() @IsString({ each: true }) options?: string[];
  @IsOptional() @IsString() helpText?: string;
  @IsOptional() @IsBoolean() required?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
}

export class UpdateCustomFieldDto {
  @IsOptional() @IsString() label?: string;
  @IsOptional() @IsEnum(CustomFieldType) type?: CustomFieldType;
  @IsOptional() @IsArray() @IsString({ each: true }) options?: string[];
  @IsOptional() @IsString() helpText?: string;
  @IsOptional() @IsBoolean() required?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class LeadSourceDto {
  @IsString() @MinLength(1) code: string;
  @IsString() @MinLength(1) name: string;
  @IsOptional() @IsString() color?: string;
  @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
}
