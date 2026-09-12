import { round2 } from '../../common/utils/pricing';
import {
  creditAmounts,
  invoiceLines,
  invoiceTotals,
  isInterState,
  receivable,
  stateCode,
} from './invoice-maths';

const line = (amount: number, taxAmount: number) => ({
  description: 'Panel',
  quantity: 1,
  unit: 'nos',
  rate: amount,
  amount,
  gstRatePct: 18,
  taxAmount,
});

describe('what goes on the invoice', () => {
  /** An order's own money, which is what an invoice restates. */
  const order = (taxable: number, tax: number, discount = 0) => ({
    subtotal: taxable + discount,
    discount,
    taxable,
    tax,
  });

  it('splits the tax in two within the state', () => {
    const totals = invoiceTotals(order(10000, 1800), false);
    expect(totals).toMatchObject({ taxable: 10000, cgst: 900, sgst: 900, igst: 0, total: 11800 });
  });

  it('charges IGST across a state line', () => {
    const totals = invoiceTotals(order(10000, 1800), true);
    expect(totals).toMatchObject({ cgst: 0, sgst: 0, igst: 1800, total: 11800 });
  });

  it('bills what the order says, whatever its lines add up to', () => {
    // Most of this shop's work is quoted as one figure for a whole job, and
    // that figure lives on the order. An invoice that summed the lines would
    // bill a hundred-thousand-rupee job at zero.
    const totals = invoiceTotals(order(100000, 18000), false);
    expect(totals.total).toBe(118000);
  });

  it('carries the discount the order gave, on its face', () => {
    const totals = invoiceTotals(order(9000, 1620, 1000), false);
    expect(totals).toMatchObject({ subtotal: 10000, discount: 1000, taxable: 9000 });
  });

  it('takes the tax as charged rather than re-applying a slab', () => {
    // An order billed inclusive of GST carries less tax than the same figure
    // billed on top of it. Recomputing here would contradict the order.
    const totals = invoiceTotals(order(42372.88, 7627.12), false);
    expect(totals.total).toBe(50000);
  });

  it('gives the odd paisa to one half, so the two always sum to the whole', () => {
    const totals = invoiceTotals(order(100, 1.01), false);
    expect(totals.cgst + totals.sgst).toBe(1.01);
  });
});

describe('the lines an invoice prints', () => {
  const priced = {
    description: 'Panel',
    quantity: 1,
    unit: 'nos',
    rate: 10000,
    amount: 10000,
    gstRatePct: 18,
    taxAmount: 1800,
  };
  const unpriced = { ...priced, rate: 0, amount: 0, gstRatePct: 0, taxAmount: 0 };

  it('leaves the lines of an itemised order exactly as they were priced', () => {
    expect(invoiceLines([priced], { code: 'ORD-1', taxable: 10000, tax: 1800 })).toEqual([priced]);
  });

  it('bills a lump-sum job as one line carrying what was agreed', () => {
    // Its lines describe what was made and carry no money. A table of zeroes
    // under a six-figure total is a bill nobody would accept.
    const lines = invoiceLines([unpriced], { code: 'ORD-1', taxable: 100000, tax: 18000 });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ amount: 100000, rate: 100000, unit: 'job', taxAmount: 18000 });
  });

  it('keeps saying what the job was made of', () => {
    const lines = invoiceLines(
      [unpriced, { ...unpriced, description: 'Jali balcony' }],
      { code: 'ORD-1', taxable: 100000, tax: 18000 },
    );
    expect(lines[0].description).toBe('Panel; Jali balcony');
  });

  it('names the order when there is nothing else to say', () => {
    const lines = invoiceLines([], { code: 'ORD-2627-0006', taxable: 100000, tax: 18000 });
    expect(lines[0].description).toBe('Work as per order ORD-2627-0006');
  });

  it('prints the rate that was charged, not the slab that applies today', () => {
    // Derived from the tax the order actually carried, so an inclusive job
    // reads at the rate its client was billed at.
    const lines = invoiceLines([unpriced], { code: 'ORD-1', taxable: 42372.88, tax: 7627.12 });
    expect(lines[0].gstRatePct).toBe(18);
  });
});

describe('which pair of taxes applies', () => {
  it('is IGST when the states differ', () => {
    expect(isInterState('08-Rajasthan', '27-Maharashtra')).toBe(true);
  });

  it('is CGST and SGST within one state', () => {
    expect(isInterState('08-Rajasthan', '08-Rajasthan')).toBe(false);
  });

  it('treats an unknown state as local, which is the common case', () => {
    // A shop selling to a walk-in with no GSTIN is selling locally.
    expect(isInterState('08-Rajasthan', null)).toBe(false);
    expect(isInterState(null, '27-Maharashtra')).toBe(false);
  });

  it('reads the code off the front of the label', () => {
    expect(stateCode('08-Rajasthan')).toBe('08');
    expect(stateCode('  27 Maharashtra')).toBe('27');
    expect(stateCode('Rajasthan')).toBeNull();
    expect(stateCode(null)).toBeNull();
  });
});

describe('what a credit note comes to', () => {
  const invoice = { taxable: 10000, cgst: 900, sgst: 900, igst: 0 };

  it('reverses the tax in the proportion it was charged', () => {
    expect(creditAmounts(5000, invoice)).toMatchObject({
      taxable: 5000,
      cgst: 450,
      sgst: 450,
      total: 5900,
    });
  });

  it('reverses all of it for a credit against the whole invoice', () => {
    expect(creditAmounts(10000, invoice).total).toBe(11800);
  });

  it('reverses IGST against an IGST invoice, because the goods still crossed', () => {
    const across = { taxable: 10000, cgst: 0, sgst: 0, igst: 1800 };
    expect(creditAmounts(10000, across)).toMatchObject({ igst: 1800, cgst: 0, sgst: 0 });
  });

  it('credits nothing against an invoice with no taxable value', () => {
    expect(creditAmounts(500, { taxable: 0, cgst: 0, sgst: 0, igst: 0 }).total).toBe(500);
  });

  it('never credits a negative amount', () => {
    expect(creditAmounts(-500, invoice).taxable).toBe(0);
  });
});

describe('what an order still owes', () => {
  it('shows what was credited beside what was collected, never inside it', () => {
    /*
     * An order billed ₹50,000, credited ₹5,000 and paid ₹45,000 is settled —
     * and the paper says exactly that in three figures rather than showing
     * ₹50,000 received. Nothing here can make an order look paid by money
     * nobody collected.
     */
    expect(receivable({ invoiced: 50000, credited: 5000, received: 45000 })).toEqual({
      charged: 50000,
      credited: 5000,
      received: 45000,
      due: 0,
      settled: true,
    });
  });

  it('still owes what nobody has paid or credited', () => {
    expect(receivable({ invoiced: 50000, credited: 0, received: 20000 })).toMatchObject({
      due: 30000,
      settled: false,
    });
  });

  it('will not credit more than was charged', () => {
    // Otherwise a credit note could turn a bill into money owed to the client.
    expect(receivable({ invoiced: 10000, credited: 99999, received: 0 })).toMatchObject({
      credited: 10000,
      due: 0,
    });
  });

  it('forgives two paise of rounding, and not two rupees', () => {
    expect(receivable({ invoiced: 10000, credited: 0, received: 9999.99 }).settled).toBe(true);
    expect(receivable({ invoiced: 10000, credited: 0, received: 9998 }).settled).toBe(false);
  });
});

/*
 * A bill has to show its working per line.
 *
 * An order-level discount comes off the whole job, so the line tax was worked
 * out before it existed: the tax column added to more than the invoice charged
 * — 1,800 against 1,620. Scaling the tax fixed the total and printed
 * `₹3,240 (18.0%)` against a ₹20,000 line, which is 16.2% of it. Each line
 * carries its own share of the discount instead, and is taxed on what is left.
 */
describe('an itemised invoice with a discount off the whole job', () => {
  const priced = (amount: number, gstRatePct: number) => ({
    description: `line ${amount}`,
    hsn: null,
    quantity: 1,
    unit: 'job',
    rate: amount,
    amount,
    gstRatePct,
    taxAmount: round2(amount * (gstRatePct / 100)),
  });

  it('gives each line its share, and taxes what is left of it', () => {
    // 10,000 at 18%, 1,000 off → 9,000 taxable, 1,620 tax.
    const [line] = invoiceLines([priced(10000, 18)], {
      code: 'ORD-1',
      taxable: 9000,
      tax: 1620,
      discount: 1000,
    });

    expect(line.discount).toBe(1000);
    expect(line.taxAmount).toBe(1620);
    // The row reconciles against its own printed rate.
    expect(round2((line.amount - line.discount!) * (line.gstRatePct / 100))).toBe(
      line.taxAmount,
    );
  });

  it('splits the discount by amount across a mixed-rate order', () => {
    const lines = invoiceLines([priced(10000, 18), priced(10000, 5)], {
      code: 'ORD-2',
      taxable: 10000,
      tax: 1150,
      discount: 10000,
    });

    expect(lines.map((line) => line.discount)).toEqual([5000, 5000]);
    // Each line taxed at its own slab on its own half: 900 and 250.
    expect(lines.map((line) => line.taxAmount)).toEqual([900, 250]);
  });

  /*
   * The shares have to add up to the discount the invoice charges, to the
   * paisa. A third of a penny lost per line is a bill that does not foot.
   */
  it('lands the rounding on the last line so the shares foot exactly', () => {
    const lines = invoiceLines([priced(100, 18), priced(100, 18), priced(100, 18)], {
      code: 'ORD-3',
      taxable: 290,
      tax: 52.2,
      discount: 10,
    });

    const given = round2(lines.reduce((sum, line) => sum + (line.discount ?? 0), 0));
    expect(given).toBe(10);
  });

  it('leaves an undiscounted invoice exactly alone', () => {
    const original = [priced(10000, 18)];
    const lines = invoiceLines(original, { code: 'ORD-4', taxable: 10000, tax: 1800 });

    expect(lines).toEqual(original);
  });

  // Never more off than the job is worth.
  it('never discounts a line past nothing', () => {
    const [line] = invoiceLines([priced(5000, 18)], {
      code: 'ORD-5',
      taxable: 0,
      tax: 0,
      discount: 9999,
    });

    expect(line.discount).toBe(5000);
    expect(line.taxAmount).toBe(0);
  });
});
