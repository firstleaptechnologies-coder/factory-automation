import { LedgerAccount, LedgerDirection, PaymentMode } from '@prisma/client';
import { depositPosting, disbursementPosting, paymentPosting } from './postings';

const ORDER = { clientId: 'c1', code: 'ORD-1', client: { gstin: '27AAAPV1234C1ZV' } };

const payment = (over: Record<string, unknown> = {}) => ({
  id: 'p1',
  orderId: 'o1',
  amount: 40000,
  mode: PaymentMode.CASH,
  receivedAt: new Date('2026-09-08T10:00:00.000Z'),
  reference: 'UTR-9',
  note: null,
  reason: null,
  reversalOfId: null,
  receivedById: 'u1',
  ...over,
});

describe('a receipt', () => {
  it('is money in, in the account it arrived in', () => {
    const cash = paymentPosting(payment(), ORDER);
    expect(cash).toMatchObject({
      direction: LedgerDirection.IN,
      account: LedgerAccount.CASH,
      amount: 40000,
      voucher: 'RECEIPT',
    });

    const online = paymentPosting(payment({ mode: PaymentMode.ONLINE }), ORDER);
    expect(online.account).toBe(LedgerAccount.BANK);
  });

  it('carries what an accountant needs beside what a screen needs', () => {
    const entry = paymentPosting(payment(), ORDER);
    // An amount and a date are a bank statement, not a ledger.
    expect(entry).toMatchObject({
      accountHead: 'Sales',
      gstin: '27AAAPV1234C1ZV',
      reference: 'UTR-9',
      orderId: 'o1',
      clientId: 'c1',
    });
  });

  it('is dated when the money arrived, not when it was typed', () => {
    expect(paymentPosting(payment(), ORDER).at).toEqual(new Date('2026-09-08T10:00:00.000Z'));
  });

  it('posts a correction as the negative of what it takes back', () => {
    const reversal = paymentPosting(
      payment({ id: 'p2', amount: -40000, reversalOfId: 'p1', reason: 'Entered twice' }),
      ORDER,
    );

    // Same direction, negative amount: every total stays a plain sum and no
    // reader has to know which kinds cancel which.
    expect(reversal).toMatchObject({
      direction: LedgerDirection.IN,
      amount: -40000,
      note: 'Entered twice',
    });
  });

  it('points back at the row that caused it', () => {
    expect(paymentPosting(payment(), ORDER)).toMatchObject({
      sourceType: 'Payment',
      sourceId: 'p1',
    });
  });
});

describe('cash walked to the bank', () => {
  const deposit = {
    id: 'd1',
    amount: 25000,
    depositedAt: new Date('2026-09-08T16:00:00.000Z'),
    bankReference: 'NEFT-2',
    note: null,
    depositedById: 'u1',
    paymentId: 'p1',
  };

  it('is a transfer, not money leaving the business', () => {
    // The shop has not spent it; it has only moved it.
    expect(depositPosting(deposit, { orderId: 'o1' })).toMatchObject({
      direction: LedgerDirection.TRANSFER,
      account: LedgerAccount.CASH,
      voucher: 'CONTRA',
      amount: 25000,
    });
  });

  it('names the account the money left', () => {
    // Cash in hand is the number this shop asks about.
    expect(depositPosting(deposit, null).account).toBe(LedgerAccount.CASH);
  });

  it('keeps the order where the cash can be traced to one', () => {
    expect(depositPosting(deposit, { orderId: 'o1' }).orderId).toBe('o1');
    // One trip to the bank often covers several orders' takings.
    expect(depositPosting(deposit, null).orderId).toBeNull();
  });
});

describe('a payout', () => {
  const payout = {
    id: 'x1',
    orderId: 'o1',
    amount: 12000,
    payeeName: 'Ramesh (fitter)',
    paidAt: new Date('2026-09-08T18:00:00.000Z'),
    paidMode: PaymentMode.CASH,
    reference: null,
    note: null,
    recordedById: 'u1',
    category: { name: 'Fitting' },
  };

  it('is money leaving, against the order it came from', () => {
    expect(disbursementPosting(payout)).toMatchObject({
      direction: LedgerDirection.OUT,
      account: LedgerAccount.CASH,
      voucher: 'PAYMENT',
      orderId: 'o1',
      amount: 12000,
    });
  });

  it('names who was paid and what for', () => {
    expect(disbursementPosting(payout)).toMatchObject({
      party: 'Ramesh (fitter)',
      accountHead: 'Fitting',
    });
  });

  it('falls back to a head of its own where no category was chosen', () => {
    expect(disbursementPosting({ ...payout, category: null }).accountHead).toBe('Payouts');
  });

  it('does not reduce what the order collected', () => {
    // The standing rule: payouts sit beside orders and are never netted off
    // them. An OUT entry against the order is not a subtraction from its
    // receipts, which are IN entries.
    expect(disbursementPosting(payout).direction).toBe(LedgerDirection.OUT);
  });
});
