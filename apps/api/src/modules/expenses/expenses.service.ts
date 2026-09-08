import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AttachmentKind, ExpenseOptionField, LedgerAccount, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { FilesService, IncomingFile } from '../files/files.service';
import { LedgerService } from '../ledger/ledger.service';
import { accountForPaymentType, expensePosting } from '../ledger/postings';
import { tenantId } from '../../common/tenancy/tenant-context';
import { paginate } from '../../common/dto/pagination.dto';
import { round2 } from '../../common/utils/pricing';
import {
  ExpenseAnalyticsQueryDto,
  ExpenseDto,
  ExpenseOptionDto,
  ExpenseQueryDto,
  ReorderExpenseOptionsDto,
  UpdateExpenseOptionDto,
} from './dto/expense.dto';

const INCLUDE = {
  createdBy: { select: { id: true, name: true } },
  order: { select: { id: true, code: true, client: { select: { name: true } } } },
  bill: { select: { id: true, fileName: true, mimeType: true, byteSize: true } },
} as const;

/** The gap between options, so one can be dropped between two others. */
const SORT_STEP = 10;

/**
 * What the shop spent, and on what.
 *
 * Everything the business pays for that is not a payout against a particular
 * order. It posts to the ledger like every other movement of money, so cash
 * spent leaves the drawer and the figure on the Transactions screen is the
 * shop's actual position rather than its takings.
 *
 * Every list on the form is a row in `ExpenseOption`, editable by the shop.
 * That is the whole design: a shop that starts buying from a new supplier, or
 * hires someone who will be paying for things, should not need us.
 */
@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly files: FilesService,
  ) {}

  // -- options --------------------------------------------------------------

  /** Every option, active or not — the config screen. */
  listOptions(field?: ExpenseOptionField) {
    return this.prisma.expenseOption.findMany({
      where: field ? { field } : {},
      orderBy: [{ field: 'asc' }, { sortOrder: 'asc' }, { label: 'asc' }],
    });
  }

  /** What the form should offer, grouped the way it asks for it. */
  async optionsForForm(): Promise<Record<ExpenseOptionField, string[]>> {
    const rows = await this.prisma.expenseOption.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    });

    const grouped = {
      PAYMENT_TYPE: [],
      DONE_BY: [],
      VENDOR: [],
      SPENT_TYPE: [],
      TO_NAME: [],
    } as Record<ExpenseOptionField, string[]>;
    for (const row of rows) grouped[row.field].push(row.label);
    return grouped;
  }

  async createOption(dto: ExpenseOptionDto) {
    const label = dto.label.trim();
    if (!label) throw new BadRequestException('Give the option a name');

    // Appended rather than inserted: a new option belongs at the bottom until
    // somebody says otherwise.
    const last = await this.prisma.expenseOption.findFirst({
      where: { field: dto.field },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });

    try {
      return await this.prisma.expenseOption.create({
        data: {
          tenantId: tenantId(),
          field: dto.field,
          label,
          account: dto.field === ExpenseOptionField.PAYMENT_TYPE ? dto.account : null,
          sortOrder: (last?.sortOrder ?? 0) + SORT_STEP,
        },
      });
    } catch (error) {
      throw duplicateOrThrow(error, label);
    }
  }

  async updateOption(id: string, dto: UpdateExpenseOptionDto) {
    const row = await this.prisma.expenseOption.findFirst({ where: { id } });
    if (!row) throw new NotFoundException('Option not found');

    try {
      return await this.prisma.expenseOption.update({
        where: { id },
        data: {
          ...(dto.label !== undefined ? { label: dto.label.trim() } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
          // Only a way of paying has an account; the other four fields would
          // be claiming something they cannot know.
          ...(dto.account !== undefined && row.field === ExpenseOptionField.PAYMENT_TYPE
            ? { account: dto.account }
            : {}),
        },
      });
    } catch (error) {
      throw duplicateOrThrow(error, dto.label ?? row.label);
    }
  }

  /**
   * Retired, not deleted.
   *
   * Expenses store the label rather than the id, so a removed option leaves
   * last March's rows alone — but the option itself is worth keeping, because
   * a shop that hid "Diesel" by accident should be able to bring it back.
   */
  async removeOption(id: string) {
    const row = await this.prisma.expenseOption.findFirst({ where: { id } });
    if (!row) throw new NotFoundException('Option not found');
    return this.prisma.expenseOption.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async reorderOptions(dto: ReorderExpenseOptionsDto) {
    const rows = await this.prisma.expenseOption.findMany({
      where: { id: { in: dto.orderedIds }, field: dto.field },
      select: { id: true },
    });
    if (rows.length !== dto.orderedIds.length) {
      throw new BadRequestException('Those options are not all in this list');
    }

    await this.prisma.$transaction(
      dto.orderedIds.map((id, index) =>
        this.prisma.expenseOption.update({
          where: { id },
          data: { sortOrder: (index + 1) * SORT_STEP },
        }),
      ),
    );
    return this.listOptions(dto.field);
  }

  // -- expenses -------------------------------------------------------------

  async list(query: ExpenseQueryDto) {
    const where = expenseFilter(query);

    const [rows, count, total] = await Promise.all([
      this.prisma.expense.findMany({
        where,
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        skip: query.skip,
        take: query.limit,
        include: INCLUDE,
      }),
      this.prisma.expense.count({ where }),
      this.prisma.expense.aggregate({ where, _sum: { amount: true } }),
    ]);

    return {
      // The whole filtered set, not the page in hand: a total that changed as
      // somebody scrolled would answer a question nobody asked.
      total: round2(Number(total._sum.amount ?? 0)),
      ...paginate(rows, count, { page: query.page, limit: query.limit }),
    };
  }

  async get(id: string) {
    const row = await this.prisma.expense.findFirst({
      where: { id },
      include: INCLUDE,
    });
    if (!row) throw new NotFoundException('Expense not found');
    return row;
  }

  async create(dto: ExpenseDto, userId?: string) {
    const data = await this.rowFrom(dto);
    const created = await this.prisma.expense.create({
      data: { tenantId: tenantId(), ...data, createdById: userId },
      include: INCLUDE,
    });

    await this.postSpend(created);
    return created;
  }

  async update(id: string, dto: ExpenseDto) {
    const existing = await this.prisma.expense.findFirst({ where: { id } });
    if (!existing) throw new NotFoundException('Expense not found');

    const updated = await this.prisma.expense.update({
      where: { id },
      data: await this.rowFrom(dto),
      include: INCLUDE,
    });

    // Posted again rather than left alone: the ledger row is keyed on this
    // expense, so a corrected amount corrects the books in the same breath.
    await this.postSpend(updated);
    return updated;
  }

  /**
   * Removed, and its ledger row with it.
   *
   * An expense is the shop's own note of its own spending, and a duplicate row
   * typed at the counter is a mistake rather than an event — unlike a receipt
   * from a client or a payout to a fitter, which are things that happened to
   * somebody else and are corrected by a further record. Nothing is concealed
   * by this: the audit trail keeps the deleted row in full, with who deleted
   * it, and the books stay in step because both go together.
   */
  async remove(id: string) {
    const row = await this.prisma.expense.findFirst({ where: { id } });
    if (!row) throw new NotFoundException('Expense not found');

    await this.prisma.$transaction([
      this.prisma.ledgerEntry.deleteMany({
        where: { sourceType: 'Expense', sourceId: id },
      }),
      this.prisma.expense.delete({ where: { id } }),
    ]);
    return { id };
  }

  /**
   * The bill, photographed at the counter.
   *
   * Optimised as a size image rather than a reference one: a bill is read, not
   * looked at, and the harder compression that suits a picture of a finished
   * panel turns a printed rate into a smudge.
   */
  async attachBill(id: string, upload: IncomingFile, userId?: string) {
    const row = await this.prisma.expense.findFirst({ where: { id } });
    if (!row) throw new NotFoundException('Expense not found');

    const file = await this.files.ingest(upload, AttachmentKind.SIZE_IMAGE, userId);
    return this.prisma.expense.update({
      where: { id },
      data: { billFileId: file.id },
      include: INCLUDE,
    });
  }

  /**
   * Unpins the bill without deleting the file.
   *
   * The same photograph may have been stored once and pointed at from more
   * than one place, and a shop replacing a blurry shot is not asking for the
   * old bytes to be destroyed.
   */
  async removeBill(id: string) {
    const row = await this.prisma.expense.findFirst({ where: { id } });
    if (!row) throw new NotFoundException('Expense not found');
    return this.prisma.expense.update({
      where: { id },
      data: { billFileId: null },
      include: INCLUDE,
    });
  }

  /** What was spent, cut whichever way the screen is asking. */
  async analytics(query: ExpenseAnalyticsQueryDto) {
    const where = expenseFilter(query);
    const rows = await this.prisma.expense.findMany({
      where,
      select: {
        date: true,
        amount: true,
        spentType: true,
        doneBy: true,
        paymentType: true,
        vendor: true,
        toName: true,
      },
    });

    const spends = rows.map((row) => ({ ...row, amount: Number(row.amount) }));
    return {
      total: round2(spends.reduce((sum, row) => sum + row.amount, 0)),
      count: spends.length,
      monthly: monthlySeries(spends),
      bySpentType: groupBy(spends, 'spentType'),
      byDoneBy: groupBy(spends, 'doneBy'),
      byPaymentType: groupBy(spends, 'paymentType'),
      byVendor: groupBy(spends, 'vendor'),
      // The long tail of recipients is not a chart anybody reads.
      byToName: groupBy(spends, 'toName').slice(0, 15),
    };
  }

  // -- internals ------------------------------------------------------------

  /** The columns an expense is written from, whichever way it arrived. */
  private async rowFrom(dto: ExpenseDto) {
    if (dto.orderId) {
      const order = await this.prisma.order.findFirst({
        where: { id: dto.orderId },
        select: { id: true },
      });
      if (!order) throw new NotFoundException(`Order ${dto.orderId} not found`);
    }

    return {
      date: dateOnly(dto.date),
      description: dto.description.trim(),
      amount: dto.amount,
      paymentType: dto.paymentType.trim(),
      doneBy: dto.doneBy.trim(),
      toName: dto.toName.trim(),
      vendor: dto.vendor.trim(),
      spentType: dto.spentType.trim(),
      note: dto.note?.trim() || null,
      vendorGstin: dto.vendorGstin?.trim().toUpperCase() || null,
      taxableValue: dto.taxableValue ?? null,
      taxAmount: dto.taxAmount ?? null,
      itcEligible: dto.itcEligible ?? false,
      billFileId: dto.billFileId ?? null,
      orderId: dto.orderId ?? null,
    };
  }

  /** Which drawer this expense came out of, and the posting for it. */
  private async postSpend(expense: {
    id: string;
    date: Date;
    amount: Prisma.Decimal;
    description: string;
    paymentType: string;
    spentType: string;
    toName: string;
    vendor: string;
    vendorGstin: string | null;
    taxAmount: Prisma.Decimal | null;
    note: string | null;
    orderId: string | null;
    createdById: string | null;
  }) {
    const option = await this.prisma.expenseOption.findFirst({
      where: {
        field: ExpenseOptionField.PAYMENT_TYPE,
        label: expense.paymentType,
      },
      select: { account: true },
    });

    await this.ledger.post(
      expensePosting(
        {
          ...expense,
          amount: Number(expense.amount),
          taxAmount: expense.taxAmount == null ? null : Number(expense.taxAmount),
        },
        accountForPaymentType(expense.paymentType, option),
      ),
    );
  }
}

/** A calendar day, held as UTC midnight so the column means what was typed. */
export function dateOnly(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) throw new BadRequestException(`That is not a date: ${value}`);
  const [, year, month, day] = match;
  return new Date(`${year}-${month}-${day}T00:00:00.000Z`);
}

/**
 * The expenses one view covers.
 *
 * Pure and exported: the rows on a screen and the totals above them are built
 * from this, and figures derived separately have drifted apart before.
 */
export function expenseFilter(query: {
  from?: string;
  to?: string;
  spentType?: string;
  doneBy?: string;
  paymentType?: string;
  vendor?: string;
  orderId?: string;
  search?: string;
}): Prisma.ExpenseWhereInput {
  const search = query.search?.trim();
  const contains = (value: string) => ({ contains: value, mode: 'insensitive' as const });

  return {
    ...(query.from || query.to
      ? {
          date: {
            ...(query.from ? { gte: dateOnly(query.from) } : {}),
            ...(query.to ? { lte: dateOnly(query.to) } : {}),
          },
        }
      : {}),
    ...(query.spentType ? { spentType: query.spentType } : {}),
    ...(query.doneBy ? { doneBy: query.doneBy } : {}),
    ...(query.paymentType ? { paymentType: query.paymentType } : {}),
    ...(query.vendor ? { vendor: query.vendor } : {}),
    ...(query.orderId ? { orderId: query.orderId } : {}),
    ...(search
      ? {
          OR: [
            { description: contains(search) },
            { toName: contains(search) },
            { note: contains(search) },
            { vendor: contains(search) },
          ],
        }
      : {}),
  };
}

export interface Slice {
  label: string;
  amount: number;
  count: number;
}

/** Spending cut by one of its labels, biggest first. */
export function groupBy(
  rows: { amount: number }[],
  field: 'spentType' | 'doneBy' | 'paymentType' | 'vendor' | 'toName',
): Slice[] {
  const totals = new Map<string, Slice>();
  for (const row of rows) {
    const label = String((row as Record<string, unknown>)[field] ?? '—') || '—';
    const slice = totals.get(label) ?? { label, amount: 0, count: 0 };
    slice.amount = round2(slice.amount + row.amount);
    slice.count += 1;
    totals.set(label, slice);
  }
  return [...totals.values()].sort((a, b) => b.amount - a.amount);
}

/** Month by month, oldest first. Keyed YYYY-MM so it sorts as text. */
export function monthlySeries(
  rows: { date: Date; amount: number }[],
): { month: string; amount: number }[] {
  const months = new Map<string, number>();
  for (const row of rows) {
    const key = row.date.toISOString().slice(0, 7);
    months.set(key, round2((months.get(key) ?? 0) + row.amount));
  }
  return [...months.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, amount]) => ({ month, amount }));
}

/** A clashing label is the shop's mistake to see, not a stack trace. */
function duplicateOrThrow(error: unknown, label: string): unknown {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  ) {
    return new BadRequestException(`"${label}" is already on that list`);
  }
  return error;
}
