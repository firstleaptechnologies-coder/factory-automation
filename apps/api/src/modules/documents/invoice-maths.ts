import { gstComponents, round2 } from '../../common/utils/pricing';

/**
 * What goes on a tax invoice, and what a credit note takes off it.
 *
 * Pure, and separate from the service, because these are the figures a client
 * checks line by line and an assessing officer checks against the return. They
 * should be readable without a database in the way.
 */

export interface InvoiceLine {
  description: string;
  hsn?: string | null;
  quantity: number;
  unit: string;
  rate: number;
  amount: number;
  gstRatePct: number;
  taxAmount: number;
}

export interface InvoiceTotals {
  subtotal: number;
  discount: number;
  /** Taxable value: subtotal less discount. */
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
}

/**
 * The totals of an invoice, from the order it bills.
 *
 * The figures are the order's own, restated rather than recomputed. This
 * matters more than it looks: most of this shop's work is quoted as one figure
 * for a whole job, and that figure lives on the order, not on its lines — the
 * lines carry the material and the size and nothing else. An invoice that added
 * its lines up would bill a hundred-thousand-rupee job at zero, which is what
 * the first one raised against a real order did.
 *
 * It also keeps the two documents agreeing. The order is what the client
 * agreed to pay; a bill that arrived at its own answer — by re-applying a slab,
 * by rounding differently — would be a bill nobody could reconcile against the
 * order it came from.
 *
 * Only the CGST/SGST/IGST split is decided here, because the order does not
 * record it: what the order knows is how much tax, and this decides which
 * columns it prints in.
 */
export function invoiceTotals(
  order: { subtotal: number; discount: number; taxable: number; tax: number },
  interState: boolean,
): InvoiceTotals {
  const subtotal = round2(order.subtotal);
  const discount = round2(order.discount);
  const taxable = round2(order.taxable);
  const tax = round2(order.tax);

  // The invoice stores whether the supply crossed a state line, so the answer
  // is passed rather than reconstructed from codes it no longer has.
  const split = gstComponents(tax, interState);

  return {
    subtotal,
    discount,
    taxable,
    cgst: split.cgst,
    sgst: split.sgst,
    igst: split.igst,
    total: round2(taxable + tax),
  };
}

/**
 * The lines that go on the invoice.
 *
 * An itemised order bills line by line, and its lines already add up to what
 * the order says. A lump-sum job never priced its lines at all: they describe
 * what was made and carry no money, and printing a table of zeroes under a
 * six-figure total is a bill no client would accept and no assessing officer
 * would read. So the job becomes one line carrying what was agreed, described
 * by the work it was made of.
 *
 * The rate on that line is derived from the tax the order actually charged
 * rather than looked up from a slab today, because the invoice must print the
 * rate that was applied, not the one that now applies.
 */
export function invoiceLines(
  lines: InvoiceLine[],
  order: { code: string; taxable: number; tax: number },
): InvoiceLine[] {
  const priced = round2(lines.reduce((sum, line) => sum + line.amount, 0));
  if (priced > 0) return lines;

  const taxable = round2(order.taxable);
  const described = lines.map((line) => line.description).filter(Boolean);

  return [
    {
      description: described.length
        ? described.join('; ')
        : `Work as per order ${order.code}`,
      hsn: null,
      quantity: 1,
      unit: 'job',
      rate: taxable,
      amount: taxable,
      gstRatePct: taxable > 0 ? round2((order.tax / taxable) * 100) : 0,
      taxAmount: round2(order.tax),
    },
  ];
}

/**
 * Whether a supply crosses a state line.
 *
 * CGST + SGST within the seller's own state, IGST outside it. Decided from the
 * two state codes rather than from a setting somebody has to remember, and
 * decided *once* — an invoice stores the answer, so a reprint after the client
 * moves cannot change which pair is on the paper that was issued.
 *
 * When either state is unknown the supply is treated as intra-state, which is
 * the overwhelmingly common case for a shop selling locally.
 */
export function isInterState(firmState?: string | null, clientState?: string | null): boolean {
  const firm = stateCode(firmState);
  const client = stateCode(clientState);
  if (!firm || !client) return false;
  return firm !== client;
}

/** The two digits at the front of "08-Rajasthan", or nothing. */
export function stateCode(value?: string | null): string | null {
  if (!value) return null;
  const match = /^\s*(\d{2})/.exec(value);
  return match ? match[1] : null;
}

export interface CreditAmounts {
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
}

/**
 * What a credit note comes to.
 *
 * The GST is reversed in the same proportion the invoice charged it — a credit
 * against an IGST invoice reverses IGST — because a return does not change
 * where the goods went. The rate is taken from the invoice rather than from a
 * slab today, so a credit note raised after a rate change still reverses what
 * was actually collected.
 */
export function creditAmounts(
  taxable: number,
  invoice: { taxable: number; cgst: number; sgst: number; igst: number },
): CreditAmounts {
  const wanted = round2(Math.max(0, taxable));

  // The proportion of the invoice being credited. A credit for the whole
  // invoice reverses the whole tax, whatever rounding did to the rate.
  const share = invoice.taxable > 0 ? wanted / invoice.taxable : 0;

  const cgst = round2(invoice.cgst * share);
  const sgst = round2(invoice.sgst * share);
  const igst = round2(invoice.igst * share);

  return { taxable: wanted, cgst, sgst, igst, total: round2(wanted + cgst + sgst + igst) };
}

/**
 * What an order still owes, once credit notes are taken into account.
 *
 * Credited money is never counted as received. An order billed ₹50,000,
 * credited ₹5,000 and paid ₹45,000 is settled — and the summary says exactly
 * that, in three figures, rather than showing ₹50,000 collected. The standing
 * rule holds: nothing here can make an order look paid by money nobody
 * collected, because what was credited is on the paper beside what was.
 */
export function receivable(input: {
  invoiced: number;
  credited: number;
  received: number;
}): { charged: number; credited: number; received: number; due: number; settled: boolean } {
  const charged = round2(input.invoiced);
  const credited = round2(Math.min(input.credited, charged));
  const received = round2(input.received);
  const due = round2(Math.max(0, charged - credited - received));

  return {
    charged,
    credited,
    received,
    due,
    // A hair of tolerance: rupee rounding should not leave an order forever
    // owing two paise.
    settled: due <= 0.01,
  };
}
