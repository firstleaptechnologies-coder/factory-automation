import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  LedgerAccount,
  LedgerDirection,
  PaymentMode,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { LedgerService } from '../ledger/ledger.service';
import { depositPosting, paymentPosting } from '../ledger/postings';
import { round2 } from '../../common/utils/pricing';
import {
  CashPositionQueryDto,
  RecordDepositDto,
  RecordPaymentDto,
  TRANSACTION_KINDS,
  TransactionKind,
  TransactionQueryDto,
} from './dto/payment.dto';
import { paginate } from '../../common/dto/pagination.dto';
import { tenantId } from '../../common/tenancy/tenant-context';

/** One movement of money, whatever kind it was. */
export interface TransactionRow {
  id: string;
  kind: TransactionKind;
  direction: 'IN' | 'OUT' | 'TRANSFER';
  at: Date;
  amount: number;
  reference: string | null;
  note: string | null;
  order: { id: string; code: string; client: { name: string } } | null;
  by: { id: string; name: string } | null;
}

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly ledger: LedgerService,
  ) {}

  /**
   * Record money against an order and re-derive its payment status.
   *
   * Overpayment is refused rather than absorbed: it is nearly always a typo or
   * a payment entered against the wrong order, and silently accepting it makes
   * the pending figure lie on two orders at once.
   */
  async record(orderId: string, dto: RecordPaymentDto, userId?: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      // The client comes along for what the notification will say.
      include: { payments: true, client: { select: { name: true, gstin: true } } },
    });
    if (!order) throw new NotFoundException(`Order ${orderId} not found`);

    const total = Number(order.grandTotal);
    const already = order.payments.reduce((sum, p) => sum + Number(p.amount), 0);
    const outstanding = round2(total - already);

    if (total <= 0) {
      throw new BadRequestException(
        'This order has no value yet — set the item rates or a lump sum before recording payment',
      );
    }
    if (dto.amount > outstanding + 0.01) {
      throw new BadRequestException(
        `That is more than is outstanding. ₹${outstanding.toFixed(2)} remains on this order.`,
      );
    }
    if (dto.mode === PaymentMode.ONLINE && dto.depositedAmount) {
      throw new BadRequestException(
        'Only cash can be deposited — an online payment is already in the bank',
      );
    }
    if (dto.depositedAmount && dto.depositedAmount > dto.amount) {
      throw new BadRequestException('Deposited amount cannot exceed the cash received');
    }

    const recorded = await this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          tenantId: tenantId(),
          orderId,
          amount: dto.amount,
          mode: dto.mode,
          reference: dto.reference,
          note: dto.note,
          receivedAt: dto.receivedAt ? new Date(dto.receivedAt) : undefined,
          receivedById: userId,
          deposits: dto.depositedAmount
            ? {
                create: {
                  tenantId: tenantId(),
                  amount: dto.depositedAmount,
                  bankReference: dto.bankReference,
                  depositedById: userId,
                },
              }
            : undefined,
        },
        include: { deposits: true },
      });

      await tx.order.update({
        where: { id: orderId },
        data: { paymentStatus: deriveStatus(total, already + dto.amount) },
      });

      return payment;
    });

    /*
     * Post it. After the transaction, not inside it: the money has been taken
     * either way, and a ledger row that could not be written is something the
     * nightly reconcile picks up rather than a reason to refuse a receipt.
     */
    await this.postReceipt(recorded, order);

    await this.notifications.raise('payment.recorded', {
      entity: 'Order',
      entityId: orderId,
      actorId: userId,
      values: {
        amount: formatAmount(dto.amount),
        order: order.code,
        client: order.client?.name,
        who: undefined,
      },
    });

    return recorded;
  }

  /**
   * Put a receipt and anything banked with it into the ledger.
   *
   * One place, so a receipt and its correction are posted by the same code —
   * the correction is the same row with a negative amount, and nothing here
   * has to know which is which.
   */
  private async postReceipt(
    payment: {
      id: string;
      orderId: string;
      amount: unknown;
      mode: PaymentMode;
      receivedAt: Date;
      reference?: string | null;
      note?: string | null;
      reason?: string | null;
      reversalOfId?: string | null;
      receivedById?: string | null;
      deposits?: {
        id: string;
        amount: unknown;
        depositedAt: Date;
        bankReference?: string | null;
        note?: string | null;
        depositedById?: string | null;
      }[];
    },
    order: { clientId?: string | null; code?: string | null; client?: { gstin?: string | null } | null },
  ): Promise<void> {
    await this.ledger.post(
      paymentPosting({ ...payment, amount: Number(payment.amount) }, order),
    );

    for (const deposit of payment.deposits ?? []) {
      await this.ledger.post(
        depositPosting({ ...deposit, amount: Number(deposit.amount) }, { orderId: payment.orderId }),
      );
    }
  }

  /** Cash walked to the bank. Attach it to a payment when it is traceable. */
  async deposit(dto: RecordDepositDto, userId?: string) {
    if (dto.paymentId) {
      const payment = await this.prisma.payment.findUnique({
        where: { id: dto.paymentId },
        include: { deposits: true },
      });
      if (!payment) throw new NotFoundException(`Payment ${dto.paymentId} not found`);
      if (payment.mode !== PaymentMode.CASH) {
        throw new BadRequestException('Only a cash payment can be deposited');
      }

      const alreadyDeposited = payment.deposits.reduce(
        (sum, d) => sum + Number(d.amount),
        0,
      );
      const remaining = round2(Number(payment.amount) - alreadyDeposited);
      if (dto.amount > remaining + 0.01) {
        throw new BadRequestException(
          `Only ₹${remaining.toFixed(2)} of that payment is still in hand`,
        );
      }
    }

    const banked = await this.prisma.cashDeposit.create({
      data: {
        tenantId: tenantId(),
        paymentId: dto.paymentId,
        amount: dto.amount,
        depositedAt: dto.depositedAt ? new Date(dto.depositedAt) : undefined,
        bankReference: dto.bankReference,
        note: dto.note,
        depositedById: userId,
      },
      include: { payment: { select: { orderId: true } } },
    });

    await this.ledger.post(
      depositPosting({ ...banked, amount: Number(banked.amount) }, banked.payment),
    );

    return banked;
  }

  /** The money picture for one order. */
  async summary(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        payments: {
          orderBy: { receivedAt: 'desc' },
          include: {
            deposits: { orderBy: { depositedAt: 'desc' } },
            receivedBy: { select: { id: true, name: true } },
            // So a list can say "taken back" against the row it happened to,
            // rather than only showing a negative figure further down.
            reversedBy: { select: { id: true, receivedAt: true, reason: true } },
          },
        },
      },
    });
    if (!order) throw new NotFoundException(`Order ${orderId} not found`);

    const total = Number(order.grandTotal);
    const received = sum(order.payments.map((p) => Number(p.amount)));
    const cash = sum(
      order.payments.filter((p) => p.mode === PaymentMode.CASH).map((p) => Number(p.amount)),
    );
    const online = sum(
      order.payments.filter((p) => p.mode === PaymentMode.ONLINE).map((p) => Number(p.amount)),
    );
    const deposited = sum(
      order.payments.flatMap((p) => p.deposits.map((d) => Number(d.amount))),
    );

    return {
      orderId,
      total: round2(total),
      received: round2(received),
      pending: round2(total - received),
      status: deriveStatus(total, received),
      /** Share paid, for a progress bar. */
      receivedPct: total > 0 ? round2((received / total) * 100) : 0,
      cash: {
        received: round2(cash),
        deposited: round2(deposited),
        /** Cash taken for this order that has not reached the bank. */
        inHand: round2(cash - deposited),
      },
      online: { received: round2(online) },
      payments: order.payments,
    };
  }

  /**
   * Cash across the whole shop.
   *
   * Read from the ledger rather than added up from the payment tables: cash
   * handed to a fitter leaves the drawer just as surely as cash walked to the
   * bank, and a figure that only knew about receipts and deposits overstated
   * what was actually there. The payout is shown on its own line — it reduces
   * the drawer, never the order it came from.
   */
  async cashPosition(query: CashPositionQueryDto) {
    const window = dateWindow(query);

    const [received, banked, paidOut, online, unallocated] = await Promise.all([
      this.total({ ...window, direction: LedgerDirection.IN, account: LedgerAccount.CASH }),
      this.total({
        ...window,
        direction: LedgerDirection.TRANSFER,
        account: LedgerAccount.CASH,
      }),
      this.total({ ...window, direction: LedgerDirection.OUT, account: LedgerAccount.CASH }),
      this.total({ ...window, direction: LedgerDirection.IN, account: LedgerAccount.BANK }),
      this.total({
        ...window,
        direction: LedgerDirection.TRANSFER,
        account: LedgerAccount.CASH,
        orderId: null,
      }),
    ]);

    return {
      cash: {
        received: received.amount,
        deposited: banked.amount,
        paidOut: paidOut.amount,
        inHand: round2(received.amount - banked.amount - paidOut.amount),
        receipts: received.count,
        depositsUnallocated: unallocated.amount,
      },
      online: { received: online.amount, receipts: online.count },
      deposits: banked.count,
    };
  }

  private async total(where: Prisma.LedgerEntryWhereInput) {
    const result = await this.prisma.ledgerEntry.aggregate({
      where,
      _sum: { amount: true },
      _count: { _all: true },
    });
    return {
      amount: round2(Number(result._sum.amount ?? 0)),
      count: result._count._all,
    };
  }

  /**
   * Every movement of money except a payout, newest first.
   *
   * One list rather than one per source, because "what happened to the money"
   * is a single question: cash taken, an online transfer, a trip to the bank —
   * and, when they arrive, expenses. It reads the ledger, so a module that
   * posts is on this screen the day it ships and one that forgets to post is
   * visibly absent rather than quietly missing.
   *
   * Payouts stay in their own ledger. They sit beside orders rather than
   * inside them, and folding them in here would be the netting-off the books
   * must not do — the filter lists the kinds it wants, so nothing arrives on
   * this screen by accident.
   */
  async transactions(query: TransactionQueryDto) {
    const where = transactionFilter(query, query.kind ? [query.kind] : TRANSACTION_KINDS);

    const [rows, count] = await Promise.all([
      this.prisma.ledgerEntry.findMany({
        where,
        orderBy: { at: 'desc' },
        skip: query.skip,
        take: query.limit,
        include: {
          recordedBy: { select: { id: true, name: true } },
          order: { select: { id: true, code: true, client: { select: { name: true } } } },
        },
      }),
      this.prisma.ledgerEntry.count({ where }),
    ]);

    return paginate(rows.map(toTransaction), count, {
      page: query.page,
      limit: query.limit,
    });
  }

  /** Cash still in hand, order by order — the list to take to the bank. */
  async cashInHandByOrder() {
    const payments = await this.prisma.payment.findMany({
      where: {
        mode: PaymentMode.CASH,
        /*
         * A receipt that was taken back, and the row that took it back, are
         * not cash in anybody's hand. They net to nothing in every total; here
         * the row is per receipt, so both sides have to be left out or the
         * original would still be counted as sitting in the drawer.
         */
        reversalOfId: null,
        reversedBy: { is: null },
      },
      include: {
        deposits: true,
        order: {
          select: { id: true, code: true, client: { select: { name: true } } },
        },
      },
      orderBy: { receivedAt: 'desc' },
    });

    return payments
      .map((payment) => {
        const deposited = sum(payment.deposits.map((d) => Number(d.amount)));
        return {
          paymentId: payment.id,
          orderId: payment.order.id,
          orderCode: payment.order.code,
          client: payment.order.client.name,
          received: round2(Number(payment.amount)),
          deposited: round2(deposited),
          inHand: round2(Number(payment.amount) - deposited),
          receivedAt: payment.receivedAt,
        };
      })
      .filter((row) => row.inHand > 0.009);
  }

  /**
   * Take a receipt back, without taking it away.
   *
   * A receipt is never edited and never deleted. Money that was entered wrongly
   * is corrected by recording its opposite: both rows stand, the order's total
   * is the sum of them, and what is left behind says what was entered, what
   * took it back, who did it and why.
   *
   * Deleting the row would have been simpler and is exactly what must not be
   * possible — it is the one edit that could make an order look settled by
   * money nobody collected, with nothing left to show it ever happened.
   */
  async reverse(paymentId: string, reason: string, userId?: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        deposits: true,
        reversedBy: { select: { id: true } },
        order: { include: { payments: true } },
      },
    });
    if (!payment) throw new NotFoundException(`Payment ${paymentId} not found`);

    if (payment.reversedBy) {
      throw new BadRequestException('That receipt has already been taken back');
    }
    if (payment.reversalOfId) {
      // Reversing a reversal is re-recording the money; do that as a receipt,
      // so the list says what actually happened.
      throw new BadRequestException(
        'That row is itself a correction. Record the payment again rather than reversing it.',
      );
    }
    if (!reason?.trim()) {
      throw new BadRequestException('Say why this receipt is being taken back');
    }

    const amount = Number(payment.amount);

    const taken = await this.prisma.$transaction(async (tx) => {
      const reversal = await tx.payment.create({
        data: {
          tenantId: tenantId(),
          orderId: payment.orderId,
          amount: -amount,
          mode: payment.mode,
          reference: payment.reference,
          note: `Takes back ${formatAmount(amount)} recorded on ${payment.receivedAt.toISOString().slice(0, 10)}`,
          reason: reason.trim(),
          reversalOfId: payment.id,
          receivedById: userId,
          /*
           * Cash that had already been banked has to be un-banked with it, or
           * the shop's cash position is short by money that never left the
           * drawer.
           */
          deposits: payment.deposits.length
            ? {
                create: payment.deposits.map((deposit) => ({
                  tenantId: tenantId(),
                  amount: -Number(deposit.amount),
                  bankReference: deposit.bankReference,
                  note: 'Takes back a deposit against a reversed receipt',
                  depositedById: userId,
                  reversalOfId: deposit.id,
                })),
              }
            : undefined,
        },
        include: { deposits: true },
      });

      const received = payment.order.payments.reduce(
        (total, one) => total + Number(one.amount),
        0,
      ) - amount;

      await tx.order.update({
        where: { id: payment.orderId },
        data: { paymentStatus: deriveStatus(Number(payment.order.grandTotal), received) },
      });

      return reversal;
    });

    await this.postReceipt(taken, payment.order);

    await this.notifications.raise('payment.reversed', {
      entity: 'Order',
      entityId: payment.orderId,
      actorId: userId,
      values: {
        amount: formatAmount(amount),
        order: payment.order.code,
        who: undefined,
        reason: reason.trim(),
      },
    });

    return taken;
  }
}

/** ₹40,000.00, for a note somebody will read months later. */
function formatAmount(amount: number): string {
  return `₹${amount.toFixed(2)}`;
}

/** One rule for the order's payment status, used everywhere it is set. */
export function deriveStatus(total: number, received: number): PaymentStatus {
  if (received <= 0.009) return PaymentStatus.PENDING;
  // A hair of tolerance: rupee rounding should not leave an order forever
  // "partial" by two paise.
  if (received >= total - 0.01) return PaymentStatus.RECEIVED;
  return PaymentStatus.PARTIAL;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

/** The `at` window a dated query asks for, or nothing at all. */
function dateWindow(query: { from?: string; to?: string }): Prisma.LedgerEntryWhereInput {
  if (!query.from && !query.to) return {};
  return {
    at: {
      ...(query.from ? { gte: new Date(query.from) } : {}),
      ...(query.to ? { lte: new Date(query.to) } : {}),
    },
  };
}

/** Which ledger rows each kind on the Transactions screen is made of. */
export const KIND_ROWS: Record<TransactionKind, Prisma.LedgerEntryWhereInput> = {
  PAYMENT_CASH: { sourceType: 'Payment', account: LedgerAccount.CASH },
  PAYMENT_ONLINE: { sourceType: 'Payment', account: LedgerAccount.BANK },
  BANK_DEPOSIT: { sourceType: 'CashDeposit' },
  EXPENSE: { sourceType: 'Expense' },
  PURCHASE: { sourceType: 'Purchase' },
  SALARY: { sourceType: 'Payslip' },
  ADVANCE: { sourceType: 'SalaryAdvance' },
};

/**
 * Ledger sources this screen deliberately leaves out, and why.
 *
 * Listed rather than simply absent. The filter above names what it wants so a
 * payout cannot arrive here by being forgotten about — but that safety turns
 * into a different bug the moment a module posts something nobody adds, which
 * is exactly what happened when purchases shipped. `transactions.spec.ts`
 * reads both lists against the source and fails on the next one.
 */
export const NOT_A_TRANSACTION: Record<string, string> = {
  Disbursement:
    'a payout: it sits beside an order rather than inside one, and folding it in here would be the netting-off the books must not do',
};

/**
 * The ledger rows one view of the Transactions screen covers.
 *
 * Pure, and exported, because what this screen may show is a rule about the
 * books: it names the kinds it wants rather than excluding the ones it does
 * not, so a payout — or anything else posted later — cannot arrive here by
 * being forgotten about.
 */
export function transactionFilter(
  query: { from?: string; to?: string; search?: string },
  kinds: readonly TransactionKind[],
): Prisma.LedgerEntryWhereInput {
  const search = query.search?.trim();
  const contains = (value: string) => ({ contains: value, mode: 'insensitive' as const });

  return {
    AND: [
      { OR: kinds.map((kind) => KIND_ROWS[kind]) },
      dateWindow(query),
      ...(search
        ? [
            {
              OR: [
                { reference: contains(search) },
                { note: contains(search) },
                { party: contains(search) },
                { order: { code: contains(search) } },
                { order: { client: { name: contains(search) } } },
              ],
            },
          ]
        : []),
    ],
  };
}

/** What kind of movement a ledger row is, on this screen's terms. */
export function kindOf(row: { sourceType: string; account: LedgerAccount }): TransactionKind {
  if (row.sourceType === 'CashDeposit') return 'BANK_DEPOSIT';
  if (row.sourceType === 'Expense') return 'EXPENSE';
  if (row.sourceType === 'Purchase') return 'PURCHASE';
  if (row.sourceType === 'Payslip') return 'SALARY';
  if (row.sourceType === 'SalaryAdvance') return 'ADVANCE';
  return row.account === LedgerAccount.CASH ? 'PAYMENT_CASH' : 'PAYMENT_ONLINE';
}

/** A ledger row as the screen reads it. */
function toTransaction(row: {
  id: string;
  sourceType: string;
  account: LedgerAccount;
  direction: LedgerDirection;
  at: Date;
  amount: Prisma.Decimal;
  reference: string | null;
  note: string | null;
  order: { id: string; code: string; client: { name: string } } | null;
  recordedBy: { id: string; name: string } | null;
}): TransactionRow {
  return {
    id: row.id,
    kind: kindOf(row),
    direction: row.direction,
    at: row.at,
    amount: round2(Number(row.amount)),
    reference: row.reference,
    note: row.note,
    order: row.order,
    by: row.recordedBy,
  };
}
