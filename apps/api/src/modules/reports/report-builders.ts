import { DocumentStatus, PrismaClient } from '@prisma/client';
import type { ReportKind } from '@decor/shared';
import { gstComponents, round2 } from '../../common/utils/pricing';
import { Sheet } from './report-workbook';
import {
  cashBookRows,
  gstSummaryRows,
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
 * reason. `report-builders.spec.ts` reads both against `@decor/shared` and
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

export const BUILDERS: Partial<Record<ReportKind, ReportBuilder>> = {
  CASH_BOOK: cashBook,
  RECEIVABLES: receivables,
  PAYOUT_LEDGER: payoutLedger,
  GST_SUMMARY: gstSummary,
  SALES_REGISTER: salesRegister,
  ORDER_REGISTER: orderRegister,
};

/**
 * Catalogued but not yet built, each with the reason.
 *
 * Listed rather than simply missing, so the rail can tell a report still to be
 * written from one somebody forgot to wire up. The service refuses these with
 * the same words rather than queueing a job that will produce an empty file.
 */
export const NOT_YET_BUILT: Partial<Record<ReportKind, string>> = {
  EXPENSES: 'still to be written',
  MATERIAL_AND_WASTE: 'still to be written',
  SALARY_REGISTER: 'still to be written',
  PURCHASE_REGISTER: 'still to be written',
  CLIENT_STATEMENT: 'still to be written',
  QUOTE_CONVERSION: 'still to be written',
};

export function builderFor(kind: string): ReportBuilder | undefined {
  return BUILDERS[kind as ReportKind];
}
