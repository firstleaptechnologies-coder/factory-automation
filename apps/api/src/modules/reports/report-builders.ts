import { DocumentStatus, PrismaClient } from '@prisma/client';
import type { ReportKind } from '@fas/shared';
import { gstComponents, round2 } from '../../common/utils/pricing';
import { Sheet } from './report-workbook';
import { statementLines } from '../documents/statement';
import {
  StockKind,
  cashBookRows,
  gstSummaryRows,
  materialWasteRows,
  orderRegisterRows,
  payoutRows,
  receivableRows,
} from './report-rows';

/**
 * Where each report gets its rows.
 *
 * A builder fetches and hands what it found to the pure functions in
 * `report-rows.ts`; it does not decide what a figure means. That separation is
 * why the money rules are testable without a database, and why a query written
 * next year cannot quietly change what "settled" means.
 *
 * Every kind in the catalogue is either here or in `NOT_YET_BUILT` with a
 * reason. `report-builders.spec.ts` reads both against `@fas/shared` and
 * fails on a kind that is in neither — the same shape as `NOT_A_TRANSACTION`,
 * and for the same reason: a report that silently produces nothing is worse
 * than one that refuses.
 */

export interface BuildContext {
  prisma: PrismaClient;
  from?: Date | null;
  to?: Date | null;
  params: Record<string, unknown>;
  firmName?: string;
}

export interface BuiltReport {
  sheets: Sheet[];
  rowCount: number;
}

export type ReportBuilder = (context: BuildContext) => Promise<BuiltReport>;

/** A period as a `where` clause, for a column that holds a moment. */
const within = (from?: Date | null, to?: Date | null) =>
  from && to ? { gte: from, lte: endOfDay(to) } : undefined;

function endOfDay(date: Date): Date {
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return end;
}

// ---------------------------------------------------------------------------

const cashBook: ReportBuilder = async ({ prisma, from, to }) => {
  const entries = await prisma.ledgerEntry.findMany({
    where: { at: within(from, to) },
    orderBy: [{ at: 'asc' }, { createdAt: 'asc' }],
  });

  // Everything before the window, so the book opens where the last one closed.
  const before = from
    ? await prisma.ledgerEntry.aggregate({
        where: { at: { lt: from } },
        _sum: { amount: true },
      })
    : { _sum: { amount: null } };

  const rows = cashBookRows(
    entries.map((entry) => ({
      at: entry.at,
      direction: entry.direction as 'IN' | 'OUT' | 'TRANSFER',
      account: entry.account as 'CASH' | 'BANK',
      amount: Number(entry.amount),
      voucher: entry.voucher,
      party: entry.party,
      accountHead: entry.accountHead,
      reference: entry.reference,
      note: entry.note,
    })),
    Number(before._sum.amount ?? 0),
  );

  return {
    rowCount: rows.length,
    sheets: [
      {
        name: 'Cash book',
        note: from
          ? `Opening balance ${round2(Number(before._sum.amount ?? 0))}`
          : undefined,
        columns: [
          { key: 'date', header: 'Date', type: 'date' },
          { key: 'voucher', header: 'Voucher' },
          { key: 'party', header: 'Party' },
          { key: 'head', header: 'Head' },
          { key: 'account', header: 'Account' },
          { key: 'moneyIn', header: 'Money in', type: 'money' },
          { key: 'moneyOut', header: 'Money out', type: 'money' },
          { key: 'balance', header: 'Balance', type: 'money' },
          { key: 'reference', header: 'Reference' },
        ],
        rows,
        total: ['moneyIn', 'moneyOut'],
      },
    ],
  };
};

// ---------------------------------------------------------------------------

const receivables: ReportBuilder = async ({ prisma, from, to }) => {
  const invoices = await prisma.invoice.findMany({
    where: { status: DocumentStatus.ISSUED, issuedOn: within(from, to) },
    include: {
      creditNotes: { where: { status: DocumentStatus.ISSUED } },
      order: { select: { id: true, code: true } },
    },
    orderBy: { issuedOn: 'asc' },
  });

  const received = await prisma.payment.groupBy({
    by: ['orderId'],
    where: { orderId: { in: invoices.map((invoice) => invoice.orderId) } },
    _sum: { amount: true },
  });
  const paidByOrder = new Map(received.map((row) => [row.orderId, Number(row._sum.amount ?? 0)]));

  const rows = receivableRows(
    invoices.map((invoice) => ({
      clientName: invoice.clientName,
      orderCode: invoice.order?.code ?? '',
      invoiceNumber: invoice.code,
      charged: Number(invoice.total),
      credited: round2(
        invoice.creditNotes.reduce((sum, note) => sum + Number(note.total), 0),
      ),
      received: paidByOrder.get(invoice.orderId) ?? 0,
    })),
  );

  return {
    rowCount: rows.length,
    sheets: [
      {
        name: 'Receivables',
        note: 'Settled means everything charged has been collected. Payouts are not deducted here — they are a report of their own.',
        columns: [
          { key: 'clientName', header: 'Client' },
          { key: 'orderCode', header: 'Order' },
          { key: 'invoiceNumber', header: 'Invoice' },
          { key: 'charged', header: 'Charged', type: 'money' },
          { key: 'credited', header: 'Credited', type: 'money' },
          { key: 'received', header: 'Received', type: 'money' },
          { key: 'due', header: 'Due', type: 'money' },
          { key: 'settled', header: 'Settled' },
        ],
        rows: rows.map((row) => ({ ...row, settled: row.settled ? 'Yes' : 'No' })),
        total: ['charged', 'credited', 'received', 'due'],
      },
    ],
  };
};

// ---------------------------------------------------------------------------

/**
 * Payouts, on their own, totalled and never subtracted from anything.
 *
 * This builder deliberately reads `Disbursement` directly rather than going
 * anywhere near the transaction filters, which exclude payouts on purpose.
 */
const payoutLedger: ReportBuilder = async ({ prisma, from, to }) => {
  const disbursements = await prisma.disbursement.findMany({
    where: {
      OR: [{ paidAt: within(from, to) }, { paidAt: null, createdAt: within(from, to) }],
    },
    include: {
      order: { select: { code: true, client: { select: { name: true } } } },
      category: { select: { name: true } },
    },
    orderBy: [{ paidAt: 'asc' }, { createdAt: 'asc' }],
  });

  const rows = payoutRows(
    disbursements.map((row) => ({
      at: row.paidAt ?? row.createdAt,
      orderCode: row.order?.code,
      clientName: row.order?.client?.name,
      payee: row.payeeName,
      amount: Number(row.amount),
      status: row.status,
      reference: row.reference,
    })),
  ).map((row, index) => ({
    ...row,
    category: disbursements[index].category?.name ?? '',
    // What actually left the shop. A cancelled payout is still listed — a
    // figure that vanishes from this ledger is the one thing it must never do
    // — but totalling it would say money moved that never did. Running it
    // found exactly that: two cancelled payouts inflating the total by 12,200.
    paid: disbursements[index].status === 'PAID' ? Number(disbursements[index].amount) : 0,
  }));

  return {
    rowCount: rows.length,
    sheets: [
      {
        name: 'Payout ledger',
        note: 'Payouts sit beside the orders they belong to. Nothing here is netted off an order’s value or what it collected. Amount is what the payout says; Paid is what actually left, and only that is totalled.',
        columns: [
          { key: 'date', header: 'Date', type: 'date' },
          { key: 'orderCode', header: 'Order' },
          { key: 'clientName', header: 'Client' },
          { key: 'payee', header: 'Paid to' },
          { key: 'category', header: 'Category' },
          { key: 'amount', header: 'Amount', type: 'money' },
          { key: 'paid', header: 'Paid', type: 'money' },
          { key: 'status', header: 'Status' },
          { key: 'reference', header: 'Reference' },
        ],
        rows,
        total: ['paid'],
      },
    ],
  };
};

// ---------------------------------------------------------------------------

const gstSummary: ReportBuilder = async ({ prisma, from, to }) => {
  const invoices = await prisma.invoice.findMany({
    where: { status: DocumentStatus.ISSUED, issuedOn: within(from, to) },
    include: { items: true },
  });

  const lines = invoices.flatMap((invoice) =>
    invoice.items.map((item) => {
      // The split follows what the invoice recorded, not what the client's
      // address says today: a reprint after they move must not change which
      // pair of taxes was charged.
      const split = gstComponents(Number(item.taxAmount), invoice.interState);
      return {
        ratePct: Number(item.gstRatePct),
        taxableValue: Number(item.amount),
        cgst: split.cgst,
        sgst: split.sgst,
        igst: split.igst,
        buyerGstin: invoice.clientGstin,
        hsn: item.hsn,
      };
    }),
  );

  const rows = gstSummaryRows(lines);

  return {
    rowCount: rows.length,
    sheets: [
      {
        name: 'GST summary',
        note: 'B2B or B2C follows the GSTIN recorded on the invoice, so this agrees with the invoices behind it.',
        columns: [
          { key: 'slab', header: 'Slab' },
          { key: 'supply', header: 'Supply' },
          { key: 'hsn', header: 'HSN' },
          { key: 'taxableValue', header: 'Taxable value', type: 'money' },
          { key: 'cgst', header: 'CGST', type: 'money' },
          { key: 'sgst', header: 'SGST', type: 'money' },
          { key: 'igst', header: 'IGST', type: 'money' },
          { key: 'tax', header: 'Total tax', type: 'money' },
        ],
        rows,
        total: ['taxableValue', 'cgst', 'sgst', 'igst', 'tax'],
      },
    ],
  };
};

// ---------------------------------------------------------------------------

const salesRegister: ReportBuilder = async ({ prisma, from, to }) => {
  const invoices = await prisma.invoice.findMany({
    where: { issuedOn: within(from, to) },
    include: { order: { select: { code: true } } },
    orderBy: [{ issuedOn: 'asc' }, { code: 'asc' }],
  });

  const rows = invoices.map((invoice) => ({
    date: invoice.issuedOn.toISOString().slice(0, 10),
    code: invoice.code,
    orderCode: invoice.order?.code ?? '',
    clientName: invoice.clientName,
    gstin: invoice.clientGstin ?? '',
    supply: invoice.interState ? 'Inter-state' : 'Intra-state',
    taxable: Number(invoice.taxable),
    cgst: Number(invoice.cgst),
    sgst: Number(invoice.sgst),
    igst: Number(invoice.igst),
    total: Number(invoice.total),
    // Cancelled invoices stay on the register, marked. A number that vanishes
    // from a register is a number somebody has to explain.
    status: invoice.status,
  }));

  return {
    rowCount: rows.length,
    sheets: [
      {
        name: 'Sales register',
        note: 'Cancelled invoices are listed and marked rather than removed — the numbering has to remain accountable.',
        columns: [
          { key: 'date', header: 'Date', type: 'date' },
          { key: 'code', header: 'Invoice' },
          { key: 'orderCode', header: 'Order' },
          { key: 'clientName', header: 'Client' },
          { key: 'gstin', header: 'GSTIN' },
          { key: 'supply', header: 'Supply' },
          { key: 'taxable', header: 'Taxable', type: 'money' },
          { key: 'cgst', header: 'CGST', type: 'money' },
          { key: 'sgst', header: 'SGST', type: 'money' },
          { key: 'igst', header: 'IGST', type: 'money' },
          { key: 'total', header: 'Total', type: 'money' },
          { key: 'status', header: 'Status' },
        ],
        rows,
        total: ['taxable', 'cgst', 'sgst', 'igst', 'total'],
      },
    ],
  };
};

// ---------------------------------------------------------------------------

const orderRegister: ReportBuilder = async ({ prisma, from, to }) => {
  const orders = await prisma.order.findMany({
    where: from && to ? { createdAt: within(from, to) } : undefined,
    include: {
      client: { select: { name: true } },
      status: { select: { name: true } },
      payments: { select: { amount: true } },
      // When it entered the stage it is in now. There is no column for this:
      // a reversed move did not happen, so those are excluded, and the entry
      // that counts is the most recent one that moved it *into* its current
      // status — not simply the most recent entry.
      statusHistory: {
        where: { reversed: false },
        orderBy: { changedAt: 'desc' },
        select: { toStatusId: true, changedAt: true },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  const rows = orderRegisterRows(
    orders.map((order) => ({
      code: order.code,
      clientName: order.client?.name ?? '',
      status: order.status?.name ?? '',
      statusSince:
        order.statusHistory.find((entry) => entry.toStatusId === order.statusId)?.changedAt ??
        order.createdAt,
      total: Number(order.grandTotal ?? 0),
      received: round2(order.payments.reduce((sum, p) => sum + Number(p.amount), 0)),
      createdAt: order.createdAt,
    })),
  );

  return {
    rowCount: rows.length,
    sheets: [
      {
        name: 'Order register',
        note: 'Days in stage is what is worth reading: an old order that is moving is fine, a new one that is stuck is not.',
        columns: [
          { key: 'code', header: 'Order' },
          { key: 'clientName', header: 'Client' },
          { key: 'status', header: 'Stage' },
          { key: 'daysInStage', header: 'Days in stage', type: 'days' },
          { key: 'age', header: 'Age (days)', type: 'days' },
          { key: 'total', header: 'Value', type: 'money' },
          { key: 'received', header: 'Received', type: 'money' },
          { key: 'due', header: 'Due', type: 'money' },
        ],
        rows,
        total: ['total', 'received', 'due'],
      },
    ],
  };
};

// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// The rest of the catalogue
// ---------------------------------------------------------------------------

/**
 * What was spent, by category and by person.
 *
 * Reversals are listed rather than filtered out. A correction is a row with a
 * negative amount, so the totals net on their own — and a report that hid them
 * would disagree with the expense list, the ledger and the cash book, all of
 * which show both rows.
 */
const expenses: ReportBuilder = async ({ prisma, from, to }) => {
  const rows = await prisma.expense.findMany({
    where: { date: within(from, to) },
    orderBy: { date: 'asc' },
  });

  const detail = rows.map((row) => ({
    date: row.date.toISOString().slice(0, 10),
    description: row.description,
    category: row.spentType,
    paidBy: row.doneBy,
    paidTo: row.toName || row.vendor,
    method: row.paymentType,
    taxable: row.taxableValue == null ? null : Number(row.taxableValue),
    tax: row.taxAmount == null ? null : Number(row.taxAmount),
    itc: row.itcEligible ? 'Yes' : 'No',
    amount: Number(row.amount),
    // Named on the row, so a negative figure is never a mystery.
    correction: row.reversalOfId ? 'Correction' : '',
  }));

  const by = (key: 'category' | 'paidBy') => {
    const totals = new Map<string, number>();
    for (const row of detail) {
      totals.set(row[key], round2((totals.get(row[key]) ?? 0) + row.amount));
    }
    return [...totals.entries()]
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount);
  };

  const columns = [
    { key: 'name', header: 'Name' },
    { key: 'amount', header: 'Amount', type: 'money' as const },
  ];

  return {
    rowCount: detail.length,
    sheets: [
      {
        name: 'Expenses',
        note: 'A correction is a row with a negative amount, listed beside the one it takes back. The totals net on their own.',
        columns: [
          { key: 'date', header: 'Date', type: 'date' },
          { key: 'description', header: 'What' },
          { key: 'category', header: 'Category' },
          { key: 'paidBy', header: 'Paid by' },
          { key: 'paidTo', header: 'Paid to' },
          { key: 'method', header: 'Method' },
          { key: 'taxable', header: 'Taxable', type: 'money' },
          { key: 'tax', header: 'Tax', type: 'money' },
          { key: 'itc', header: 'ITC' },
          { key: 'amount', header: 'Amount', type: 'money' },
          { key: 'correction', header: '' },
        ],
        rows: detail,
        total: ['taxable', 'tax', 'amount'],
      },
      { name: 'By category', columns, rows: by('category'), total: ['amount'] },
      { name: 'By person', columns, rows: by('paidBy'), total: ['amount'] },
    ],
  };
};

/**
 * What was consumed, what was wasted, and what each was worth.
 *
 * Offcut is counted apart from waste on purpose: the usable remainder of a
 * sheet went back on the rack and is not a loss, and folding the two together
 * would make a shop that saves its offcuts look like one that does not.
 */
const materialAndWaste: ReportBuilder = async ({ prisma, from, to }) => {
  const moves = await prisma.stockMove.findMany({
    where: { at: within(from, to) },
    include: {
      material: { select: { name: true } },
      thickness: { select: { label: true } },
    },
    orderBy: { at: 'asc' },
  });

  const rows = materialWasteRows(
    moves.map((move) => ({
      material: move.material?.name ?? '',
      thickness: move.thickness?.label ?? '',
      unit: move.unit,
      kind: move.kind as StockKind,
      quantity: Number(move.quantity),
      rate: move.rate == null ? null : Number(move.rate),
    })),
  );

  return {
    rowCount: rows.length,
    sheets: [
      {
        name: 'Material and waste',
        note: 'Offcut is the usable remainder that went back on the rack, counted apart from waste. Waste percentage is of what was consumed.',
        columns: [
          { key: 'material', header: 'Material' },
          { key: 'thickness', header: 'Thickness' },
          { key: 'unit', header: 'Unit' },
          { key: 'received', header: 'Received', type: 'number' },
          { key: 'consumed', header: 'Consumed', type: 'number' },
          { key: 'offcut', header: 'Offcut', type: 'number' },
          { key: 'wasted', header: 'Wasted', type: 'number' },
          { key: 'wastePct', header: 'Waste %', type: 'number' },
          { key: 'wasteValue', header: 'Waste value', type: 'money' },
        ],
        rows,
        total: ['received', 'consumed', 'offcut', 'wasted', 'wasteValue'],
      },
    ],
  };
};

/** Payslips in the period, with what was recovered against each. */
const salaryRegister: ReportBuilder = async ({ prisma, from, to }) => {
  const payslips = await prisma.payslip.findMany({
    where: { run: { month: within(from, to) } },
    include: {
      employee: { select: { code: true, name: true } },
      run: { select: { month: true, status: true, paidAt: true } },
    },
    orderBy: [{ run: { month: 'asc' } }, { employee: { code: 'asc' } }],
  });

  const rows = payslips.map((slip) => ({
    month: slip.run.month.toISOString().slice(0, 7),
    code: slip.employee?.code ?? '',
    name: slip.employee?.name ?? '',
    payableDays: Number(slip.payableDays),
    overtimeHours: round2(slip.overtimeMinutes / 60),
    pieces: slip.pieces ?? null,
    gross: Number(slip.gross),
    advance: Number(slip.advanceDeducted),
    other: Number(slip.otherDeductions),
    net: Number(slip.net),
    status: slip.run.status,
  }));

  return {
    rowCount: rows.length,
    sheets: [
      {
        name: 'Salary register',
        note: 'Advance is what was recovered from an outstanding advance this month, not a new one given.',
        columns: [
          { key: 'month', header: 'Month' },
          { key: 'code', header: 'Code' },
          { key: 'name', header: 'Employee' },
          { key: 'payableDays', header: 'Payable days', type: 'number' },
          { key: 'overtimeHours', header: 'OT hours', type: 'number' },
          { key: 'pieces', header: 'Pieces', type: 'number' },
          { key: 'gross', header: 'Gross', type: 'money' },
          { key: 'advance', header: 'Advance recovered', type: 'money' },
          { key: 'other', header: 'Other deductions', type: 'money' },
          { key: 'net', header: 'Net paid', type: 'money' },
          { key: 'status', header: 'Run' },
        ],
        rows,
        total: ['gross', 'advance', 'other', 'net'],
      },
    ],
  };
};

/** Purchases raised, received and billed, with vendor and tax. */
const purchaseRegister: ReportBuilder = async ({ prisma, from, to }) => {
  const purchases = await prisma.purchase.findMany({
    where: {
      OR: [
        { orderedOn: within(from, to) },
        { billedOn: within(from, to) },
        { orderedOn: null, billedOn: null, createdAt: within(from, to) },
      ],
    },
    include: { vendor: { select: { name: true, gstin: true } } },
    orderBy: [{ orderedOn: 'asc' }, { createdAt: 'asc' }],
  });

  const rows = purchases.map((purchase) => ({
    code: purchase.code,
    vendor: purchase.vendor?.name ?? '',
    gstin: purchase.vendor?.gstin ?? '',
    status: purchase.status,
    orderedOn: purchase.orderedOn?.toISOString().slice(0, 10) ?? '',
    billNumber: purchase.billNumber ?? '',
    billedOn: purchase.billedOn?.toISOString().slice(0, 10) ?? '',
    paidOn: purchase.paidOn?.toISOString().slice(0, 10) ?? '',
    subtotal: Number(purchase.subtotal),
    tax: Number(purchase.taxTotal),
    otherCharges: Number(purchase.otherCharges),
    total: Number(purchase.total),
    // Cancelled purchases are listed and marked, never removed: the numbering
    // has to stay accountable, exactly as it does on the sales register.
    settled: purchase.paidOn ? 'Paid' : 'Unpaid',
  }));

  return {
    rowCount: rows.length,
    sheets: [
      {
        name: 'Purchase register',
        note: 'Cancelled purchases are listed and marked rather than removed.',
        columns: [
          { key: 'code', header: 'Purchase' },
          { key: 'vendor', header: 'Vendor' },
          { key: 'gstin', header: 'GSTIN' },
          { key: 'status', header: 'Status' },
          { key: 'orderedOn', header: 'Ordered', type: 'date' },
          { key: 'billNumber', header: 'Bill no.' },
          { key: 'billedOn', header: 'Billed', type: 'date' },
          { key: 'paidOn', header: 'Paid', type: 'date' },
          { key: 'subtotal', header: 'Subtotal', type: 'money' },
          { key: 'tax', header: 'Tax', type: 'money' },
          { key: 'otherCharges', header: 'Other', type: 'money' },
          { key: 'total', header: 'Total', type: 'money' },
          { key: 'settled', header: 'Settled' },
        ],
        rows,
        total: ['subtotal', 'tax', 'otherCharges', 'total'],
      },
    ],
  };
};

/**
 * One client: everything charged and everything received, in order.
 *
 * A running balance, because that is what a statement is for — the client
 * wants to know what they owe today, not to add up a column themselves.
 *
 * Payouts recorded against these orders do not appear and are not deducted.
 * A payout is the shop's money going out; it has nothing to do with what this
 * client was charged, and putting it here would be the netting-off the books
 * must not do.
 */
const clientStatement: ReportBuilder = async ({ prisma, from, to, params }) => {
  const clientId = String(params.clientId ?? '');
  if (!clientId) throw new Error('A client statement needs a client');

  const client = await prisma.client.findFirst({
    where: { id: clientId },
    select: { name: true, gstin: true },
  });
  if (!client) throw new Error('That client does not exist');

  // The same lines the printed statement uses. Written separately once, which
  // is how a workbook and the paper beside it come to disagree about a
  // balance — and the client is holding the paper.
  const lines = await statementLines(prisma, clientId, from ?? null, to ?? null);

  return {
    rowCount: lines.length,
    sheets: [
      {
        name: 'Statement',
        note: `${client.name}${client.gstin ? ` · ${client.gstin}` : ''} — balance is what is owed after each row. Payouts are not shown here and are never deducted from what a client was charged.`,
        columns: [
          { key: 'date', header: 'Date', type: 'date' },
          { key: 'kind', header: 'Entry' },
          { key: 'reference', header: 'Reference' },
          { key: 'charged', header: 'Charged', type: 'money' },
          { key: 'received', header: 'Received', type: 'money' },
          { key: 'balance', header: 'Balance', type: 'money' },
        ],
        rows: lines,
        total: ['charged', 'received'],
      },
    ],
  };
};

/**
 * Quotes raised against quotes won, and what was left on the table.
 *
 * Converted is the only thing that counts as won: a quote marked accepted that
 * never became an order is a conversation, not a sale, and counting it would
 * flatter the number the shop uses to decide how it prices.
 */
const quoteConversion: ReportBuilder = async ({ prisma, from, to }) => {
  const estimates = await prisma.estimate.findMany({
    where: { issuedOn: within(from, to) },
    include: { client: { select: { name: true } } },
    orderBy: { issuedOn: 'asc' },
  });

  const detail = estimates.map((estimate) => ({
    date: estimate.issuedOn.toISOString().slice(0, 10),
    code: estimate.code,
    client: estimate.client?.name ?? estimate.clientName ?? '',
    status: estimate.status,
    won: estimate.status === 'CONVERTED' ? 'Yes' : 'No',
    value: Number(estimate.grandTotal),
  }));

  const counts = new Map<string, { status: string; quotes: number; value: number }>();
  for (const row of detail) {
    const seen = counts.get(row.status) ?? { status: row.status, quotes: 0, value: 0 };
    seen.quotes += 1;
    seen.value = round2(seen.value + row.value);
    counts.set(row.status, seen);
  }

  const raised = detail.length;
  const converted = detail.filter((row) => row.won === 'Yes');
  const wonValue = round2(converted.reduce((s, r) => s + r.value, 0));
  const raisedValue = round2(detail.reduce((s, r) => s + r.value, 0));

  // The percentage gets a column of its own. Put in the count column it reads
  // as forty quotes rather than forty per cent.
  const summary = [
    { measure: 'Quotes raised', quotes: raised, value: raisedValue, percent: null },
    { measure: 'Turned into orders', quotes: converted.length, value: wonValue, percent: null },
    {
      measure: 'Conversion',
      quotes: null,
      value: null,
      percent: raised > 0 ? round2((converted.length / raised) * 100) : 0,
    },
    {
      measure: 'Value won',
      quotes: null,
      value: null,
      percent: raisedValue > 0 ? round2((wonValue / raisedValue) * 100) : 0,
    },
  ];

  return {
    rowCount: detail.length,
    sheets: [
      {
        name: 'Conversion',
        note: 'Only a quote that became an order counts as won. One marked accepted that never converted is a conversation, not a sale.',
        columns: [
          { key: 'measure', header: 'Measure' },
          { key: 'quotes', header: 'Quotes', type: 'number' },
          { key: 'value', header: 'Value', type: 'money' },
          { key: 'percent', header: 'Per cent', type: 'number' },
        ],
        rows: summary,
      },
      {
        name: 'By status',
        columns: [
          { key: 'status', header: 'Status' },
          { key: 'quotes', header: 'Quotes', type: 'number' },
          { key: 'value', header: 'Value', type: 'money' },
        ],
        rows: [...counts.values()].sort((a, b) => b.value - a.value),
        total: ['quotes', 'value'],
      },
      {
        name: 'Quotes',
        columns: [
          { key: 'date', header: 'Date', type: 'date' },
          { key: 'code', header: 'Quote' },
          { key: 'client', header: 'Client' },
          { key: 'status', header: 'Status' },
          { key: 'won', header: 'Won' },
          { key: 'value', header: 'Value', type: 'money' },
        ],
        rows: detail,
        total: ['value'],
      },
    ],
  };
};

export const BUILDERS: Partial<Record<ReportKind, ReportBuilder>> = {
  CASH_BOOK: cashBook,
  RECEIVABLES: receivables,
  PAYOUT_LEDGER: payoutLedger,
  GST_SUMMARY: gstSummary,
  SALES_REGISTER: salesRegister,
  ORDER_REGISTER: orderRegister,
  EXPENSES: expenses,
  MATERIAL_AND_WASTE: materialAndWaste,
  SALARY_REGISTER: salaryRegister,
  PURCHASE_REGISTER: purchaseRegister,
  CLIENT_STATEMENT: clientStatement,
  QUOTE_CONVERSION: quoteConversion,
};

/**
 * Catalogued but not yet built, each with the reason.
 *
 * Listed rather than simply missing, so the rail can tell a report still to be
 * written from one somebody forgot to wire up. The service refuses these with
 * the same words rather than queueing a job that will produce an empty file.
 */
export const NOT_YET_BUILT: Partial<Record<ReportKind, string>> = {};

export function builderFor(kind: string): ReportBuilder | undefined {
  return BUILDERS[kind as ReportKind];
}
