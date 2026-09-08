import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EmploymentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EncryptionService } from '../../common/crypto/encryption.service';
import { CodeGeneratorService } from '../../common/utils/code-generator.service';
import { tenantId } from '../../common/tenancy/tenant-context';
import { paginate } from '../../common/dto/pagination.dto';
import { EmployeeDto, EmployeeQueryDto } from './dto/employee.dto';

/**
 * The columns never sent to a screen.
 *
 * An Aadhaar is stored so a payslip or a form can be filled in, not so a list
 * of staff can carry every identifier in the shop through the browser. What
 * goes out is the last four digits, which is what a person reads back over the
 * phone anyway.
 */
const SELECT = {
  id: true,
  code: true,
  name: true,
  phone: true,
  altPhone: true,
  email: true,
  designation: true,
  department: true,
  joinedOn: true,
  leftOn: true,
  status: true,
  aadhaarLast4: true,
  panLast4: true,
  bankAccountName: true,
  bankAccountLast4: true,
  bankIfsc: true,
  address: true,
  emergencyName: true,
  emergencyPhone: true,
  photoFileId: true,
  userId: true,
  user: { select: { id: true, name: true, code: true, isActive: true } },
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * The people who work here.
 *
 * An employee is not a login. Most of the floor will never have an account,
 * an account can be revoked without the person ceasing to exist, and an office
 * account may belong to somebody who is not on the payroll at all. Where the
 * two are the same person they are linked, and either can exist without the
 * other.
 */
@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly codes: CodeGeneratorService,
  ) {}

  async list(query: EmployeeQueryDto) {
    const where = employeeFilter(query);

    const [rows, count] = await Promise.all([
      this.prisma.employee.findMany({
        where,
        orderBy: [{ status: 'asc' }, { name: 'asc' }],
        skip: query.skip,
        take: query.limit,
        select: SELECT,
      }),
      this.prisma.employee.count({ where }),
    ]);

    return paginate(rows, count, { page: query.page, limit: query.limit });
  }

  async get(id: string) {
    const row = await this.prisma.employee.findFirst({ where: { id }, select: SELECT });
    if (!row) throw new NotFoundException('Employee not found');
    return row;
  }

  async create(dto: EmployeeDto, userId?: string) {
    const data = await this.rowFrom(dto);
    return this.prisma.employee.create({
      data: {
        tenantId: tenantId(),
        code: await this.codes.next('employee'),
        ...data,
        createdById: userId,
      },
      select: SELECT,
    });
  }

  async update(id: string, dto: EmployeeDto) {
    const existing = await this.prisma.employee.findFirst({ where: { id } });
    if (!existing) throw new NotFoundException('Employee not found');

    return this.prisma.employee.update({
      where: { id },
      data: await this.rowFrom(dto),
      select: SELECT,
    });
  }

  /**
   * Somebody has left.
   *
   * The row stays: last year's attendance and last month's payslip hang off
   * it, and the accountant will want both. Their login is switched off in the
   * same breath, because an account nobody is behind is the one most likely to
   * still be signed in on a phone in a drawer.
   */
  async markLeft(id: string, leftOn: string) {
    const employee = await this.prisma.employee.findFirst({ where: { id } });
    if (!employee) throw new NotFoundException('Employee not found');
    if (employee.status === EmploymentStatus.LEFT) {
      throw new BadRequestException('That person has already left');
    }

    await this.prisma.$transaction([
      // The login goes first, so the employee read after it describes the
      // world the caller is about to be shown rather than the one before.
      ...(employee.userId
        ? [
            this.prisma.user.update({
              where: { id: employee.userId },
              data: { isActive: false },
            }),
          ]
        : []),
      this.prisma.employee.update({
        where: { id },
        data: { status: EmploymentStatus.LEFT, leftOn: dateOnly(leftOn) },
      }),
    ]);
    return this.get(id);
  }

  /**
   * The full identifiers, decrypted, for the one screen that needs them.
   *
   * Separate from reading the employee so it is a deliberate act with its own
   * permission and its own line in the audit trail — "who looked at this
   * person's Aadhaar" is a question worth being able to answer.
   */
  async identifiers(id: string) {
    const row = await this.prisma.employee.findFirst({
      where: { id },
      select: { aadhaar: true, pan: true, bankAccountNumber: true },
    });
    if (!row) throw new NotFoundException('Employee not found');

    return {
      aadhaar: this.reveal(row.aadhaar),
      pan: this.reveal(row.pan),
      bankAccountNumber: this.reveal(row.bankAccountNumber),
    };
  }

  private reveal(envelope: string | null): string | null {
    if (!envelope) return null;
    return this.encryption.decryptToString(envelope);
  }

  /** The columns an employee is written from, whichever way they arrived. */
  private async rowFrom(dto: EmployeeDto) {
    if (dto.userId) {
      const user = await this.prisma.user.findFirst({
        where: { id: dto.userId },
        select: { id: true },
      });
      if (!user) throw new NotFoundException('That login does not exist');
    }
    if (dto.status === EmploymentStatus.LEFT && !dto.leftOn) {
      throw new BadRequestException('Say what day they left');
    }

    const aadhaar = dto.aadhaar?.replace(/\s+/g, '');
    const pan = dto.pan?.toUpperCase();
    const account = dto.bankAccountNumber?.replace(/\s+/g, '');
    // `?.` keeps an absent field absent, which is what tells `secret` to leave
    // what is stored alone.

    return {
      name: dto.name.trim(),
      phone: dto.phone?.trim() || null,
      altPhone: dto.altPhone?.trim() || null,
      email: dto.email?.trim() || null,
      designation: dto.designation?.trim() || null,
      department: dto.department?.trim() || null,
      joinedOn: dateOnly(dto.joinedOn),
      leftOn: dto.leftOn ? dateOnly(dto.leftOn) : null,
      status: dto.status ?? EmploymentStatus.ACTIVE,
      ...this.secret('aadhaar', aadhaar),
      ...this.secret('pan', pan),
      ...this.secret('bankAccountNumber', account, 'bankAccountLast4'),
      bankAccountName: dto.bankAccountName?.trim() || null,
      bankIfsc: dto.bankIfsc?.toUpperCase() || null,
      address: dto.address?.trim() || null,
      emergencyName: dto.emergencyName?.trim() || null,
      emergencyPhone: dto.emergencyPhone?.trim() || null,
      userId: dto.userId ?? null,
    };
  }

  /**
   * One identifier, encrypted, with its last four kept in clear.
   *
   * Sent empty it clears both halves rather than leaving a stale tail beside a
   * removed number — which would be worse than showing nothing, because it
   * would look like the number was still there.
   */
  private secret(field: string, value: string | undefined, tail = `${field}Last4`) {
    /*
     * Absent means "leave it alone", not "clear it".
     *
     * The form cannot show what it does not have — these are encrypted and
     * come back as four digits — so every edit would otherwise wipe the
     * Aadhaar of anybody whose phone number was corrected. Clearing one is
     * still possible, by sending it empty, which is a thing somebody has to
     * do on purpose.
     */
    if (value === undefined) return {};
    if (value === '') return { [field]: null, [tail]: null };
    return {
      [field]: this.encryption.encrypt(value),
      [tail]: value.slice(-4),
    };
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
 * The people one view of the list covers.
 *
 * Pure and exported: who counts as "the staff" is a question the shop asks in
 * several places, and it should give the same answer in all of them.
 */
export function employeeFilter(query: {
  status?: EmploymentStatus;
  department?: string;
  search?: string;
}): Prisma.EmployeeWhereInput {
  const search = query.search?.trim();
  const contains = (value: string) => ({ contains: value, mode: 'insensitive' as const });

  return {
    // Somebody who has left is out of the way unless they are what was asked
    // for: the list is nearly always "who works here", not "who ever did".
    status: query.status ?? { not: EmploymentStatus.LEFT },
    ...(query.department ? { department: query.department } : {}),
    ...(search
      ? {
          OR: [
            { name: contains(search) },
            { code: contains(search) },
            { phone: contains(search) },
            { designation: contains(search) },
          ],
        }
      : {}),
  };
}
