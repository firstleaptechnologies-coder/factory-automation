import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  EmploymentStatus,
  PayKind,
  Prisma,
  SalaryRunStatus,
} from '@prisma/client';
import { monthBounds } from '@decor/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { LedgerService, accountFor } from '../ledger/ledger.service';
import { AttendanceService } from '../attendance/attendance.service';
import { tenantId } from '../../common/tenancy/tenant-context';
import { dateOnly } from '../employees/employees.service';
import {
  AdjustPayslipDto,
  AdvanceDto,
  OpenRunDto,
  PayRunDto,
  PayStructureDto,
} from './dto/payroll.dto';
import { activeIn, earnings, net, recoverAdvances, round2 } from './payroll';
import type { PayLine } from './payroll';

const EMPLOYEE = {
  id: true,
  code: true,
  name: true,
  designation: true,
  department: true,
  status: true,
} as const;

const PAYSLIP = {
  employee: { select: EMPLOYEE },
} as const;

/**
 * What the shop pays its people.
 *
 * Three things live here and they are deliberately separate. A **structure**
 * is how somebody is paid and changes rarely; an **advance** is money handed
 * over before it is earned; a **run** is one month, worked out from the
 * register and then frozen.
 *
 * A raise is a new structure rather than an edit, and a paid run is never
 * rewritten — both for the same reason: a payslip has to still explain itself
 * next year, and it cannot if the numbers under it moved.
 */
@Injectable()
export class PayrollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly attendance: AttendanceService,
  ) {}

  // -- how somebody is paid -------------------------------------------------

  structures(employeeId?: string) {
    return this.prisma.payStructure.findMany({
      where: employeeId ? { employeeId } : {},
      orderBy: [{ effectiveFrom: 'desc' }],
      include: { employee: { select: EMPLOYEE } },
    });
  }

  /**
   * Puts somebody on a new arrangement.
   *
   * The one it replaces is closed the day before this one starts rather than
   * edited, so last month's payslip still divides by last month's rate.
   */
  async setStructure(dto: PayStructureDto, userId?: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: dto.employeeId },
      select: { id: true },
    });
    if (!employee) throw new NotFoundException('Employee not found');

    if (dto.kind === PayKind.PIECE && !dto.pieceLabel?.trim()) {
      throw new BadRequestException('Say what a piece is — a panel, a sheet, a door');
    }

    const from = dateOnly(dto.effectiveFrom);
    const previous = await this.prisma.payStructure.findFirst({
      where: { employeeId: dto.employeeId, kind: dto.kind, effectiveTo: null },
      orderBy: { effectiveFrom: 'desc' },
    });

    if (previous && previous.effectiveFrom >= from) {
      throw new BadRequestException(
        'That arrangement starts before the one it replaces. Pick a later date.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      if (previous) {
        await tx.payStructure.update({
          where: { id: previous.id },
          data: { effectiveTo: dayBefore(from) },
        });
      }

      return tx.payStructure.create({
        data: {
          tenantId: tenantId(),
          employeeId: dto.employeeId,
          kind: dto.kind,
          rate: dto.rate,
          pieceLabel: dto.pieceLabel?.trim() || null,
          overtimeHourlyRate: dto.overtimeHourlyRate ?? null,
          effectiveFrom: from,
          note: dto.note?.trim() || null,
          createdById: userId,
        },
        include: { employee: { select: EMPLOYEE } },
      });
    });
  }

  // -- advances -------------------------------------------------------------

  advances(employeeId?: string) {
    return this.prisma.salaryAdvance.findMany({
      where: employeeId ? { employeeId } : {},
      orderBy: [{ givenOn: 'desc' }],
      include: { employee: { select: EMPLOYEE } },
    });
  }

  /**
   * Money handed over before it is earned.
   *
   * It leaves the drawer today, so it posts to the ledger today — and comes
   * back off a payslip later. Recording it only as a deduction would have the
   * cash position wrong for however long that took.
   */
  async giveAdvance(dto: AdvanceDto, userId?: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: dto.employeeId },
      select: { id: true, name: true },
    });
    if (!employee) throw new NotFoundException('Employee not found');

    const advance = await this.prisma.salaryAdvance.create({
      data: {
        tenantId: tenantId(),
        employeeId: dto.employeeId,
        amount: dto.amount,
        givenOn: dateOnly(dto.givenOn),
        mode: dto.mode,
        note: dto.note?.trim() || null,
        givenById: userId,
      },
      include: { employee: { select: EMPLOYEE } },
    });

    await this.ledger.post({
      sourceType: 'SalaryAdvance',
      sourceId: advance.id,
      at: advance.givenOn,
      direction: 'OUT',
      account: accountFor(dto.mode),
      amount: dto.amount,
      voucher: 'PAYMENT',
      party: employee.name,
      accountHead: 'Salary advance',
      note: advance.note,
      recordedById: userId ?? null,
    });

    return advance;
  }

  // -- the month ------------------------------------------------------------

  runs() {
    return this.prisma.salaryRun.findMany({
      orderBy: [{ month: 'desc' }],
      include: { _count: { select: { payslips: true } } },
    });
  }

  async run(id: string) {
    const row = await this.prisma.salaryRun.findFirst({
      where: { id },
      include: { payslips: { include: PAYSLIP, orderBy: { createdAt: 'asc' } } },
    });
    if (!row) throw new NotFoundException('That month has not been opened');
    return { ...row, totals: totalsOf(row.payslips) };
  }

  /**
   * Opens a month and works out what everybody is owed.
   *
   * Draft on purpose: the numbers come from the register and the arrangements,
   * and somebody has to look at them before anybody is paid. Re-opening the
   * same month is refused rather than silently recalculated — a shop that has
   * adjusted a payslip should not lose it to a second click.
   */
  async open(dto: OpenRunDto, userId?: string) {
    const bounds = monthBounds(dto.month);
    const from = dateOnly(bounds.from);
    const to = dateOnly(bounds.to);

    const existing = await this.prisma.salaryRun.findFirst({ where: { month: from } });
    if (existing) {
      throw new BadRequestException(
        'That month is already open. Open it from the list rather than starting again.',
      );
    }

    const [people, summary] = await Promise.all([
      this.prisma.employee.findMany({
        where: { status: { not: EmploymentStatus.LEFT } },
        select: EMPLOYEE,
      }),
      this.attendance.summary({ from: bounds.from, to: bounds.to }),
    ]);

    const [structures, advances] = await Promise.all([
      this.prisma.payStructure.findMany({
        where: { employeeId: { in: people.map((person) => person.id) } },
      }),
      this.prisma.salaryAdvance.findMany({
        where: { employeeId: { in: people.map((person) => person.id) } },
      }),
    ]);

    const daysFor = new Map(
      summary.rows.map((row) => [row.employee.id, row]),
    );

    const run = await this.prisma.salaryRun.create({
      data: {
        tenantId: tenantId(),
        month: from,
        workingDays: dto.workingDays,
        note: dto.note?.trim() || null,
        createdById: userId,
      },
    });

    for (const person of people) {
      const mine = activeIn(
        structures.filter((structure) => structure.employeeId === person.id),
        to,
        from,
      );
      // Somebody with no arrangement is not on the payroll yet. A payslip of
      // zero would say the shop paid them nothing, which is a different claim.
      if (mine.length === 0) continue;

      const days = daysFor.get(person.id);
      const earned = earnings({
        structures: mine.map((structure) => ({
          kind: structure.kind,
          rate: Number(structure.rate),
          pieceLabel: structure.pieceLabel,
          overtimeHourlyRate:
            structure.overtimeHourlyRate == null ? null : Number(structure.overtimeHourlyRate),
          effectiveFrom: structure.effectiveFrom,
        })),
        payableDays: days?.payableDays ?? 0,
        overtimeMinutes: days?.overtimeMinutes ?? 0,
        workingDays: dto.workingDays,
      });

      const owed = advances
        .filter((advance) => advance.employeeId === person.id)
        .map((advance) => ({
          id: advance.id,
          amount: Number(advance.amount),
          recoveredAmount: Number(advance.recoveredAmount),
          givenOn: advance.givenOn,
        }));
      const recovery = recoverAdvances(owed, earned.gross);

      await this.prisma.payslip.create({
        data: {
          tenantId: tenantId(),
          runId: run.id,
          employeeId: person.id,
          payableDays: days?.payableDays ?? 0,
          overtimeMinutes: days?.overtimeMinutes ?? 0,
          lines: earned.lines as unknown as Prisma.InputJsonValue,
          gross: earned.gross,
          advanceDeducted: recovery.total,
          recoveries: recovery.recoveries as unknown as Prisma.InputJsonValue,
          net: net(earned.gross, recovery.total, 0),
        },
      });
    }

    return this.run(run.id);
  }

  /**
   * Corrects one payslip while the run is still a draft.
   *
   * Piece counts arrive this way: nobody knows how many panels somebody
   * polished until the shop says so, and asking for it on the register every
   * day would be a worse question than asking once a month.
   */
  async adjust(runId: string, payslipId: string, dto: AdjustPayslipDto) {
    const run = await this.prisma.salaryRun.findFirst({ where: { id: runId } });
    if (!run) throw new NotFoundException('That month has not been opened');
    if (run.status === SalaryRunStatus.PAID) {
      throw new BadRequestException('That month has been paid — it cannot be changed');
    }

    const payslip = await this.prisma.payslip.findFirst({
      where: { id: payslipId, runId },
    });
    if (!payslip) throw new NotFoundException('Payslip not found');

    const structures = await this.prisma.payStructure.findMany({
      where: { employeeId: payslip.employeeId },
    });
    const bounds = monthBounds(run.month.toISOString().slice(0, 7));
    const mine = activeIn(structures, dateOnly(bounds.to), dateOnly(bounds.from));

    const pieces = dto.pieces ?? payslip.pieces ?? null;
    const earned = earnings({
      structures: mine.map((structure) => ({
        kind: structure.kind,
        rate: Number(structure.rate),
        pieceLabel: structure.pieceLabel,
        overtimeHourlyRate:
          structure.overtimeHourlyRate == null ? null : Number(structure.overtimeHourlyRate),
        effectiveFrom: structure.effectiveFrom,
      })),
      payableDays: Number(payslip.payableDays),
      overtimeMinutes: payslip.overtimeMinutes,
      workingDays: run.workingDays,
      pieces,
    });

    const advances = await this.prisma.salaryAdvance.findMany({
      where: { employeeId: payslip.employeeId },
    });
    const recovery = recoverAdvances(
      advances.map((advance) => ({
        id: advance.id,
        amount: Number(advance.amount),
        recoveredAmount: Number(advance.recoveredAmount),
        givenOn: advance.givenOn,
      })),
      earned.gross,
    );

    const other = dto.otherDeductions ?? Number(payslip.otherDeductions);

    return this.prisma.payslip.update({
      where: { id: payslipId },
      data: {
        pieces,
        lines: earned.lines as unknown as Prisma.InputJsonValue,
        gross: earned.gross,
        advanceDeducted: recovery.total,
        recoveries: recovery.recoveries as unknown as Prisma.InputJsonValue,
        otherDeductions: other,
        deductionNote: dto.deductionNote?.trim() ?? payslip.deductionNote,
        note: dto.note?.trim() ?? payslip.note,
        net: net(earned.gross, recovery.total, other),
      },
      include: PAYSLIP,
    });
  }

  /** Somebody has looked at the numbers. Nothing has moved yet. */
  async approve(id: string) {
    const run = await this.prisma.salaryRun.findFirst({ where: { id } });
    if (!run) throw new NotFoundException('That month has not been opened');
    if (run.status !== SalaryRunStatus.DRAFT) {
      throw new BadRequestException('That month has already been approved');
    }

    await this.prisma.salaryRun.update({
      where: { id },
      data: { status: SalaryRunStatus.APPROVED, approvedAt: new Date() },
    });
    return this.run(id);
  }

  /**
   * Pays it.
   *
   * One ledger entry per payslip, because that is how the money actually left:
   * a single line for the whole payroll would be a figure nobody could
   * reconcile against a person. The advances each payslip recovered are
   * written down in the same breath, so nothing is taken back twice.
   */
  async pay(id: string, dto: PayRunDto, userId?: string) {
    const run = await this.prisma.salaryRun.findFirst({
      where: { id },
      include: { payslips: { include: PAYSLIP } },
    });
    if (!run) throw new NotFoundException('That month has not been opened');
    if (run.status === SalaryRunStatus.PAID) {
      throw new BadRequestException('That month has already been paid');
    }
    if (run.status !== SalaryRunStatus.APPROVED) {
      throw new BadRequestException('Somebody has to approve the month before it is paid');
    }

    const paidAt = new Date();

    await this.prisma.$transaction([
      this.prisma.salaryRun.update({
        where: { id },
        data: { status: SalaryRunStatus.PAID, paidAt, paidMode: dto.mode },
      }),
      ...this.recoveryWrites(run.payslips),
    ]);

    for (const payslip of run.payslips) {
      if (Number(payslip.net) <= 0) continue;
      await this.ledger.post({
        sourceType: 'Payslip',
        sourceId: payslip.id,
        at: paidAt,
        direction: 'OUT',
        account: accountFor(dto.mode),
        amount: Number(payslip.net),
        voucher: 'PAYMENT',
        party: payslip.employee.name,
        accountHead: 'Salary',
        note: `${run.month.toISOString().slice(0, 7)} · ${payslip.employee.code}`,
        recordedById: userId ?? null,
      });
    }

    return this.run(id);
  }

  /** A draft can be thrown away. Anything further along cannot. */
  async discard(id: string) {
    const run = await this.prisma.salaryRun.findFirst({ where: { id } });
    if (!run) throw new NotFoundException('That month has not been opened');
    if (run.status !== SalaryRunStatus.DRAFT) {
      throw new BadRequestException(
        'That month has been approved. It cannot be thrown away.',
      );
    }
    await this.prisma.salaryRun.delete({ where: { id } });
    return { id };
  }

  /**
   * Writes down what each advance gave back.
   *
   * Advance by advance, from what the payslip recorded — not the total against
   * everything the person holds. Crediting every advance with the whole
   * deduction would mark two of them repaid on one month's recovery, and the
   * shop would never see that money again.
   *
   * Applied as the run is paid rather than as it is drafted, so a draft
   * somebody threw away leaves nobody's advance looking repaid.
   */
  private recoveryWrites(payslips: { recoveries: Prisma.JsonValue }[]) {
    return payslips.flatMap((payslip) =>
      readRecoveries(payslip.recoveries).map((recovery) =>
        this.prisma.salaryAdvance.update({
          where: { id: recovery.advanceId },
          data: { recoveredAmount: { increment: recovery.amount } },
        }),
      ),
    );
  }
}

/**
 * What a payslip recorded about the advances it took back.
 *
 * Read defensively: this is a JSON column, and a row written before the column
 * existed has nothing in it. An empty list is the right answer there — better
 * than crediting nothing at all to the wrong advance.
 */
export function readRecoveries(value: Prisma.JsonValue): { advanceId: string; amount: number }[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (entry): entry is { advanceId: string; amount: number } =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as { advanceId?: unknown }).advanceId === 'string' &&
        typeof (entry as { amount?: unknown }).amount === 'number',
    )
    .filter((entry) => entry.amount > 0);
}

/** The day before a date, so one arrangement ends where the next begins. */
export function dayBefore(date: Date): Date {
  const before = new Date(date);
  before.setUTCDate(before.getUTCDate() - 1);
  return before;
}

/** What a month's payslips come to, for the heading above them. */
export function totalsOf(
  payslips: { gross: Prisma.Decimal; advanceDeducted: Prisma.Decimal; otherDeductions: Prisma.Decimal; net: Prisma.Decimal }[],
): { gross: number; advances: number; deductions: number; net: number; count: number } {
  const sum = (pick: (row: (typeof payslips)[number]) => Prisma.Decimal) =>
    round2(payslips.reduce((total, row) => total + Number(pick(row)), 0));

  return {
    gross: sum((row) => row.gross),
    advances: sum((row) => row.advanceDeducted),
    deductions: sum((row) => row.otherDeductions),
    net: sum((row) => row.net),
    count: payslips.length,
  };
}

export type { PayLine };
