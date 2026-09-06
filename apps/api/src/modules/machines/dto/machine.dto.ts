import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { MachineStatus, MachineType } from '@prisma/client';

export class CreateMachineDto {
  @IsString() code: string;
  @IsString() name: string;
  @IsOptional() @IsEnum(MachineType) type?: MachineType;
  @IsOptional() @IsString() make?: string;
  @IsOptional() @IsString() model?: string;
  @IsOptional() @IsString() controller?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) bedLengthMm?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) bedWidthMm?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) maxZMm?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) spindlePowerKw?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) hourlyRate?: number;
}

export class UpdateMachineStatusDto {
  @IsEnum(MachineStatus) status: MachineStatus;
  @IsOptional() @IsString() downtimeReasonId?: string;
  @IsOptional() @IsString() note?: string;
}
