import { DisbursementStatus } from '@prisma/client';
import { ledgerFilter, paidWithin } from './disbursements.service';

describe('ledgerFilter', () => {
  it('hides cancelled payouts by default', () => {
    // The rows on screen and the totals above them are both built from this
    // filter; when they were derived separately they disagreed.
    expect(ledgerFilter({}).status).toEqual({ not: DisbursementStatus.CANCELLED });
  });

  it('shows cancelled payouts when they are what was asked for', () => {
    expect(ledgerFilter({ status: DisbursementStatus.CANCELLED }).status).toBe(
      DisbursementStatus.CANCELLED,
    );
  });

  it('narrows to one status without also excluding it', () => {
    expect(ledgerFilter({ status: DisbursementStatus.PAID }).status).toBe(
      DisbursementStatus.PAID,
    );
  });

  it('searches the payee and the order number together', () => {
    const where = ledgerFilter({ search: 'Ramesh' });
    expect(where.OR).toHaveLength(2);
    expect(JSON.stringify(where.OR)).toContain('payeeName');
    expect(JSON.stringify(where.OR)).toContain('code');
  });

  it('leaves search and dates off entirely when they were not given', () => {
    // An empty `contains` would match nothing rather than everything.
    const where = ledgerFilter({});
    expect(where.OR).toBeUndefined();
    expect(where.createdAt).toBeUndefined();
  });

  it('accepts an open-ended date range at either end', () => {
    expect(ledgerFilter({ from: '2026-01-01' }).createdAt).toHaveProperty('gte');
    expect(ledgerFilter({ from: '2026-01-01' }).createdAt).not.toHaveProperty('lte');
    expect(ledgerFilter({ to: '2026-12-31' }).createdAt).toHaveProperty('lte');
  });
});

describe('paidWithin', () => {
  it('intersects with the view rather than replacing its status', () => {
    // Spreading a second `status` onto the filter overwrote the first, so
    // asking for cancelled rows reported another set's paid total.
    const view = ledgerFilter({ status: DisbursementStatus.CANCELLED });
    const paid = paidWithin(view);

    expect(paid.AND).toEqual([view, { status: DisbursementStatus.PAID }]);
    // The view's own status survives intact inside the intersection.
    expect((paid.AND as { status: unknown }[])[0].status).toBe(DisbursementStatus.CANCELLED);
  });

  it('keeps every other narrowing from the view', () => {
    const view = ledgerFilter({ categoryId: 'cat-1', search: 'Iqbal' });
    const paid = paidWithin(view);
    expect((paid.AND as Record<string, unknown>[])[0]).toBe(view);
  });
});
