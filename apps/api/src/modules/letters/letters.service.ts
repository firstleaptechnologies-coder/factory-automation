import { Injectable, NotFoundException } from '@nestjs/common';
import { LetterKind } from '@prisma/client';
import { fillLetter, type LetterField } from '@fas/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { tenantId } from '../../common/tenancy/tenant-context';
import { dateOnly } from '../employees/employees.service';
import { IssueLetterDto, LetterQueryDto, LetterTemplateDto } from './dto/letter.dto';

const EMPLOYEE = {
  id: true,
  code: true,
  name: true,
  designation: true,
  department: true,
  joinedOn: true,
  leftOn: true,
} as const;

/**
 * The letters a shop gives its people.
 *
 * Templates are the shop's, and what somebody was actually handed is kept as
 * it was handed to them. Those two are separate on purpose: a template edited
 * next year must not change what is in an employee's file from last March,
 * because the copy they hold is the one that counts and this is ours.
 */
@Injectable()
export class LettersService {
  constructor(private readonly prisma: PrismaService) {}

  // -- templates ------------------------------------------------------------

  templates(kind?: LetterKind) {
    return this.prisma.letterTemplate.findMany({
      where: kind ? { kind } : {},
      orderBy: [{ kind: 'asc' }, { name: 'asc' }],
    });
  }

  createTemplate(dto: LetterTemplateDto) {
    return this.prisma.letterTemplate.create({
      data: {
        tenantId: tenantId(),
        kind: dto.kind,
        name: dto.name.trim(),
        body: dto.body,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async updateTemplate(id: string, dto: LetterTemplateDto) {
    const template = await this.prisma.letterTemplate.findFirst({ where: { id } });
    if (!template) throw new NotFoundException('Template not found');

    return this.prisma.letterTemplate.update({
      where: { id },
      data: {
        kind: dto.kind,
        name: dto.name.trim(),
        body: dto.body,
        isActive: dto.isActive ?? template.isActive,
      },
    });
  }

  // -- letters --------------------------------------------------------------

  letters(query: LetterQueryDto) {
    return this.prisma.letter.findMany({
      where: {
        ...(query.employeeId ? { employeeId: query.employeeId } : {}),
        ...(query.kind ? { kind: query.kind } : {}),
      },
      orderBy: [{ issuedOn: 'desc' }],
      include: { employee: { select: EMPLOYEE } },
    });
  }

  async letter(id: string) {
    const row = await this.prisma.letter.findFirst({
      where: { id },
      include: { employee: { select: EMPLOYEE } },
    });
    if (!row) throw new NotFoundException('Letter not found');
    return row;
  }

  /**
   * What a template says once it is about a particular person.
   *
   * Worked out here rather than on the screen so the preview somebody reads
   * and the letter that is filed are produced by the same code — a second
   * substitution is a second set of words waiting to differ.
   */
  async draft(templateId: string, employeeId: string) {
    const [template, employee, firm] = await Promise.all([
      this.prisma.letterTemplate.findFirst({ where: { id: templateId } }),
      this.prisma.employee.findFirst({ where: { id: employeeId }, select: EMPLOYEE }),
      this.prisma.firmProfile.findFirst(),
    ]);
    if (!template) throw new NotFoundException('Template not found');
    if (!employee) throw new NotFoundException('Employee not found');

    const structure = await this.prisma.payStructure.findFirst({
      where: { employeeId, effectiveTo: null },
      orderBy: { effectiveFrom: 'desc' },
    });

    return {
      kind: template.kind,
      title: `${template.name} — ${employee.name}`,
      body: fillLetter(template.body, valuesFor(employee, firm, structure)),
    };
  }

  /** Files a letter as it was given. */
  async issue(dto: IssueLetterDto, userId?: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: dto.employeeId },
      select: { id: true },
    });
    if (!employee) throw new NotFoundException('Employee not found');

    return this.prisma.letter.create({
      data: {
        tenantId: tenantId(),
        employeeId: dto.employeeId,
        kind: dto.kind,
        title: dto.title.trim(),
        body: dto.body,
        issuedOn: dto.issuedOn ? dateOnly(dto.issuedOn) : new Date(),
        issuedById: userId,
      },
      include: { employee: { select: EMPLOYEE } },
    });
  }
}

/** A date as it reads on a letter: 9 September 2026. */
export function longDate(value: Date | null | undefined): string {
  if (!value) return '';
  return value.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * What a template's placeholders stand for.
 *
 * Pure and exported: what `{{salary}}` means on a letter somebody takes to a
 * bank is worth reading on its own.
 */
export function valuesFor(
  employee: {
    name: string;
    code: string;
    designation?: string | null;
    department?: string | null;
    joinedOn: Date;
    leftOn?: Date | null;
  },
  firm?: { name?: string | null; address?: string | null } | null,
  structure?: { kind: string; rate: unknown } | null,
  now = new Date(),
): Partial<Record<LetterField, string>> {
  return {
    name: employee.name,
    code: employee.code,
    designation: employee.designation ?? '',
    department: employee.department ?? '',
    joinedOn: longDate(employee.joinedOn),
    leftOn: longDate(employee.leftOn),
    salary: structure ? salaryInWords(structure) : '',
    firmName: firm?.name ?? '',
    firmAddress: firm?.address ?? '',
    today: longDate(now),
  };
}

/** "₹26,000 a month", "₹700 a day", "₹45 a piece" — what the letter should say. */
export function salaryInWords(structure: { kind: string; rate: unknown }): string {
  const amount = `₹${Number(structure.rate).toLocaleString('en-IN')}`;
  if (structure.kind === 'MONTHLY') return `${amount} a month`;
  if (structure.kind === 'DAILY') return `${amount} a day`;
  return `${amount} a piece`;
}
