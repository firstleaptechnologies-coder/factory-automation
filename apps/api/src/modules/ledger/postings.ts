import { LedgerAccount, LedgerDirection, PaymentMode } from '@prisma/client';
import { accountFor, type Posting } from './ledger.service';

/**
 * How each kind of money row becomes a ledger entry.
 *
 * Pure functions, deliberately: what a payment means to the books is a rule
 * worth reading and testing on its own, without a database in the way. The
 * services do the writing; these decide what is written.
 */

/** A receipt against an order — and a reversal, which is the same row negated. */
export function paymentPosting(payment: {
  id: string;
  orderId: string;
  amount: number;
  mode: PaymentMode;
  receivedAt: Date;
  reference?: string | null;
  note?: string | null;
  reason?: string | null;
  reversalOfId?: string | null;
  receivedById?: string | null;
}, order: { clientId?: string | null; code?: string | null; client?: { gstin?: string | null } | null }): Posting {
  const taken = Boolean(payment.reversalOfId);
  return {
    sourceType: 'Payment',
    sourceId: payment.id,
    at: payment.receivedAt,
    // A correction posts under the same direction as the money it takes back,
    // with the negative amount, so every total stays a plain sum.
    direction: LedgerDirection.IN,
    account: accountFor(payment.mode),
    amount: payment.amount,
    voucher: 'RECEIPT',
    orderId: payment.orderId,
    clientId: order.clientId ?? null,
    accountHead: 'Sales',
    gstin: order.client?.gstin ?? null,
    reference: payment.reference ?? null,
    note: taken ? payment.reason ?? 'Receipt taken back' : payment.note ?? null,
    recordedById: payment.receivedById ?? null,
  };
}

/**
 * Cash walked to the bank.
 *
 * A transfer rather than an outflow: the shop has not spent it, it has only
 * moved it. The account named is the one it left, because cash in hand is the
 * number this shop asks about and the bank's own statement is the truth for
 * the other side.
 */
export function depositPosting(deposit: {
  id: string;
  amount: number;
  depositedAt: Date;
  bankReference?: string | null;
  note?: string | null;
  depositedById?: string | null;
  paymentId?: string | null;
}, payment?: { orderId?: string | null } | null): Posting {
  return {
    sourceType: 'CashDeposit',
    sourceId: deposit.id,
    at: deposit.depositedAt,
    direction: LedgerDirection.TRANSFER,
    account: LedgerAccount.CASH,
    amount: deposit.amount,
    voucher: 'CONTRA',
    orderId: payment?.orderId ?? null,
    accountHead: 'Bank',
    reference: deposit.bankReference ?? null,
    note: deposit.note ?? null,
    recordedById: deposit.depositedById ?? null,
  };
}

/**
 * Money paid out of an order to somebody else.
 *
 * Posted only once it is actually settled — a planned payout is an intention,
 * and an intention is not a movement of money. It sits beside the order it
 * came from and never reduces what that order collected.
 */
export function disbursementPosting(payout: {
  id: string;
  orderId: string;
  amount: number;
  payeeName: string;
  paidAt?: Date | null;
  paidMode?: PaymentMode | null;
  reference?: string | null;
  note?: string | null;
  recordedById?: string | null;
  category?: { name: string } | null;
}): Posting {
  return {
    sourceType: 'Disbursement',
    sourceId: payout.id,
    at: payout.paidAt ?? new Date(),
    direction: LedgerDirection.OUT,
    account: payout.paidMode ? accountFor(payout.paidMode) : LedgerAccount.CASH,
    amount: payout.amount,
    voucher: 'PAYMENT',
    orderId: payout.orderId,
    party: payout.payeeName,
    accountHead: payout.category?.name ?? 'Payouts',
    reference: payout.reference ?? null,
    note: payout.note ?? null,
    recordedById: payout.recordedById ?? null,
  };
}

/**
 * Money the shop spent on itself.
 *
 * Which account it left is the shop's own answer, not ours: a payment type is
 * a label it invented, so the option row it came from says whether that label
 * means the drawer or the bank. The account is passed in already decided,
 * because guessing it here would quietly mis-state cash in hand.
 */
export function expensePosting(
  expense: {
    id: string;
    date: Date;
    amount: number;
    description: string;
    spentType: string;
    toName: string;
    vendor: string;
    vendorGstin?: string | null;
    taxAmount?: number | string | null;
    note?: string | null;
    orderId?: string | null;
    createdById?: string | null;
  },
  account: LedgerAccount,
): Posting {
  return {
    sourceType: 'Expense',
    sourceId: expense.id,
    at: expense.date,
    direction: LedgerDirection.OUT,
    account,
    amount: expense.amount,
    voucher: 'PAYMENT',
    orderId: expense.orderId ?? null,
    // The recipient, not the bucket the money was attributed to: a ledger
    // reads better with the name of whoever was handed it.
    party: expense.toName,
    accountHead: expense.spentType,
    taxAmount: expense.taxAmount == null ? null : Number(expense.taxAmount),
    gstin: expense.vendorGstin ?? null,
    reference: null,
    note: expense.note ?? expense.description,
    recordedById: expense.createdById ?? null,
  };
}

/**
 * Which account a payment type comes out of.
 *
 * The option row decides, because the shop named these types. The guess below
 * is only for a label with no option behind it — one typed straight onto an
 * expense, or an option made before this column existed. It is a guess, and a
 * wrong one leaves a cash expense sitting in the drawer that isn't there, so
 * the config screen asks for the account whenever a payment type is added.
 */
export function accountForPaymentType(
  label: string,
  option?: { account?: LedgerAccount | null } | null,
): LedgerAccount {
  if (option?.account) return option.account;
  return /cash/i.test(label) ? LedgerAccount.CASH : LedgerAccount.BANK;
}
