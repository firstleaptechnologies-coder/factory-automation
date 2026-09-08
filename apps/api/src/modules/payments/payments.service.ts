import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PaymentMode, PaymentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { round2 } from '../../common/utils/pricing';
import {
  CashPositionQueryDto,
  RecordDepositDto,
  RecordPaymentDto,
  TRANSACTION_KINDS,
  TransactionQueryDto,
} from './dto/payment.dto';
import { paginate } from '../../common/dto/pagination.dto';
import { tenantId } from '../../common/tenancy/tenant-context';

/** One movement of money, whatever kind it was. */
export interface TransactionRow {
  id: string;
  kind: 'PAYMENT_CASH' | 'PAYMENT_ONLINE' | 'BANK_DEPOSIT';
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
      include: { payments: true, client: { select: { name: true } } },
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

    return this.prisma.cashDeposit.create({
      data: {
        tenantId: tenantId(),
        paymentId: dto.paymentId,
        amount: dto.amount,
        depositedAt: dto.depositedAt ? new Date(dto.depositedAt) : undefined,
        bankReference: dto.bankReference,
        note: dto.note,
        depositedById: userId,
      },
    });
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
   * Deposits that were not attributed to a payment still reduce what is in
   * hand — one trip to the bank often covers several orders' takings — so they
   * are counted here even though no single order can claim them.
   */
  async cashPosition(query: CashPositionQueryDto) {
    const where = query.from || query.to
      ? {
          receivedAt: {
            ...(query.from ? { gte: new Date(query.from) } : {}),
            ...(query.to ? { lte: new Date(query.to) } : {}),
          },
        }
      : {};

    const [cashPayments, onlinePayments, allDeposits, unallocated] = await Promise.all([
      this.prisma.payment.aggregate({
        where: { ...where, mode: PaymentMode.CASH },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      this.prisma.payment.aggregate({
        where: { ...where, mode: PaymentMode.ONLINE },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      this.prisma.cashDeposit.aggregate({ _sum: { amount: true }, _count: { _all: true } }),
      this.prisma.cashDeposit.aggregate({
        where: { paymentId: null },
        _sum: { amount: true },
      }),
    ]);

    const cashReceived = Number(cashPayments._sum.amount ?? 0);
    const depositedTotal = Number(allDeposits._sum.amount ?? 0);

    return {
      cash: {
        received: round2(cashReceived),
        deposited: round2(depositedTotal),
        inHand: round2(cashReceived - depositedTotal),
        receipts: cashPayments._count._all,
        depositsUnallocated: round2(Number(unallocated._sum.amount ?? 0)),
      },
      online: {
        received: round2(Number(onlinePayments._sum.amount ?? 0)),
        receipts: onlinePayments._count._all,
      },
      deposits: allDeposits._count._all,
    };
  }

  /**
   * Every movement of money except a payout, newest first.
   *
   * One list rather than one per source, because "what happened to the money"
   * is a single question: cash taken, an online transfer, a trip to the bank —
   * and, when they arrive, expenses. Payouts stay in their own ledger; they sit
   * beside orders rather than inside them, and folding them in here would be
   * the netting-off the books must not do.
   *
   * Assembled in memory rather than in SQL because the sources are separate
   * tables with different shapes. Each is asked for at most the rows that could
   * reach the requested page, so the work does not grow with the ledger.
   */
  async transactions(query: TransactionQueryDto) {
    const kinds = query.kind ? [query.kind] : [...TRANSACTION_KINDS];
    const window = {
      ...(query.from ? { gte: new Date(query.from) } : {}),
      ...(query.to ? { lte: new Date(query.to) } : {}),
    };
    const dated = query.from || query.to;
    const search = query.search?.trim();
    const reach = query.skip + query.limit;

    const wantsCash = kinds.includes('PAYMENT_CASH');
    const wantsOnline = kinds.includes('PAYMENT_ONLINE');
    const wantsDeposits = kinds.includes('BANK_DEPOSIT');

    const paymentWhere: Prisma.PaymentWhereInput = {
      ...(dated ? { receivedAt: window } : {}),
      ...(wantsCash && wantsOnline
        ? {}
        : { mode: wantsCash ? PaymentMode.CASH : PaymentMode.ONLINE }),
      ...(search
        ? {
            OR: [
              { reference: { contains: search, mode: 'insensitive' as const } },
              { note: { contains: search, mode: 'insensitive' as const } },
              { order: { code: { contains: search, mode: 'insensitive' as const } } },
              {
                order: {
                  client: { name: { contains: search, mode: 'insensitive' as const } },
                },
              },
            ],
          }
        : {}),
    };

    const depositWhere: Prisma.CashDepositWhereInput = {
      ...(dated ? { depositedAt: window } : {}),
      ...(search
        ? {
            OR: [
              { bankReference: { contains: search, mode: 'insensitive' as const } },
              { note: { contains: search, mode: 'insensitive' as const } },
              {
                payment: {
                  order: { code: { contains: search, mode: 'insensitive' as const } },
                },
              },
            ],
          }
        : {}),
    };

    const wantsPayments = wantsCash || wantsOnline;

    const [payments, deposits, paymentCount, depositCount] = await Promise.all([
      wantsPayments
        ? this.prisma.payment.findMany({
            where: paymentWhere,
            orderBy: { receivedAt: 'desc' },
            take: reach,
            include: {
              receivedBy: { select: { id: true, name: true } },
              order: {
                select: { id: true, code: true, client: { select: { name: true } } },
              },
            },
          })
        : [],
      wantsDeposits
        ? this.prisma.cashDeposit.findMany({
            where: depositWhere,
            orderBy: { depositedAt: 'desc' },
            take: reach,
            include: {
              depositedBy: { select: { id: true, name: true } },
              payment: {
                select: {
                  order: {
                    select: { id: true, code: true, client: { select: { name: true } } },
                  },
                },
              },
            },
          })
        : [],
      wantsPayments ? this.prisma.payment.count({ where: paymentWhere }) : 0,
      wantsDeposits ? this.prisma.cashDeposit.count({ where: depositWhere }) : 0,
    ]);

    const rows: TransactionRow[] = [
      ...payments.map((payment) => ({
        id: `payment:${payment.id}`,
        kind:
          payment.mode === PaymentMode.CASH
            ? ('PAYMENT_CASH' as const)
            : ('PAYMENT_ONLINE' as const),
        // Money arriving. A deposit is the same money moving, which is why the
        // two must never be added together.
        direction: 'IN' as const,
        at: payment.receivedAt,
        amount: round2(Number(payment.amount)),
        reference: payment.reference,
        note: payment.note,
        order: payment.order,
        by: payment.receivedBy,
      })),
      ...deposits.map((deposit) => ({
        id: `deposit:${deposit.id}`,
        kind: 'BANK_DEPOSIT' as const,
        // Cash the shop already had, now in the bank: it changes where the
        // money is, not how much of it there is.
        direction: 'TRANSFER' as const,
        at: deposit.depositedAt,
        amount: round2(Number(deposit.amount)),
        reference: deposit.bankReference,
        note: deposit.note,
        order: deposit.payment?.order ?? null,
        by: deposit.depositedBy,
      })),
    ]
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .slice(query.skip, reach);

    return paginate(rows, paymentCount + depositCount, {
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
