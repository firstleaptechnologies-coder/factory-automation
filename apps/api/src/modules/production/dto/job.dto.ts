import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { JobStatus, OperationType, Priority, QcResult } from '@prisma/client';

export class CreateJobDto {
  @IsOptional() @IsString() orderId?: string;
  @IsOptional() @IsString() orderItemId?: string;
  @IsOptional() @IsString() nestPlanId?: string;
  @IsOptional() @IsString() machineId?: string;
  @IsString() materialId: string;

  @Type(() => Number) @IsNumber() @Min(0.001) quantity: number;
  @IsOptional() @IsEnum(Priority) priority?: Priority;
  @IsOptional() @IsDateString() plannedStart?: string;
  @IsOptional() @IsDateString() plannedEnd?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) estimatedMinutes?: number;
  @IsOptional() @IsString() notes?: string;

  /** Routing steps in order, e.g. [CUT, SANDING, QC, PACKING]. */
  @IsOptional() @IsArray() @IsEnum(OperationType, { each: true })
  operations?: OperationType[];
}

export class AssignJobDto {
  @IsString() machineId: string;
  @IsOptional() @IsString() operatorId?: string;
  @IsOptional() @Type(() => Number) @IsInt() sequence?: number;
}

export class ResequenceDto {
  @IsString() machineId: string;
  /** Job ids in the order they should run. */
  @IsArray() @IsString({ each: true }) jobIds: string[];
}

export class JobProgressDto {
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) completedQty?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) rejectedQty?: number;
  @IsOptional() @IsString() note?: string;
}

export class PauseJobDto {
  @IsOptional() @IsString() downtimeReasonId?: string;
  @IsOptional() @IsString() note?: string;
}

export class QualityCheckDto {
  @IsEnum(QcResult) result: QcResult;
  @Type(() => Number) @IsNumber() @Min(0) qtyChecked: number;
  @Type(() => Number) @IsNumber() @Min(0) qtyPassed: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) qtyRejected?: number;
  @IsOptional() @IsString() reasonId?: string;
  @IsOptional() @IsString() remarks?: string;
}

export class JobQueryDto {
  @IsOptional() @IsEnum(JobStatus) status?: JobStatus;
  @IsOptional() @IsString() machineId?: string;
  @IsOptional() @IsString() orderId?: string;
  @IsOptional() @IsString() operatorId?: string;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) limit = 25;

  get skip(): number {
    return (this.page - 1) * this.limit;
  }
}
