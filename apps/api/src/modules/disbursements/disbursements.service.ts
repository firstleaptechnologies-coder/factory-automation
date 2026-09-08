import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DisbursementStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { LedgerService } from '../ledger/ledger.service';
import { disbursementPosting } from '../ledger/postings';
import { tenantId } from '../../common/tenancy/tenant-context';
import { paginate } from '../../common/dto/pagination.dto';
import { round2 } from '../../common/utils/pricing';
import {
  CategoryDto,
  CreateDisbursementDto,
  DisbursementQueryDto,
  SettleDisbursementDto,
  UpdateDisbursementDto,
} from './dto/disbursement.dto';

/** Falls back to this when a tenant has not named these charges. */
const DEFAULT_LABEL = 'ISC';
const LABEL_KEY = 'disbursementLabel';

const INCLUDE = {
  category: true,
  recordedBy: { select: { id: true, name: true } },
} as const;

/**
 * Payouts made out of an order once the client's money has arrived.
 *
 * These sit beside the order rather than inside it. An order quoted at ₹X is
 * worth ₹X and is settled when ₹X is collected; what the shop then owes a
 * fitter or a transporter is a separate obligation. Netting the two would
 * understate revenue and leave the books disagreeing with the GST already
 * charged on that order — so nothing here touches the order's total or its
 * payment status.
 */
@Injectable()
export class DisbursementsService {
  constructor(
    private readonly prisma: PrismaService,
    // Named for what it is rather than `ledger`, which this service already
    // uses for the payout ledger the accountant reconciles.
    private readonly books: LedgerService,
  ) {}

  /** What this tenant calls these charges. */
  async label(): Promise<string> {
    const setting = await this.prisma.appSetting.findFirst({ where: { key: LABEL_KEY } });
    return typeof setting?.value === 'string' ? setting.value : DEFAULT_LABEL;
  }

  async setLabel(label: string): Promise<{ label: string }> {
    await this.prisma.appSetting.upsert({
      where: { tenantId_key: { tenantId: tenantId(), key: LABEL_KEY } },
      update: { value: label },
      create: { tenantId: tenantId(), key: LABEL_KEY, value: label },
    });
    return { label };
  }

  // -- categories -----------------------------------------------------------

  listCategories(includeInactive = false) {
    return this.prisma.disbursementCategory.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  createCategory(dto: CategoryDto) {
    return this.prisma.disbursementCategory.create({
      data: {
        tenantId: tenantId(),
        code: dto.code.toUpperCase(),
        name: dto.name,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  async deactivateCategory(id: string) {
    return this.prisma.disbursementCategory.update({
      where: { id },
      data: { isActive: false },
    });
  }

  // -- per order ------------------------------------------------------------

  async forOrder(orderId: string) {
    const order = await this.prisma.order.findFirst({ where: { id: orderId } });
    if (!order) throw new NotFoundException(`Order ${orderId} not found`);

    const rows = await this.prisma.disbursement.findMany({
      where: { orderId, status: { not: DisbursementStatus.CANCELLED } },
      orderBy: { createdAt: 'desc' },
      include: INCLUDE,
    });

    const total = sum(rows.map((row) => Number(row.amount)));
    const paid = sum(
      rows
        .filter((row) => row.status === DisbursementStatus.PAID)
        .map((row) => Number(row.amount)),
    );

    return {
      orderId,
      label: await this.label(),
      total: round2(total),
      paid: round2(paid),
      pending: round2(total - paid),
      count: rows.length,
      disbursements: rows,
    };
  }

  async create(orderId: string, dto: CreateDisbursementDto, userId?: string) {
    const order = await this.prisma.order.findFirst({ where: { id: orderId } });
    if (!order) throw new NotFoundException(`Order ${orderId} not found`);

    const settled = dto.status === DisbursementStatus.PAID;
    if (settled && !dto.paidMode) {
      throw new BadRequestException('Say how it was paid — cash or online');
    }

    return this.prisma.disbursement.create({
      data: {
        tenantId: tenantId(),
        orderId,
        categoryId: dto.categoryId,
        payeeName: dto.payeeName,
        payeeContact: dto.payeeContact,
        amount: dto.amount,
        status: dto.status ?? DisbursementStatus.PLANNED,
        paidMode: dto.paidMode,
        paidAt: settled ? (dto.paidAt ? new Date(dto.paidAt) : new Date()) : null,
        reference: dto.reference,
        note: dto.note,
        recordedById: userId,
      },
      include: INCLUDE,
    });
  }

  async settle(id: string, dto: SettleDisbursementDto, userId?: string) {
    const row = await this.prisma.disbursement.findFirst({ where: { id } });
    if (!row) throw new NotFoundException('Payout not found');
    if (row.status === DisbursementStatus.PAID) {
      throw new BadRequestException('That payout is already settled');
    }

    const settled = await this.prisma.disbursement.update({
      where: { id },
      data: {
        status: DisbursementStatus.PAID,
        paidMode: dto.paidMode,
        paidAt: dto.paidAt ? new Date(dto.paidAt) : new Date(),
        reference: dto.reference,
        note: dto.note ?? row.note,
        recordedById: userId ?? row.recordedById,
      },
      include: INCLUDE,
    });

    /*
     * Posted now rather than when it was planned: a planned payout is an
     * intention, and an intention is not a movement of money. It sits beside
     * the order it came from and never reduces what that order collected.
     */
    await this.books.post(
      disbursementPosting({ ...settled, amount: Number(settled.amount) }),
    );

    return settled;
  }

  /**
   * Takes a settled payout back.
   *
   * The mirror of taking a receipt back, and for the same reason: the money
   * has gone, so the correction is the opposite row rather than the removal of
   * the first one. Both stand — what was paid, what took it back, who did it
   * and why — and the ledger, this screen and the shop's bank statement can be
   * reconciled against each other afterwards.
   *
   * A payout that was only planned is cancelled instead: an intention is not a
   * movement of money, and there is nothing to take back.
   */
  async reverse(id: string, reason: string, userId?: string) {
    const payout = await this.prisma.disbursement.findFirst({
      where: { id },
      include: { ...INCLUDE, reversedBy: { select: { id: true } } },
    });
    if (!payout) throw new NotFoundException('Payout not found');

    if (payout.status !== DisbursementStatus.PAID) {
      throw new BadRequestException(
        'That payout has not been paid yet — cancel it rather than taking it back',
      );
    }
    if (payout.reversedBy) {
      throw new BadRequestException('That payout has already been taken back');
    }
    if (payout.reversalOfId) {
      throw new BadRequestException(
        'That row is itself a correction. Record the payout again rather than reversing it.',
      );
    }
    if (!reason?.trim()) {
      throw new BadRequestException('Say why this payout is being taken back');
    }

    const amount = Number(payout.amount);
    const taken = await this.prisma.disbursement.create({
      data: {
        tenantId: tenantId(),
        orderId: payout.orderId,
        categoryId: payout.categoryId,
        payeeName: payout.payeeName,
        payeeContact: payout.payeeContact,
        amount: -amount,
        // Paid, like the row it takes back: a correction to money that moved
        // is itself money moving, and a planned one would sit in the "still
        // owed" column claiming the shop owes somebody a negative amount.
        status: DisbursementStatus.PAID,
        paidMode: payout.paidMode,
        paidAt: new Date(),
        reference: payout.reference,
        note: `Takes back ₹${amount.toFixed(2)} paid on ${
          payout.paidAt ? payout.paidAt.toISOString().slice(0, 10) : 'an earlier date'
        }`,
        reason: reason.trim(),
        reversalOfId: payout.id,
        recordedById: userId,
      },
      include: INCLUDE,
    });

    await this.books.post(
      disbursementPosting({ ...taken, amount: Number(taken.amount) }),
    );

    return taken;
  }

  async update(id: string, dto: UpdateDisbursementDto) {
    const row = await this.prisma.disbursement.findFirst({ where: { id } });
    if (!row) throw new NotFoundException('Payout not found');
    return this.prisma.disbursement.update({ where: { id }, data: dto, include: INCLUDE });
  }

  async remove(id: string) {
    const row = await this.prisma.disbursement.findFirst({ where: { id } });
    if (!row) throw new NotFoundException('Payout not found');

    /*
     * A payout that was settled has already left the drawer, and its ledger
     * row says so. Cancelling it here would take it off this screen while the
     * books went on counting the money as spent — the two disagreeing quietly,
     * which is the one thing the ledger exists to prevent. Money that actually
     * came back is a new record, not the erasure of an old one.
     */
    if (row.status === DisbursementStatus.PAID) {
      throw new BadRequestException(
        'That payout has already been paid — take it back rather than cancelling it',
      );
    }

    // Cancelled rather than deleted: a planned payout that was dropped is
    // still something the shop may want to see it decided against.
    return this.prisma.disbursement.update({
      where: { id },
      data: { status: DisbursementStatus.CANCELLED },
      include: INCLUDE,
    });
  }

  // -- ledger ---------------------------------------------------------------

  /** Every payout across every order — the view the accountant reconciles. */
  async ledger(query: DisbursementQueryDto) {
    const where = ledgerFilter(query);

    const [rows, count] = await Promise.all([
      this.prisma.disbursement.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.limit,
        include: {
          ...INCLUDE,
          order: { select: { id: true, code: true, client: { select: { name: true } } } },
        },
      }),
      this.prisma.disbursement.count({ where }),
    ]);

    // Totals describe the whole filtered ledger, not the page in hand — an
    // accountant reading "committed" wants the figure for everything matching,
    // and a per-page sum would silently change as they scrolled.
    const totals = await this.totalsFor(where);

    return {
      label: await this.label(),
      totals,
      ...paginate(rows, count, { page: query.page, limit: query.limit }),
    };
  }

  private async totalsFor(where: Prisma.DisbursementWhereInput) {
    const [all, paid] = await Promise.all([
      this.prisma.disbursement.aggregate({ where, _sum: { amount: true }, _count: true }),
      this.prisma.disbursement.aggregate({
        // Intersected, not overridden: spreading a second `status` onto the
        // filter would replace it, so asking for cancelled rows reported the
        // paid total of a different set entirely.
        where: paidWithin(where),
        _sum: { amount: true },
      }),
    ]);

    const total = Number(all._sum.amount ?? 0);
    const settled = Number(paid._sum.amount ?? 0);
    return {
      total: round2(total),
      paid: round2(settled),
      pending: round2(total - settled),
      count: all._count,
    };
  }
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

/**
 * The rows one view of the ledger covers.
 *
 * Extracted so the filter can be reasoned about on its own: the rows on screen
 * and the totals above them are both built from this, and they drifted apart
 * once already when they were derived separately.
 */
export function ledgerFilter(query: {
  status?: DisbursementStatus;
  categoryId?: string;
  search?: string;
  from?: string;
  to?: string;
}): Prisma.DisbursementWhereInput {
  return {
    // Cancelled payouts are hidden unless they are what was asked for.
    status: query.status ?? { not: DisbursementStatus.CANCELLED },
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    ...(query.search
      ? {
          OR: [
            { payeeName: { contains: query.search, mode: 'insensitive' as const } },
            { order: { code: { contains: query.search, mode: 'insensitive' as const } } },
          ],
        }
      : {}),
    ...(query.from || query.to
      ? {
          createdAt: {
            ...(query.from ? { gte: new Date(query.from) } : {}),
            ...(query.to ? { lte: new Date(query.to) } : {}),
          },
        }
      : {}),
  };
}

/**
 * The filter for the paid subset of a view.
 *
 * Intersected, never spread: adding a second `status` onto the filter object
 * replaces the first, which once made "show me cancelled payouts" report the
 * paid total of a completely different set.
 */
export function paidWithin(
  where: Prisma.DisbursementWhereInput,
): Prisma.DisbursementWhereInput {
  return { AND: [where, { status: DisbursementStatus.PAID }] };
}
