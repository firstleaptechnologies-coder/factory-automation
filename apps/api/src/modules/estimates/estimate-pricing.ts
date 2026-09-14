import { PricingMode, TaxTreatment } from '@prisma/client';

/** What `punch` must be handed for an order to come to exactly what was quoted. */
export interface QuotedPricing {
  pricingMode: PricingMode;
  taxTreatment: TaxTreatment;
  total: number;
  gstSlabId?: string;
}

/**
 * The figure an order takes from the quotation behind it.
 *
 * Kept here, apart from either service, because there are two doors into the
 * same job — the quote's own button and the enquiry's — and they must put the
 * same number on the order. They did not: the quote carried its figure across
 * and the enquiry punched an order with no price at all, so the shop re-keyed
 * what it had already agreed and every such order was one typo from wrong.
 *
 * The treatment is the whole subtlety. A lump-sum order under EXCLUSIVE reads
 * its figure as the taxable value and adds GST on top, so handing it the gross
 * taxes a figure that already includes tax — a client who agreed to ₹4,25,980
 * was invoiced ₹5,02,656. Under INCLUSIVE and ABSORBED the quoted figure is
 * what they pay and the tax comes out of it, which is the gross.
 */
export function pricedFromQuote(quote: {
  taxTreatment: TaxTreatment;
  total: unknown;
  grandTotal: unknown;
  items: { gstSlabId: string | null }[];
}): QuotedPricing {
  return {
    pricingMode: PricingMode.LUMP_SUM,
    taxTreatment: quote.taxTreatment,
    total:
      quote.taxTreatment === TaxTreatment.EXCLUSIVE
        ? Number(quote.total)
        : Number(quote.grandTotal),
    // The slab the quote was priced at, where it was all one slab. The shop's
    // default is not necessarily the rate the client agreed to.
    gstSlabId: oneSlab(quote.items),
  };
}

/** The one slab a quotation used, or nothing when it mixed several. */
export function oneSlab(items: { gstSlabId: string | null }[]): string | undefined {
  const slabs = new Set(items.map((item) => item.gstSlabId));
  const [only] = [...slabs];
  return slabs.size === 1 && only ? only : undefined;
}
