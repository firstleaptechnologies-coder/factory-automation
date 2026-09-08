import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { DisbursementStatus, PaymentMode } from '@prisma/client';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class CreateDisbursementDto {
  @IsString() @MinLength(1) payeeName: string;
  @Type(() => Number) @IsNumber() @Min(0.01) amount: number;

  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @IsString() payeeContact?: string;
  @IsOptional() @IsString() note?: string;

  /** Recording one already settled, rather than one still owed. */
  @IsOptional() @IsEnum(DisbursementStatus) status?: DisbursementStatus;
  @IsOptional() @IsEnum(PaymentMode) paidMode?: PaymentMode;
  @IsOptional() @IsDateString() paidAt?: string;
  @IsOptional() @IsString() reference?: string;
}

export class SettleDisbursementDto {
  @IsEnum(PaymentMode) paidMode: PaymentMode;
  @IsOptional() @IsDateString() paidAt?: string;
  @IsOptional() @IsString() reference?: string;
  @IsOptional() @IsString() note?: string;
}

export class UpdateDisbursementDto {
  @IsOptional() @IsString() payeeName?: string;
  @IsOptional() @IsString() payeeContact?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0.01) amount?: number;
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @IsString() note?: string;
  @IsOptional() @IsEnum(DisbursementStatus) status?: DisbursementStatus;
}

export class DisbursementQueryDto extends PaginationDto {
  @IsOptional() @IsEnum(DisbursementStatus) status?: DisbursementStatus;
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}

export class CategoryDto {
  @IsString() @MinLength(1) code: string;
  @IsString() @MinLength(1) name: string;
  @IsOptional() @Type(() => Number) @IsNumber() sortOrder?: number;
}

export class LabelDto {
  /** What this tenant calls these charges — "ISC", "Site charges", anything. */
  @IsString() @MinLength(1) label: string;
}
