import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Matches } from 'class-validator';
import { EstimateStatus, TaxTreatment } from '@prisma/client';

/**
 * A tenant's colour reaches a stylesheet and an inline style, so it is checked
 * here rather than trusted. Anything not a plain hex triple is refused.
 */
const HEX_COLOR = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class EstimateItemDto {
  @IsString() @MinLength(1) name: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() hsnSac?: string;

  @Type(() => Number) @IsNumber() @Min(0) quantity: number;
  @IsOptional() @IsString() unit?: string;
  @Type(() => Number) @IsNumber() @Min(0) ratePerUnit: number;

  /** A percentage off this line. The money it comes to is computed, not sent. */
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) discountPct?: number;
  @IsOptional() @IsString() gstSlabId?: string;
}

export class CreateEstimateDto {
  @IsOptional() @IsString() clientId?: string;
  /** For a quote given before the client is on file. */
  @IsOptional() @IsString() clientName?: string;
  /**
   * The enquiry this is being quoted for, where there is one.
   *
   * Optional: most quotes are for a client who rang up and asked for a price,
   * and demanding an enquiry first would put a step in front of the commonest
   * job in the shop.
   */
  @IsOptional() @IsString() leadId?: string;

  @IsOptional() @IsString() billingAddress?: string;
  @IsOptional() @IsString() shippingAddress?: string;
  @IsOptional() @IsDateString() validTill?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() termsOverride?: string;
  @IsOptional() @IsEnum(TaxTreatment) taxTreatment?: TaxTreatment;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EstimateItemDto)
  items: EstimateItemDto[];
}

export class UpdateEstimateDto extends CreateEstimateDto {
  @IsOptional() @IsEnum(EstimateStatus) status?: EstimateStatus;
}

export class EstimateStatusDto {
  @IsEnum(EstimateStatus) status: EstimateStatus;
}

export class EstimateQueryDto extends PaginationDto {
  @IsOptional() @IsEnum(EstimateStatus) status?: EstimateStatus;
  @IsOptional() @IsString() clientId?: string;
}

export class ConvertEstimateDto {
  @IsString() @MinLength(1) location: string;
  @IsOptional() @IsString() workflowId?: string;
  @IsOptional() @IsString() startStatusId?: string;
  @IsOptional() @IsString() notes?: string;
}

export class FirmProfileDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() gstin?: string;
  @IsOptional() @IsString() stateCode?: string;
  @IsOptional() @IsString() stateName?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() website?: string;

  @IsOptional() @IsString() bankName?: string;
  @IsOptional() @IsString() bankAccountName?: string;
  @IsOptional() @IsString() bankAccountNumber?: string;
  @IsOptional() @IsString() bankIfsc?: string;
  @IsOptional() @IsString() bankBranch?: string;

  @IsOptional() @IsString() termsAndConditions?: string;
  @IsOptional() @IsString() signatoryName?: string;
  @IsOptional() @IsString() accentColor?: string;
  /** The app and web accent. Validated as a hex colour before it is stored. */
  @IsOptional() @IsString() @Matches(HEX_COLOR) themeAccent?: string;
}
