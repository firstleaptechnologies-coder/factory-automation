import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PaymentMode, PaymentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { round2 } from '../../common/utils/pricing';
import {
  CashPositionQueryDto,
  RecordDepositDto,
  RecordPaymentDto,
} from './dto/payment.dto';
import { tenantId } from '../../common/tenancy/tenant-context';

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService) {}

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
      include: { payments: true },
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

    return this.prisma.$transaction(async (tx) => {
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

  /** Cash still in hand, order by order — the list to take to the bank. */
  async cashInHandByOrder() {
    const payments = await this.prisma.payment.findMany({
      where: { mode: PaymentMode.CASH },
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

  async remove(paymentId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { order: { include: { payments: true } } },
    });
    if (!payment) throw new NotFoundException(`Payment ${paymentId} not found`);

    return this.prisma.$transaction(async (tx) => {
      await tx.payment.delete({ where: { id: paymentId } });

      const remaining = payment.order.payments
        .filter((p) => p.id !== paymentId)
        .reduce((total, p) => total + Number(p.amount), 0);

      await tx.order.update({
        where: { id: payment.orderId },
        data: { paymentStatus: deriveStatus(Number(payment.order.grandTotal), remaining) },
      });

      return { deleted: paymentId };
    });
  }
}

/** One rule for the order's payment status, used everywhere it is set. */
function deriveStatus(total: number, received: number): PaymentStatus {
  if (received <= 0.009) return PaymentStatus.PENDING;
  // A hair of tolerance: rupee rounding should not leave an order forever
  // "partial" by two paise.
  if (received >= total - 0.01) return PaymentStatus.RECEIVED;
  return PaymentStatus.PARTIAL;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
