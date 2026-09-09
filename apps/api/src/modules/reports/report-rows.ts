/**
 * Turning the shop's rows into the rows of a spreadsheet.
 *
 * Pure on purpose. What a report says about money is a rule about the books,
 * and a rule you can only check by opening a workbook is a rule nobody checks.
 * Everything here takes plain records and returns plain records; the service
 * fetches, and the writer formats.
 *
 * Two of these carry the constraint the whole product is built around:
 *
 *  - `payoutRows` is the only place payouts appear, and it never subtracts
 *    them from anything. A payout sits *beside* an order.
 *  - `receivableRows` calls an order settled only when what was collected
 *    reaches what was charged. Not "near enough", not "less the payout".
 */

/** Two decimal places, the way money is stored. */
export function money(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

const sum = (values: number[]): number => money(values.reduce((total, v) => total + v, 0));

// ---------------------------------------------------------------------------
// Cash book
// ---------------------------------------------------------------------------

export interface LedgerRow {
  at: Date | string;
  direction: 'IN' | 'OUT' | 'TRANSFER';
  account: 'CASH' | 'BANK';
  amount: number;
  voucher: string;
  party?: string | null;
  accountHead?: string | null;
  reference?: string | null;
  note?: string | null;
}

export interface CashBookRow {
  date: string;
  voucher: string;
  party: string;
  head: string;
  account: string;
  moneyIn: number;
  moneyOut: number;
  balance: number;
  reference: string;
}

/**
 * Money in and out in the order it happened, with the balance after each.
 *
 * A running balance is the point of a cash book — a list of amounts with no
 * balance is a list, not a book — so the opening figure is a parameter rather
 * than assumed to be zero: a quarter's cash book that starts at nothing would
 * be wrong by everything the shop held on the first of April.
 */
export function cashBookRows(entries: LedgerRow[], opening = 0): CashBookRow[] {
  let balance = money(opening);

  return entries.map((entry) => {
    const amount = money(Math.abs(entry.amount));
    // TRANSFER is a move between the shop's own accounts. It is signed on the
    // row, so trust the sign rather than the direction word.
    const isIn = entry.direction === 'IN' || (entry.direction === 'TRANSFER' && entry.amount > 0);

    balance = money(balance + (isIn ? amount : -amount));

    return {
      date: isoDay(entry.at),
      voucher: entry.voucher,
      party: entry.party ?? '',
      head: entry.accountHead ?? '',
      account: entry.account,
      moneyIn: isIn ? amount : 0,
      moneyOut: isIn ? 0 : amount,
      balance,
      reference: entry.reference ?? entry.note ?? '',
    };
  });
}

// ---------------------------------------------------------------------------
// Receivables
// ---------------------------------------------------------------------------

export interface ChargedAndPaid {
  clientName: string;
  orderCode: string;
  invoiceNumber?: string | null;
  charged: number;
  credited: number;
  received: number;
}

export interface ReceivableRow extends ChargedAndPaid {
  due: number;
  settled: boolean;
}

/**
 * What each client still owes.
 *
 * `settled` is true only when everything charged has actually been collected.
 * It is deliberately not "due is small" and deliberately not reduced by any
 * payout recorded against the order: an order part-paid is an order part-paid,
 * and a spreadsheet that rounded that away would be a harder lie to catch than
 * the same lie on a screen.
 */
export function receivableRows(rows: ChargedAndPaid[]): ReceivableRow[] {
  return rows.map((row) => {
    const charged = money(row.charged);
    const credited = money(row.credited);
    const received = money(row.received);
    const due = money(charged - credited - received);

    return {
      ...row,
      charged,
      credited,
      received,
      due,
      settled: due <= 0,
    };
  });
}

// ---------------------------------------------------------------------------
// Payouts — their own report, never a column of somebody else's
// ---------------------------------------------------------------------------

export interface PayoutRow {
  date: string;
  orderCode: string;
  clientName: string;
  payee: string;
  amount: number;
  status: string;
  reference: string;
}

export interface DisbursementRecord {
  at: Date | string;
  orderCode?: string | null;
  clientName?: string | null;
  payee?: string | null;
  amount: number;
  status: string;
  reference?: string | null;
}

/**
 * Payouts, listed and totalled, and nothing else.
 *
 * There is no parameter here for folding these into an order's figures,
 * because there is no version of this product in which that is offered.
 */
export function payoutRows(records: DisbursementRecord[]): PayoutRow[] {
  return records.map((record) => ({
    date: isoDay(record.at),
    orderCode: record.orderCode ?? '',
    clientName: record.clientName ?? '',
    payee: record.payee ?? '',
    amount: money(record.amount),
    status: record.status,
    reference: record.reference ?? '',
  }));
}

// ---------------------------------------------------------------------------
// GST summary
// ---------------------------------------------------------------------------

export interface TaxableLine {
  ratePct: number;
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  /** A registered buyer makes it B2B; the GSTIN is what decides, not a flag. */
  buyerGstin?: string | null;
  hsn?: string | null;
}

export interface GstSummaryRow {
  slab: string;
  supply: 'B2B' | 'B2C';
  hsn: string;
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  tax: number;
}

/**
 * Taxable value and tax, grouped the way a return is filed.
 *
 * B2B or B2C is decided by whether the buyer had a GSTIN on the document, not
 * by anything somebody ticked afterwards — the invoice already recorded it,
 * and re-deciding it at export time is how a return stops matching the
 * invoices behind it.
 */
export function gstSummaryRows(lines: TaxableLine[]): GstSummaryRow[] {
  const groups = new Map<string, GstSummaryRow>();

  for (const line of lines) {
    const supply: 'B2B' | 'B2C' = line.buyerGstin?.trim() ? 'B2B' : 'B2C';
    const hsn = line.hsn?.trim() || '—';
    const slab = `${line.ratePct}%`;
    const key = `${slab}|${supply}|${hsn}`;

    const existing = groups.get(key) ?? {
      slab,
      supply,
      hsn,
      taxableValue: 0,
      cgst: 0,
      sgst: 0,
      igst: 0,
      tax: 0,
    };

    existing.taxableValue = money(existing.taxableValue + line.taxableValue);
    existing.cgst = money(existing.cgst + line.cgst);
    existing.sgst = money(existing.sgst + line.sgst);
    existing.igst = money(existing.igst + line.igst);
    existing.tax = money(existing.cgst + existing.sgst + existing.igst);

    groups.set(key, existing);
  }

  // Highest slab first, then B2B before B2C — the order a return is read in.
  return [...groups.values()].sort(
    (a, b) =>
      parseFloat(b.slab) - parseFloat(a.slab) ||
      a.supply.localeCompare(b.supply) ||
      a.hsn.localeCompare(b.hsn),
  );
}

// ---------------------------------------------------------------------------
// Order register — what is stuck, and for how long
// ---------------------------------------------------------------------------

export interface OrderRecord {
  code: string;
  clientName: string;
  status: string;
  statusSince: Date | string;
  total: number;
  received: number;
  createdAt: Date | string;
}

export interface OrderRegisterRow {
  code: string;
  clientName: string;
  status: string;
  daysInStage: number;
  total: number;
  received: number;
  due: number;
  age: number;
}

/**
 * Orders with how long they have sat where they are.
 *
 * The number worth having is days in the *current* stage, not age: an order
 * three months old and moving is fine, and one four days into a stage nothing
 * leaves is not.
 */
export function orderRegisterRows(orders: OrderRecord[], asOf: Date = new Date()): OrderRegisterRow[] {
  return orders.map((order) => {
    const total = money(order.total);
    const received = money(order.received);

    return {
      code: order.code,
      clientName: order.clientName,
      status: order.status,
      daysInStage: daysBetween(order.statusSince, asOf),
      total,
      received,
      due: money(total - received),
      age: daysBetween(order.createdAt, asOf),
    };
  });
}

// ---------------------------------------------------------------------------
// Totals
// ---------------------------------------------------------------------------

/**
 * The totals row, over whichever columns are money.
 *
 * A workbook handed to a CA gets totalled by them if it is not totalled here,
 * and a mismatch between their sum and ours is a conversation nobody wants.
 */
export function totalsFor<T extends Record<string, unknown>>(
  rows: T[],
  columns: readonly (keyof T)[],
): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const column of columns) {
    totals[String(column)] = sum(rows.map((row) => Number(row[column]) || 0));
  }
  return totals;
}

// ---------------------------------------------------------------------------

function isoDay(value: Date | string): string {
  if (typeof value === 'string') return value.slice(0, 10);
  // Local, not UTC: a receipt taken at 9pm in Meerut belongs to that day, and
  // toISOString would file it under the next one.
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Whole days between two calendar days, counted locally.
 *
 * Not milliseconds divided by a day. `new Date('2026-04-01')` is parsed as UTC
 * midnight while `new Date('2026-04-01T00:00:00')` is parsed as local midnight,
 * so subtracting the two in IST is out by five and a half hours — enough to
 * report an order as nine days in a stage it has been in for ten. Which is
 * also the wrong question: a shop counts days on a calendar, not in
 * twenty-four hour blocks since a timestamp.
 */
function daysBetween(from: Date | string, to: Date): number {
  const start = startOfLocalDay(from);
  const end = startOfLocalDay(to);
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 86_400_000));
}

function startOfLocalDay(value: Date | string): Date {
  if (typeof value === 'string') {
    const [year, month, day] = value.slice(0, 10).split('-').map(Number);
    return new Date(year, (month ?? 1) - 1, day ?? 1);
  }
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}
