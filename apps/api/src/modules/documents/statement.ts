import { DocumentStatus, PrismaClient } from '@prisma/client';
import { money } from '../reports/report-rows';
import type { StatementLine } from './statement-document';

/**
 * What a client was charged and what they paid, in the order it happened.
 *
 * One source for both the workbook and the printed statement. They were
 * written separately first, which is how a spreadsheet and the paper beside it
 * come to disagree about a balance — and the client is holding the paper.
 *
 * Payouts recorded against these orders do not appear and are not deducted. A
 * payout is the shop's money going out; it has nothing to do with what this
 * client was charged.
 */
export async function statementLines(
  prisma: PrismaClient,
  clientId: string,
  from: Date | null,
  to: Date | null,
): Promise<StatementLine[]> {
  const window = from && to ? { gte: from, lte: to } : undefined;

  const [invoices, payments] = await Promise.all([
    prisma.invoice.findMany({
      where: { order: { clientId }, issuedOn: window },
      include: { creditNotes: { where: { status: DocumentStatus.ISSUED } } },
      orderBy: { issuedOn: 'asc' },
    }),
    prisma.payment.findMany({
      where: { order: { clientId }, receivedAt: window },
      include: { order: { select: { code: true } } },
      orderBy: { receivedAt: 'asc' },
    }),
  ]);

  const lines: StatementLine[] = [];

  for (const invoice of invoices) {
    // A cancelled invoice claims nothing, so it charges nothing — but it is
    // listed, because the client may be holding a copy of it.
    const cancelled = invoice.status !== DocumentStatus.ISSUED;
    lines.push({
      date: invoice.issuedOn.toISOString().slice(0, 10),
      kind: cancelled ? 'Invoice (cancelled)' : 'Invoice',
      reference: invoice.code,
      charged: cancelled ? 0 : Number(invoice.total),
      received: 0,
      balance: 0,
    });

    for (const note of invoice.creditNotes) {
      lines.push({
        date: note.issuedOn.toISOString().slice(0, 10),
        kind: 'Credit note',
        reference: note.code,
        charged: -Number(note.total),
        received: 0,
        balance: 0,
      });
    }
  }

  for (const payment of payments) {
    lines.push({
      date: payment.receivedAt.toISOString().slice(0, 10),
      kind: 'Payment',
      reference: payment.order?.code ?? '',
      charged: 0,
      received: Number(payment.amount),
      balance: 0,
    });
  }

  lines.sort((a, b) => a.date.localeCompare(b.date));

  let balance = 0;
  for (const line of lines) {
    balance = money(balance + line.charged - line.received);
    line.balance = balance;
  }

  return lines;
}
