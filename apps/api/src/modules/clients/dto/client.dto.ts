import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

/**
 * Only `name` is required. Punching an order must never stall because the
 * person on the phone has not given a GSTIN yet.
 */
export class CreateClientDto {
  /**
   * Who the work is for, as the shop refers to them. A person's name or a
   * firm's — whichever is said on the phone, because that is what somebody
   * will search for later.
   */
  @IsString() @MinLength(2) name: string;
  /**
   * The number the shop rings. It is also what a client is found by, and the
   * same number is refused twice: two records for one firm is a split ledger,
   * half the outstanding on each, and a statement that is wrong on both. A
   * number is matched however it is written — +91, spaces, dashes.
   */
  @IsOptional() @IsString() phone?: string;
  /** Where estimates and bills are sent, when the client wants them emailed. */
  @IsOptional() @IsString() email?: string;
  /**
   * Their GST number. Required on their invoice if they want to claim the tax
   * back, and the first two digits are their state, which is what decides
   * whether the bill shows CGST and SGST or a single IGST line.
   */
  @IsOptional() @IsString() gstin?: string;
  /**
   * The trading name on their paperwork, which is rarely the name of the
   * person who rings. "Verma Interiors" on the invoice, "Anil" on the phone.
   */
  @IsOptional() @IsString() company?: string;
  /**
   * Where they are, when it is neither the billing nor the delivery address —
   * an office, or the only address anybody has. Kept as one block rather than
   * split into lines, because addresses here are pasted from WhatsApp far more
   * often than typed field by field.
   */
  @IsOptional() @IsString() address?: string;
  /**
   * A second number for the same firm — the site contact, or whoever actually
   * answers. Optional: a client punched on the floor often has just the one.
   */
  @IsOptional() @IsString() altPhone?: string;
  /**
   * Their GST state code, as two digits — 08 for Rajasthan, 27 for
   * Maharashtra. Their state against the shop's is what decides whether a
   * supply is intra-state or inter-state, so this is a billing fact rather
   * than part of an address.
   */
  @IsOptional() @IsString() stateCode?: string;
  /** The state that code stands for, spelt out, so an invoice can print it. */
  @IsOptional() @IsString() stateName?: string;
  /** The address the invoice is made out to. */
  @IsOptional() @IsString() billingAddress?: string;
  /**
   * Where the work is delivered, when that differs from where the bill goes.
   * Left empty it means the same as billing.
   */
  @IsOptional() @IsString() shippingAddress?: string;
  /**
   * Anything worth remembering about dealing with them — who to ask for, how
   * they pay, what went wrong last time. Shown whenever their name is opened.
   */
  @IsOptional() @IsString() notes?: string;
}

/**
 * Changing a client that already exists.
 *
 * Every field means what it means on CreateClientDto — the same name, the same
 * purpose — and all of them are optional here because an edit says only what
 * changed. Moving a number onto a client another one already has is refused,
 * for the same reason creating that duplicate is.
 */
export class UpdateClientDto {
  /** Who the work is for, as the shop refers to them. */
  @IsOptional() @IsString() @MinLength(2) name?: string;
  /** The number they are rung and found on. Refused if another client has it. */
  @IsOptional() @IsString() phone?: string;
  /** Where estimates and bills are emailed. */
  @IsOptional() @IsString() email?: string;
  /** Their GST number, for claiming the tax back on their invoice. */
  @IsOptional() @IsString() gstin?: string;
  /** The trading name on their paperwork. */
  @IsOptional() @IsString() company?: string;
  /** Where they are, when it is neither the billing nor the delivery address. */
  @IsOptional() @IsString() address?: string;
  /** A second number for the same firm — usually the site contact. */
  @IsOptional() @IsString() altPhone?: string;
  /** Their GST state code as two digits, which decides the tax split. */
  @IsOptional() @IsString() stateCode?: string;
  /** The state that code stands for, spelt out for the invoice. */
  @IsOptional() @IsString() stateName?: string;
  /** The address the invoice is made out to. */
  @IsOptional() @IsString() billingAddress?: string;
  /** Where the work is delivered, when that differs from where the bill goes. */
  @IsOptional() @IsString() shippingAddress?: string;
  /** Anything worth remembering about dealing with them. */
  @IsOptional() @IsString() notes?: string;
  /**
   * Whether they are still a client. Switching this off hides them from
   * searching and from punching without deleting anything: their orders,
   * payments and history are the shop's own records and stay exactly as they
   * were.
   */
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class ClientQueryDto {
  /**
   * Matches a name, a firm, a phone number, a client code or an email. One box
   * rather than a form, because whoever is looking knows one of those things
   * and does not know which kind it is.
   */
  @IsOptional() @IsString() search?: string;
  /** Which page of the list. Counting starts at one. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  /** How many clients on a page. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) limit = 25;

  get skip(): number {
    return (this.page - 1) * this.limit;
  }
}

/**
 * A site this client has work done at.
 *
 * Kept per client because the same firm orders for several sites — a flat, a
 * showroom, a site office — and "which one is this for" is asked on every
 * order. Sites accumulate as orders are punched, so the list offered is the
 * places this client has actually used.
 */
export class AddLocationDto {
  /**
   * What the shop calls the site — "Bandra flat", "Andheri showroom". The
   * name, not the address, because that is what is said on the phone and what
   * is picked from a list while punching.
   */
  @IsString() @MinLength(1) name: string;
  /** The full address, for the delivery challan. */
  @IsOptional() @IsString() address?: string;
}
