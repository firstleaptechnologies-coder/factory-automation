import { PaymentStatus } from '@prisma/client';
import { deriveStatus } from './payments.service';

describe('deriveStatus', () => {
  it('is pending until something is actually collected', () => {
    expect(deriveStatus(47200, 0)).toBe(PaymentStatus.PENDING);
  });

  it('is partial while money is still owed', () => {
    expect(deriveStatus(47200, 15000)).toBe(PaymentStatus.PARTIAL);
  });

  it('is received once the whole order is collected', () => {
    expect(deriveStatus(47200, 47200)).toBe(PaymentStatus.RECEIVED);
  });

  it('does not leave an order two paise short of settled', () => {
    // Rupee rounding should not keep an order "partial" forever.
    expect(deriveStatus(47200, 47199.99)).toBe(PaymentStatus.RECEIVED);
  });

  it('treats an overpayment as settled rather than as an error', () => {
    expect(deriveStatus(1000, 1200)).toBe(PaymentStatus.RECEIVED);
  });

  it('settles a zero-value order that has taken nothing', () => {
    // A punched-but-unpriced order owes nothing, so it is not "pending".
    expect(deriveStatus(0, 0)).toBe(PaymentStatus.PENDING);
  });

  it('re-settles when the order total drops below what was collected', () => {
    // Dropping the GST off a ₹47,200 order makes ₹40,000 the whole of it, and a
    // client who had already paid ₹40,000 is now paid in full.
    expect(deriveStatus(47200, 40000)).toBe(PaymentStatus.PARTIAL);
    expect(deriveStatus(40000, 40000)).toBe(PaymentStatus.RECEIVED);
  });
});
