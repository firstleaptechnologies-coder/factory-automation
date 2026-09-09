import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { ReportFormat, ReportStatus } from '@prisma/client';

/**
 * What may be asked for.
 *
 * The kind is validated as a string here and against the catalogue in the
 * service, so the answer names the report the caller asked for rather than
 * listing twelve enum members at them.
 */
export class RequestReportDto {
  @IsString()
  kind!: string;

  @IsOptional()
  @IsEnum(ReportFormat)
  format?: ReportFormat;

  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'from must be a date like 2026-04-01' })
  from?: string;

  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'to must be a date like 2026-06-30' })
  to?: string;

  @IsOptional()
  @IsString()
  clientId?: string;
}

export class ReportQueryDto {
  @IsOptional()
  @IsString()
  kind?: string;

  @IsOptional()
  @IsEnum(ReportStatus)
  status?: ReportStatus;

  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  @Max(200)
  take?: number;
}
