/**
 * What the shop can take out of the system, and what each one is.
 *
 * A report is asked for, built by the worker, and downloaded later — so the
 * catalogue has to exist in one place both clients and the API agree on: the
 * screens list from it, the API validates against it, and a rail fails when a
 * kind is declared here without a builder behind it.
 *
 * Two rules run through the whole set, and they are the reason this is a
 * registry rather than a switch somebody extends:
 *
 *  1. **Payouts are their own report.** They sit beside an order and are never
 *     folded into it. There is no "include payouts" option to forget to tick
 *     and no export that nets them off, because the netting is the thing the
 *     books must not do.
 *  2. **Nothing reports an order as settled for less than it collected.** A
 *     receivables export that showed a part-paid order as clear would be a
 *     lie told in a spreadsheet, which is harder to catch than one told on a
 *     screen.
 */

export type ReportStatus = 'QUEUED' | 'GENERATING' | 'READY' | 'FAILED' | 'EXPIRED';

export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  QUEUED: 'Waiting',
  GENERATING: 'Building',
  READY: 'Ready',
  FAILED: 'Failed',
  EXPIRED: 'Expired',
};

export type ReportFormat = 'XLSX' | 'PDF';

/**
 * Every report this system knows how to build.
 *
 * Kept as a string rather than a database enum so that adding one is a code
 * change and not a migration — the same choice `LedgerEntry.sourceType` makes
 * for the same reason.
 */
export type ReportKind =
  | 'GST_SUMMARY'
  | 'SALES_REGISTER'
  | 'ORDER_REGISTER'
  | 'CASH_BOOK'
  | 'RECEIVABLES'
  | 'PAYOUT_LEDGER'
  | 'EXPENSES'
  | 'MATERIAL_AND_WASTE'
  | 'SALARY_REGISTER'
  | 'PURCHASE_REGISTER'
  | 'CLIENT_STATEMENT'
  | 'QUOTE_CONVERSION';

export interface ReportDefinition {
  kind: ReportKind;
  label: string;
  /** One line on the screen, saying what the file will contain. */
  description: string;
  /** Grouping on the reports screen. */
  group: 'Tax' | 'Sales' | 'Money' | 'Work' | 'People' | 'Buying';
  /** Whether a date range is required, optional, or meaningless. */
  period: 'required' | 'optional' | 'none';
  formats: readonly ReportFormat[];
  /** Set when the report is about one client, one employee, and so on. */
  subject?: 'client';
}

export const REPORTS: readonly ReportDefinition[] = [
  {
    kind: 'GST_SUMMARY',
    label: 'GST summary',
    description: 'Taxable value and tax by slab, split B2B and B2C, with HSN.',
    group: 'Tax',
    period: 'required',
    formats: ['XLSX'],
  },
  {
    kind: 'SALES_REGISTER',
    label: 'Sales register',
    description: 'Every invoice raised in the period, with its tax split.',
    group: 'Sales',
    period: 'required',
    formats: ['XLSX'],
  },
  {
    kind: 'ORDER_REGISTER',
    label: 'Order register',
    description: 'Orders with the stage they are in and how long they have sat there.',
    group: 'Work',
    period: 'optional',
    formats: ['XLSX'],
  },
  {
    kind: 'CASH_BOOK',
    label: 'Cash book',
    description: 'Money in and out, by account, in the order it happened.',
    group: 'Money',
    period: 'required',
    formats: ['XLSX'],
  },
  {
    kind: 'RECEIVABLES',
    label: 'Receivables',
    description: 'What each client has been charged, has paid, and still owes.',
    group: 'Money',
    period: 'optional',
    formats: ['XLSX'],
  },
  {
    kind: 'PAYOUT_LEDGER',
    label: 'Payout ledger',
    description:
      'Payouts recorded against orders. Its own report — payouts are never netted off an order.',
    group: 'Money',
    period: 'required',
    formats: ['XLSX'],
  },
  {
    kind: 'EXPENSES',
    label: 'Expenses',
    description: 'What was spent, by category and by person.',
    group: 'Money',
    period: 'required',
    formats: ['XLSX'],
  },
  {
    kind: 'MATERIAL_AND_WASTE',
    label: 'Material and waste',
    description: 'What was consumed, what was wasted, and the value of both.',
    group: 'Work',
    period: 'required',
    formats: ['XLSX'],
  },
  {
    kind: 'SALARY_REGISTER',
    label: 'Salary register',
    description: 'Payslips in the period, with advances recovered against each.',
    group: 'People',
    period: 'required',
    formats: ['XLSX'],
  },
  {
    kind: 'PURCHASE_REGISTER',
    label: 'Purchase register',
    description: 'Purchases raised, received and billed, with vendor and tax.',
    group: 'Buying',
    period: 'required',
    formats: ['XLSX'],
  },
  {
    kind: 'CLIENT_STATEMENT',
    label: 'Client statement',
    description: 'One client: everything charged and everything received.',
    group: 'Sales',
    period: 'optional',
    formats: ['XLSX', 'PDF'],
    subject: 'client',
  },
  {
    kind: 'QUOTE_CONVERSION',
    label: 'Quote conversion',
    description: 'Quotes raised against quotes won, and what was left on the table.',
    group: 'Sales',
    period: 'required',
    formats: ['XLSX'],
  },
] as const;

const BY_KIND = new Map(REPORTS.map((report) => [report.kind, report]));

export const REPORT_KINDS = REPORTS.map((report) => report.kind);

export function reportDefinition(kind: string): ReportDefinition | undefined {
  return BY_KIND.get(kind as ReportKind);
}

export const REPORT_LABELS: Record<ReportKind, string> = Object.fromEntries(
  REPORTS.map((report) => [report.kind, report.label]),
) as Record<ReportKind, string>;

/**
 * Whether a request for this report makes sense, before anything is queued.
 *
 * Answered here rather than in the API so the screens can refuse in the same
 * words, and so a report that needs a period cannot be queued without one and
 * then fail an hour later in a worker nobody is watching.
 */
export function reportRequestError(request: {
  kind: string;
  format?: string;
  from?: string | null;
  to?: string | null;
  clientId?: string | null;
}): string | null {
  const definition = reportDefinition(request.kind);
  if (!definition) return `There is no report called "${request.kind}".`;

  const format = (request.format ?? definition.formats[0]) as ReportFormat;
  if (!definition.formats.includes(format)) {
    return `${definition.label} cannot be produced as ${format}.`;
  }

  if (definition.period === 'required' && (!request.from || !request.to)) {
    return `${definition.label} needs a period.`;
  }

  if (request.from && request.to && request.from > request.to) {
    return 'The period ends before it starts.';
  }

  if (definition.subject === 'client' && !request.clientId) {
    return `${definition.label} is about one client, so it needs one.`;
  }

  return null;
}

/** A file name somebody can find again in a downloads folder. */
export function reportFileName(
  kind: ReportKind,
  format: ReportFormat,
  period: { from?: string | null; to?: string | null },
): string {
  const label = (REPORT_LABELS[kind] ?? kind).toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const window = period.from && period.to ? `-${period.from}-to-${period.to}` : '';
  return `${label}${window}.${format.toLowerCase()}`;
}
