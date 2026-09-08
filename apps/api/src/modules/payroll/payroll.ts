import { PayKind } from '@prisma/client';

/**
 * What a month's pay comes to, and why.
 *
 * Pure, and the reason this file exists on its own: somebody's wages are the
 * one number in this product that a person will check by hand, and the rules
 * for it should be readable without a database in the way. Nothing here talks
 * to Prisma; the service does the fetching and the writing.
 */

/** Two decimals, the way money is written. */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** One arrangement, as the payslip needs to read it. */
export interface Structure {
  kind: PayKind;
  rate: number;
  pieceLabel?: string | null;
  overtimeHourlyRate?: number | null;
  /** Later is more recent, and decides which overtime rate applies. */
  effectiveFrom: Date;
}

/** One line of a payslip. Snapshotted, so it survives a later raise. */
export interface PayLine {
  kind: PayKind | 'OVERTIME';
  /** What it says on the slip. */
  label: string;
  rate: number;
  /** Days, pieces, or hours — whatever the rate is per. */
  quantity: number;
  amount: number;
}

export interface Earned {
  lines: PayLine[];
  gross: number;
}

/**
 * What somebody earned, from their arrangements and their month.
 *
 * A monthly salary is divided by the days the *shop* calls a full month, not
 * by the length of the calendar month: plenty of shops pay for 26 days, and
 * dividing by 30 would quietly dock everybody four days' pay.
 *
 * Somebody on more than one arrangement gets a line for each. That is the
 * point of the model: a base salary plus a rate per panel is a real thing, and
 * choosing one shape for the product would have made it unrepresentable.
 */
export function earnings(input: {
  structures: Structure[];
  payableDays: number;
  overtimeMinutes: number;
  workingDays: number;
  pieces?: number | null;
}): Earned {
  const lines: PayLine[] = [];

  for (const structure of input.structures) {
    const line = lineFor(structure, input);
    if (line) lines.push(line);
  }

  const overtime = overtimeLine(input.structures, input.overtimeMinutes);
  if (overtime) lines.push(overtime);

  return {
    lines,
    gross: round2(lines.reduce((total, line) => total + line.amount, 0)),
  };
}

function lineFor(
  structure: Structure,
  input: { payableDays: number; workingDays: number; pieces?: number | null },
): PayLine | null {
  if (structure.kind === PayKind.MONTHLY) {
    /*
     * Never more than the salary.
     *
     * Somebody who worked every day the shop was open plus a Sunday has more
     * payable days than the month has, and a salary is a salary — the extra is
     * overtime's business, if the shop pays it, and not a proportion above one.
     */
    const share = Math.min(1, safeShare(input.payableDays, input.workingDays));
    return {
      kind: PayKind.MONTHLY,
      label: 'Salary',
      rate: structure.rate,
      quantity: round2(input.payableDays),
      amount: round2(structure.rate * share),
    };
  }

  if (structure.kind === PayKind.DAILY) {
    return {
      kind: PayKind.DAILY,
      label: 'Daily wage',
      rate: structure.rate,
      quantity: round2(input.payableDays),
      amount: round2(structure.rate * input.payableDays),
    };
  }

  // Piece work with nothing counted is not a line of zero — it is a line
  // nobody has filled in yet, and a payslip claiming ₹0 for it reads as if the
  // person made nothing.
  const pieces = input.pieces ?? 0;
  if (!pieces) return null;

  return {
    kind: PayKind.PIECE,
    label: `Per ${structure.pieceLabel?.trim() || 'piece'}`,
    rate: structure.rate,
    quantity: pieces,
    amount: round2(structure.rate * pieces),
  };
}

/**
 * The overtime line, if any arrangement pays it.
 *
 * Paid once however many arrangements somebody is on, at the rate from the
 * most recently effective one that names a rate — the shop's latest word on
 * what an hour is worth.
 */
export function overtimeLine(
  structures: Structure[],
  overtimeMinutes: number,
): PayLine | null {
  if (overtimeMinutes <= 0) return null;

  const paying = [...structures]
    .filter((structure) => (structure.overtimeHourlyRate ?? 0) > 0)
    .sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime())[0];
  if (!paying) return null;

  const hours = round2(overtimeMinutes / 60);
  return {
    kind: 'OVERTIME',
    label: 'Overtime',
    rate: paying.overtimeHourlyRate!,
    quantity: hours,
    amount: round2(paying.overtimeHourlyRate! * hours),
  };
}

/** A share, without dividing by nothing. */
function safeShare(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return part / whole;
}

/** What one advance gave back this month. */
export interface Recovery {
  advanceId: string;
  amount: number;
}

/**
 * How much of what somebody owes comes back this month.
 *
 * Oldest advance first, and never more than the pay: a payslip that came to a
 * negative number would mean the shop expecting somebody to bring money in on
 * payday, which is not a thing that happens. What is left stays outstanding
 * and comes off next month.
 */
export function recoverAdvances(
  advances: { id: string; amount: number; recoveredAmount: number; givenOn: Date }[],
  available: number,
): { recoveries: Recovery[]; total: number } {
  let left = Math.max(0, available);
  const recoveries: Recovery[] = [];

  const outstanding = [...advances]
    .map((advance) => ({
      ...advance,
      owing: round2(advance.amount - advance.recoveredAmount),
    }))
    .filter((advance) => advance.owing > 0.009)
    .sort((a, b) => a.givenOn.getTime() - b.givenOn.getTime());

  for (const advance of outstanding) {
    if (left <= 0.009) break;
    const taken = round2(Math.min(advance.owing, left));
    recoveries.push({ advanceId: advance.id, amount: taken });
    left = round2(left - taken);
  }

  return {
    recoveries,
    total: round2(recoveries.reduce((sum, one) => sum + one.amount, 0)),
  };
}

/** What actually gets handed over. */
export function net(gross: number, advanceDeducted: number, otherDeductions: number): number {
  // Floored at nothing for the same reason recovery is capped: a payslip is
  // not a bill.
  return round2(Math.max(0, gross - advanceDeducted - otherDeductions));
}

/**
 * The arrangements that applied in a given month.
 *
 * A raise is a new row rather than an edit, so the question "what was this
 * person on in March" is answered by dates rather than by hoping nobody
 * changed anything.
 */
export function activeIn<T extends { effectiveFrom: Date; effectiveTo?: Date | null }>(
  structures: T[],
  monthEnd: Date,
  monthStart: Date,
): T[] {
  return structures.filter(
    (structure) =>
      structure.effectiveFrom <= monthEnd &&
      (!structure.effectiveTo || structure.effectiveTo >= monthStart),
  );
}
