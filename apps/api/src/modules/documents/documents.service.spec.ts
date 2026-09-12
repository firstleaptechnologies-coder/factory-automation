import { RateUnit } from '@prisma/client';
import { round2 } from '../../common/utils/pricing';
import { describeItem } from './documents.service';


/*
 * The working shown on the bill has to multiply out.
 *
 * A panel quoted at ₹200 per square foot billed "2.00 nos × ₹200.00 =
 * ₹20,000.00" — the piece count against a per-square-foot rate, which is the
 * one arithmetic a client's accountant checks by eye and the one that did not
 * hold. The billable figure is 100 sq ft.
 */
describe('what an invoice line says was billed', () => {
  const panel = (rateUnit: RateUnit, rate: number) => ({
    material: { name: 'MDF' },
    // 3048 × 1524 mm is 10ft × 5ft — 50 sq ft a sheet.
    lengthMm: 3048,
    widthMm: 1524,
    quantity: 2,
    rate,
    rateUnit,
    amount: 20000,
    gstRatePct: 18,
    taxAmount: 3600,
  });

  it('bills square feet against a per-square-foot rate', () => {
    const line = describeItem(panel(RateUnit.PER_SQFT, 200));

    expect(line.unit).toBe('sq ft');
    expect(line.quantity).toBe(100);
    // The row now multiplies out: 100 × 200 = 20,000.
    expect(round2(line.quantity * line.rate)).toBe(line.amount);
  });

  it('bills running feet against a per-running-foot rate', () => {
    const line = describeItem(panel(RateUnit.PER_RFT, 100));

    expect(line.unit).toBe('r ft');
    expect(line.quantity).toBe(20);
  });

  it('still bills pieces when that is how it was quoted', () => {
    const line = describeItem(panel(RateUnit.PER_PIECE, 10000));

    expect(line.unit).toBe('pcs');
    expect(line.quantity).toBe(2);
  });

  // A lump-sum line is the job, not a count of anything.
  it('bills a lump sum as one', () => {
    const line = describeItem(panel(RateUnit.LUMP_SUM, 20000));

    expect(line.unit).toBe('lump sum');
    expect(line.quantity).toBe(1);
  });

  // An older line with no rate unit stored must not crash the bill.
  it('falls back to pieces when the rate unit is missing', () => {
    const line = describeItem({ ...panel(RateUnit.PER_SQFT, 200), rateUnit: null });

    expect(line.unit).toBe('pcs');
  });
});
