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
  /**
   * Which report — sales for a period, outstanding by client, stock movement.
   * Named from the shop's catalogue of reports rather than chosen from a fixed
   * list, so a report added later needs no change here.
   */
  @IsString()
  kind!: string;

  /**
   * What to produce it as — a spreadsheet for an accountant, a PDF for a
   * meeting. The figures are the same; what differs is who is going to open
   * it.
   */
  @IsOptional()
  @IsEnum(ReportFormat)
  format?: ReportFormat;

  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'from must be a date like 2026-04-01' })
  from?: string;

  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'to must be a date like 2026-06-30' })
  to?: string;

  /** Narrow it to one client, where the report is about a single account. */
  @IsOptional()
  @IsString()
  clientId?: string;
}

/** What has been asked for, and what is ready. */
export class ReportQueryDto {
  /** Only one kind of report. */
  @IsOptional()
  @IsString()
  kind?: string;

  /**
   * Queued, building, ready, or failed. A large export is built in the
   * background rather than holding a screen open, so "is it ready yet" is a
   * question worth being able to ask.
   */
  @IsOptional()
  @IsEnum(ReportStatus)
  status?: ReportStatus;

  /** How many to return. The most recent first, since that is what is wanted. */
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  @Max(200)
  take?: number;
}
