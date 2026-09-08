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

    await this.record(created.id, 'CREATED', [], dto.note, userId);
    await this.postSpend(created);
    return created;
  }

  async update(id: string, dto: ExpenseDto, userId?: string) {
    const existing = await this.prisma.expense.findFirst({ where: { id } });
    if (!existing) throw new NotFoundException('Expense not found');
    if (existing.reversalOfId) {
      throw new BadRequestException(
        'That row is a correction of another expense. Edit the one it corrects.',
      );
    }

    const proposed = await this.rowFrom(dto);
    const changes = diffExpense(existing, proposed);

    const updated = await this.prisma.expense.update({
      where: { id },
      data: proposed,
      include: INCLUDE,
    });

    // Nothing written when nothing moved: a log of edits that changed no field
    // is a log nobody reads twice.
    if (changes.length) {
      await this.record(id, 'UPDATED', changes, dto.editNote, userId);
    }

    // Posted again rather than left alone: the ledger row is keyed on this
    // expense, so a corrected amount corrects the books in the same breath.
    await this.postSpend(updated);
    return updated;
  }

  /**
   * Taken back, not deleted.
   *
   * The opposite row is recorded and both stand: what was entered, what took
   * it back, who did it and why. An expense is money that moved, and the one
   * thing the books must never allow is a figure quietly becoming a different
   * figure — so this works exactly as taking a receipt back does, and for the
   * same reason.
   */
  async reverse(id: string, reason: string, userId?: string) {
    const expense = await this.prisma.expense.findFirst({
      where: { id },
      include: { reversedBy: { select: { id: true } } },
    });
    if (!expense) throw new NotFoundException('Expense not found');

    if (expense.reversedBy) {
      throw new BadRequestException('That expense has already been taken back');
    }
    if (expense.reversalOfId) {
      // Reversing a reversal is spending the money again; record it as an
      // expense, so the list says what actually happened.
      throw new BadRequestException(
        'That row is itself a correction. Record the expense again rather than reversing it.',
      );
    }
    if (!reason?.trim()) {
      throw new BadRequestException('Say why this expense is being taken back');
    }

    const amount = Number(expense.amount);
    const taken = await this.prisma.expense.create({
      data: {
        tenantId: tenantId(),
        date: expense.date,
        description: expense.description,
        amount: -amount,
        paymentType: expense.paymentType,
        doneBy: expense.doneBy,
        toName: expense.toName,
        vendor: expense.vendor,
        spentType: expense.spentType,
        note: `Takes back ₹${amount.toFixed(2)} recorded on ${expense.date
          .toISOString()
          .slice(0, 10)}`,
        // The tax comes back with it, or the accountant claims credit on a
        // bill the shop has just said it never paid.
        vendorGstin: expense.vendorGstin,
        taxableValue: expense.taxableValue == null ? null : -Number(expense.taxableValue),
        taxAmount: expense.taxAmount == null ? null : -Number(expense.taxAmount),
        itcEligible: expense.itcEligible,
        orderId: expense.orderId,
        reason: reason.trim(),
        reversalOfId: expense.id,
        createdById: userId,
      },
      include: INCLUDE,
    });

    await this.record(expense.id, 'REVERSED', [], reason.trim(), userId);
    await this.postSpend(taken);
    return taken;
  }

  /** What changed on one expense, and why — newest first. */
  editHistory(id: string) {
    return this.prisma.expenseEditHistory.findMany({
      where: { expenseId: id },
      orderBy: { createdAt: 'desc' },
    });
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

  /**
   * One line in the expense's own story.
   *
   * The user's name is copied onto the row rather than only referenced: the
   * moment somebody most wants to read who corrected an expense is often after
   * that person has left and their account has gone.
   */
  private async record(
    expenseId: string,
    editType: 'CREATED' | 'UPDATED' | 'REVERSED',
    changes: FieldChange[],
    note?: string | null,
    userId?: string,
  ) {
    const user = userId
      ? await this.prisma.user.findFirst({
          where: { id: userId },
          select: { name: true },
        })
      : null;

    await this.prisma.expenseEditHistory.create({
      data: {
        tenantId: tenantId(),
        expenseId,
        editType,
        changes: changes as unknown as Prisma.InputJsonValue,
        note: note?.trim() || null,
        userId: userId ?? null,
        userName: user?.name ?? null,
      },
    });
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

/** What one edit changed. */
export interface FieldChange {
  field: string;
  from: string | number | boolean | null;
  to: string | number | boolean | null;
}

/**
 * The columns worth saying changed.
 *
 * A list rather than every key on the row: `updatedAt` moves on every edit and
 * saying so in the history is noise, and the relations are not the expense.
 */
export const TRACKED_FIELDS = [
  'date',
  'description',
  'amount',
  'paymentType',
  'doneBy',
  'toName',
  'vendor',
  'spentType',
  'note',
  'vendorGstin',
  'taxableValue',
  'taxAmount',
  'itcEligible',
  'orderId',
] as const;

/** A value as the history should read it, whatever Prisma handed back. */
function comparable(value: unknown): string | number | boolean | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'boolean') return value;
  // A Decimal and the number that replaces it must compare equal, or every
  // save would claim the amount changed.
  if (typeof value === 'number') return value;
  if (typeof value === 'object' && 'toString' in value) {
    const text = String(value);
    return Number.isNaN(Number(text)) ? text : Number(text);
  }
  return String(value);
}

/**
 * What one save actually changed.
 *
 * Pure and exported: what counts as a change is a rule worth reading on its
 * own, and getting it wrong in either direction — a history full of edits that
 * changed nothing, or one silently missing a corrected amount — is the kind of
 * thing only a test catches.
 */
export function diffExpense(
  previous: Record<string, unknown>,
  next: Record<string, unknown>,
): FieldChange[] {
  const changes: FieldChange[] = [];
  for (const field of TRACKED_FIELDS) {
    if (!(field in next)) continue;
    const from = comparable(previous[field]);
    const to = comparable(next[field]);
    if (from !== to) changes.push({ field, from, to });
  }
  return changes;
}
