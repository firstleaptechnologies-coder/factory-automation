import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AttendanceMark, EmploymentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { tenantId } from '../../common/tenancy/tenant-context';
import { dateOnly } from '../employees/employees.service';
import { DayQueryDto, MarkDayDto, MarkDto, RegisterQueryDto } from './dto/attendance.dto';

const EMPLOYEE = {
  id: true,
  code: true,
  name: true,
  designation: true,
  department: true,
  status: true,
} as const;

/**
 * Marking in and marking out, never punching.
 *
 * This app already means something specific by *punch* — an order gets
 * punched — and a floor that hears one word for two things will eventually do
 * the wrong one.
 *
 * The register is marked a day at a time, because that is how a shop does it:
 * somebody stands at the door in the morning and goes down the list. Marking
 * the same day twice corrects it rather than counting anybody twice.
 */
@Injectable()
export class AttendanceService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Everyone who could be marked on one day, with whatever they were marked.
   *
   * The list leads, not the marks: a register that showed only the rows
   * already entered would make a morning where nobody was marked look like a
   * morning where nobody came in.
   */
  async day(query: DayQueryDto) {
    const date = dateOnly(query.date);

    const [people, marked] = await Promise.all([
      this.prisma.employee.findMany({
        where: { status: { not: EmploymentStatus.LEFT } },
        orderBy: [{ department: 'asc' }, { name: 'asc' }],
        select: EMPLOYEE,
      }),
      this.prisma.attendance.findMany({
        where: { date },
        include: { markedBy: { select: { id: true, name: true } } },
      }),
    ]);

    const byEmployee = new Map(marked.map((row) => [row.employeeId, row]));

    return {
      date: query.date,
      rows: people.map((employee) => {
        const row = byEmployee.get(employee.id);
        return {
          employee,
          marked: Boolean(row),
          mark: row?.mark ?? null,
          inAt: row?.inAt ?? null,
          outAt: row?.outAt ?? null,
          overtimeMinutes: row?.overtimeMinutes ?? 0,
          note: row?.note ?? null,
          markedBy: row?.markedBy ?? null,
        };
      }),
    };
  }

  /** One person's days, between two dates. */
  async register(query: RegisterQueryDto) {
    const rows = await this.prisma.attendance.findMany({
      where: registerFilter(query),
      orderBy: [{ date: 'asc' }],
      include: { employee: { select: EMPLOYEE } },
    });
    return { from: query.from, to: query.to, rows, summary: summarise(rows) };
  }

  /**
   * What each person's month came to.
   *
   * The figure the salary run reads: days present, half days, leave and
   * overtime, per person. Counted here rather than in the payroll so the shop
   * can see the same numbers before anybody is paid from them.
   */
  async summary(query: RegisterQueryDto) {
    const rows = await this.prisma.attendance.findMany({
      where: registerFilter(query),
      select: { employeeId: true, mark: true, overtimeMinutes: true },
    });

    const people = await this.prisma.employee.findMany({
      where: { status: { not: EmploymentStatus.LEFT } },
      orderBy: [{ name: 'asc' }],
      select: EMPLOYEE,
    });

    const byEmployee = new Map<string, typeof rows>();
    for (const row of rows) {
      const list = byEmployee.get(row.employeeId) ?? [];
      list.push(row);
      byEmployee.set(row.employeeId, list);
    }

    return {
      from: query.from,
      to: query.to,
      rows: people.map((employee) => ({
        employee,
        ...summarise(byEmployee.get(employee.id) ?? []),
      })),
    };
  }

  /**
   * Marks the register for one day.
   *
   * Everything in one transaction: half a marked register is worse than an
   * unmarked one, because nobody can tell which half.
   */
  async markDay(dto: MarkDayDto, userId?: string) {
    if (!dto.marks.length) throw new BadRequestException('Nobody was marked');

    const date = dateOnly(dto.date);
    const ids = dto.marks.map((mark) => mark.employeeId);
    const known = await this.prisma.employee.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    if (known.length !== new Set(ids).size) {
      throw new NotFoundException('Somebody on that list is not an employee here');
    }

    await this.prisma.$transaction(
      dto.marks.map((mark) => this.upsert(date, mark, userId)),
    );

    return this.day({ date: dto.date });
  }

  private upsert(date: Date, mark: MarkDto, userId?: string) {
    const data = {
      mark: mark.mark,
      inAt: mark.inAt ? new Date(mark.inAt) : null,
      outAt: mark.outAt ? new Date(mark.outAt) : null,
      overtimeMinutes: mark.overtimeMinutes ?? 0,
      note: mark.note?.trim() || null,
      markedById: userId ?? null,
    };

    return this.prisma.attendance.upsert({
      where: {
        tenantId_employeeId_date: {
          tenantId: tenantId(),
          employeeId: mark.employeeId,
          date,
        },
      },
      create: { tenantId: tenantId(), employeeId: mark.employeeId, date, ...data },
      update: data,
    });
  }
}

/** The days one view of the register covers. */
export function registerFilter(query: {
  from: string;
  to: string;
  employeeId?: string;
}): Prisma.AttendanceWhereInput {
  return {
    date: { gte: dateOnly(query.from), lte: dateOnly(query.to) },
    ...(query.employeeId ? { employeeId: query.employeeId } : {}),
  };
}

export interface AttendanceSummary {
  present: number;
  halfDays: number;
  absent: number;
  leave: number;
  holidays: number;
  /** Present plus half a day for each half day — what a daily wage multiplies. */
  payableDays: number;
  overtimeMinutes: number;
}

/**
 * What a set of days comes to.
 *
 * Pure and exported: this is the number somebody is paid from, so it is worth
 * reading on its own and worth testing without a database in the way. A half
 * day counts as half — the one arithmetic rule in here, and the one a shop
 * would notice immediately if it were wrong.
 */
export function summarise(
  rows: { mark: AttendanceMark; overtimeMinutes: number }[],
): AttendanceSummary {
  const count = (mark: AttendanceMark) => rows.filter((row) => row.mark === mark).length;

  const present = count(AttendanceMark.PRESENT);
  const halfDays = count(AttendanceMark.HALF_DAY);

  return {
    present,
    halfDays,
    absent: count(AttendanceMark.ABSENT),
    leave: count(AttendanceMark.LEAVE),
    holidays: count(AttendanceMark.HOLIDAY) + count(AttendanceMark.WEEKLY_OFF),
    payableDays: present + halfDays / 2,
    overtimeMinutes: rows.reduce((total, row) => total + (row.overtimeMinutes ?? 0), 0),
  };
}
