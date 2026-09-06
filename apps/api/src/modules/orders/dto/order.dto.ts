import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { AttachmentKind, Priority } from '@prisma/client';
import { LENGTH_UNITS, LengthUnit } from '@decor/shared';
import { MeasurementDto } from '../../config/dto/config.dto';
import { CreateClientDto } from '../../clients/dto/client.dto';

export class PunchItemDto {
  /** Pick a configured size, or give explicit dimensions, or both (explicit wins). */
  @IsOptional() @IsString() sizePresetId?: string;
  @IsOptional() @ValidateNested() @Type(() => MeasurementDto) length?: MeasurementDto;
  @IsOptional() @ValidateNested() @Type(() => MeasurementDto) width?: MeasurementDto;
  @IsOptional() @ValidateNested() @Type(() => MeasurementDto) thickness?: MeasurementDto;

  @IsString() materialId: string;
  /** A configured thickness option for that material. */
  @IsOptional() @IsString() materialThicknessId?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) quantity?: number;
  @IsOptional() @IsString() notes?: string;
}

/**
 * Punching an order. The client is either an existing id or a new one created
 * inline — the person taking the order should never have to leave the screen to
 * add a client first.
 */
export class PunchOrderDto {
  @IsOptional() @IsString() clientId?: string;
  @IsOptional() @ValidateNested() @Type(() => CreateClientDto) newClient?: CreateClientDto;

  @IsString() @MinLength(1) location: string;

  @IsOptional() @IsString() workflowId?: string;
  @IsOptional() @IsEnum(Priority) priority?: Priority;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsString() notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PunchItemDto)
  items: PunchItemDto[];
}

export class UpdateOrderDto {
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsEnum(Priority) priority?: Priority;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsString() notes?: string;
}

export class ChangeStatusDto {
  @IsString() toStatusId: string;
  @IsOptional() @IsString() note?: string;
}

export class AttachmentMetaDto {
  @IsEnum(AttachmentKind) kind: AttachmentKind;
  /** Required for reference images — a picture with no context is not useful. */
  @IsOptional() @IsString() description?: string;
}

export class OrderQueryDto {
  @IsOptional() @IsString() clientId?: string;
  @IsOptional() @IsString() statusId?: string;
  @IsOptional() @IsString() materialId?: string;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;

  /** Unit the caller wants dimensions rendered in. Storage is always mm. */
  @IsOptional() @IsIn(LENGTH_UNITS as unknown as string[]) unit?: LengthUnit;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) limit = 25;

  get skip(): number {
    return (this.page - 1) * this.limit;
  }
}
