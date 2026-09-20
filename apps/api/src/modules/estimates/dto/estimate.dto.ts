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
import { CreateClientDto } from '../../clients/dto/client.dto';

/** One priced line of a quotation. */
export class EstimateItemDto {
  /** What is being quoted for, as the client should read it. */
  @IsString() @MinLength(1) name: string;
  /**
   * The detail under the name — finish, edge, hardware. What stops an argument
   * later about what the price included.
   */
  @IsOptional() @IsString() description?: string;
  /**
   * The HSN or SAC code for this line. Required on a tax invoice, so it is
   * worth putting on the quote it will be raised from.
   */
  @IsOptional() @IsString() hsnSac?: string;

  /** How many. */
  @Type(() => Number) @IsNumber() @Min(0) quantity: number;
  /** What one of them is — a piece, a square foot, a running foot. */
  @IsOptional() @IsString() unit?: string;
  /** The price of one, before tax and before any discount on the line. */
  @Type(() => Number) @IsNumber() @Min(0) ratePerUnit: number;

  /** A percentage off this line. The money it comes to is computed, not sent. */
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) discountPct?: number;
  /** The GST slab for this line. Falls back to the shop's default. */
  @IsOptional() @IsString() gstSlabId?: string;
}

/**
 * A priced quotation, before there is an order.
 *
 * A shop loses work by quoting slowly, so this is built from the materials,
 * sizes and rates the rest of the product already knows, and comes out on the
 * shop's own letterhead. An accepted quote becomes an order without anybody
 * retyping it.
 */
export class CreateEstimateDto {
  /** The client it is for, when they are on file. */
  @IsOptional() @IsString() clientId?: string;
  /**
   * Somebody who is not on file yet, added from the quote screen itself.
   *
   * The same shape the punch screen sends, and resolved by the same rule, so a
   * client added while quoting is the client the order later attaches to
   * rather than a second row with the same phone number.
   */
  @IsOptional() @ValidateNested() @Type(() => CreateClientDto) newClient?: CreateClientDto;
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

  /** Who it is billed to. Defaults to the client's billing address. */
  @IsOptional() @IsString() billingAddress?: string;
  /** Where it would be delivered, when that differs. */
  @IsOptional() @IsString() shippingAddress?: string;
  /**
   * How long the price holds. Worth stating: material prices move, and a quote
   * with no expiry is one a client produces six months later.
   */
  @IsOptional() @IsDateString() validTill?: string;
  /** Anything for the client to read that is not a line of the quote. */
  @IsOptional() @IsString() notes?: string;
  /**
   * Terms for this one quote, replacing the shop's standing terms. Left empty
   * the usual terms print, which is what almost every quote wants.
   */
  @IsOptional() @IsString() termsOverride?: string;
  /**
   * Whether the tax goes on top of the prices quoted or comes out of them.
   * It decides what the client is told the total is, so it belongs on the
   * quote rather than being settled at invoice time.
   */
  @IsOptional() @IsEnum(TaxTreatment) taxTreatment?: TaxTreatment;

  /** What is being quoted for. */
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EstimateItemDto)
  items: EstimateItemDto[];
}

export class UpdateEstimateDto extends CreateEstimateDto {
  /** Where the quote stands — drafted, sent, accepted, declined. */
  @IsOptional() @IsEnum(EstimateStatus) status?: EstimateStatus;
}

export class EstimateStatusDto {
  /**
   * Where the quote stands. Recording a decline is as useful as recording an
   * acceptance: what was quoted and lost is the only way to find out whether
   * the shop is pricing itself out.
   */
  @IsEnum(EstimateStatus) status: EstimateStatus;
}

export class EstimateQueryDto extends PaginationDto {
  /** Only quotes at one stage — everything sent and not yet answered. */
  @IsOptional() @IsEnum(EstimateStatus) status?: EstimateStatus;
  /** Only one client's quotes. */
  @IsOptional() @IsString() clientId?: string;
}

/**
 * Turning an accepted quote into work.
 *
 * The lines and their prices carry across, so the thing that was agreed is the
 * thing that gets made and the thing that gets billed.
 */
export class ConvertEstimateDto {
  /** Where the work is going. */
  @IsString() @MinLength(1) location: string;
  /** Which set of stages the order moves through. */
  @IsOptional() @IsString() workflowId?: string;
  /** Which stage to start at. Defaults to the flow's entry point. */
  @IsOptional() @IsString() startStatusId?: string;
  /** Anything for the floor that the quote's notes do not cover. */
  @IsOptional() @IsString() notes?: string;
}

/**
 * The shop's own details, as they print on its paperwork.
 *
 * Set once and used on every quote, invoice, challan and letter, so the shop's
 * documents look like one firm's rather than like whoever made them that day.
 */
export class FirmProfileDto {
  /** The firm's name, as it should head its paperwork. */
  @IsOptional() @IsString() name?: string;
  /** The shop's own GST number, printed on every invoice it raises. */
  @IsOptional() @IsString() gstin?: string;
  /**
   * The shop's GST state code. Against the client's it decides whether a bill
   * carries CGST and SGST or a single IGST line — this is one half of that.
   */
  @IsOptional() @IsString() stateCode?: string;
  /** The state that code stands for, spelt out. */
  @IsOptional() @IsString() stateName?: string;
  /** The number printed on paperwork for clients to ring. */
  @IsOptional() @IsString() phone?: string;
  /** The address printed for clients to write to. */
  @IsOptional() @IsString() email?: string;
  /** Where the shop is, as it prints on a letterhead. */
  @IsOptional() @IsString() address?: string;
  /** The shop's website, if it has one. */
  @IsOptional() @IsString() website?: string;

  /** The bank, for the payment details at the foot of an invoice. */
  @IsOptional() @IsString() bankName?: string;
  /** The name on the shop's account, which a client's transfer must match. */
  @IsOptional() @IsString() bankAccountName?: string;
  /** The account clients pay into. */
  @IsOptional() @IsString() bankAccountNumber?: string;
  /** The branch code for that account. */
  @IsOptional() @IsString() bankIfsc?: string;
  /** The branch, where the shop prints it. */
  @IsOptional() @IsString() bankBranch?: string;

  /**
   * The standing terms printed at the foot of quotes and invoices. Written
   * once here rather than retyped, which is how two quotes end up promising
   * different things.
   */
  @IsOptional() @IsString() termsAndConditions?: string;
  /** Who signs the shop's paperwork. */
  @IsOptional() @IsString() signatoryName?: string;
  /** The colour used on printed documents. */
  @IsOptional() @IsString() accentColor?: string;
  /** The app and web accent. Validated as a hex colour before it is stored. */
  @IsOptional() @IsString() @Matches(HEX_COLOR) themeAccent?: string;
}
