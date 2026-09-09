import { date, esc, money, safeColor, sheet } from './invoice-document';

/**
 * A client statement, as paper.
 *
 * The same sheet the invoices print on — letterhead, firm block, the shop's
 * accent — because a client who receives an invoice and a statement in the
 * same week should not be looking at two different companies' stationery.
 *
 * It is a *statement*, not a demand: it lists what was charged and what was
 * received in the order it happened, and ends at the balance. Two rules it
 * carries from the ledger:
 *
 *  - **A cancelled invoice is listed and charges nothing.** The client may be
 *    holding a copy of it, so leaving it out invites the phone call this
 *    document exists to avoid.
 *  - **No payout appears, and none is deducted.** A payout is the shop's money
 *    going out; it has nothing to do with what this client was charged, and
 *    putting it on their paper would be the netting-off the books must not do.
 */

export interface StatementLine {
  date: string;
  kind: string;
  reference: string;
  charged: number;
  received: number;
  balance: number;
}

export interface StatementDocumentInput {
  client: { name: string; gstin?: string | null; address?: string | null };
  firm: Record<string, unknown>;
  letterheadUrl?: string | null;
  period?: { from?: string | null; to?: string | null };
  lines: StatementLine[];
}

export function renderStatementHtml(input: StatementDocumentInput): string {
  const { client, firm, lines } = input;
  const accent = safeColor((firm as { accentColor?: unknown }).accentColor) ?? '#E4232F';

  const charged = lines.reduce((sum, line) => sum + Number(line.charged ?? 0), 0);
  const received = lines.reduce((sum, line) => sum + Number(line.received ?? 0), 0);
  const balance = lines.length ? lines[lines.length - 1].balance : 0;

  const rows = lines
    .map(
      (line) => `
      <tr>
        <td class="c">${date(line.date)}</td>
        <td>${esc(line.kind)}</td>
        <td>${esc(line.reference)}</td>
        <td class="r">${line.charged ? money(line.charged) : ''}</td>
        <td class="r">${line.received ? money(line.received) : ''}</td>
        <td class="r"><strong>${money(line.balance)}</strong></td>
      </tr>`,
    )
    .join('');

  const period =
    input.period?.from && input.period?.to
      ? `${date(input.period.from)} to ${date(input.period.to)}`
      : 'All time';

  // Owed to the shop, or sitting with them as a credit. Saying which is the
  // difference between a statement somebody acts on and one they query.
  const owing = balance > 0;
  const settled = Math.abs(balance) < 0.005;

  const body = `
  <div class="meta">
    <div>
      <div class="label">Statement for</div>
      <div class="strong">${esc(client.name)}</div>
      ${client.gstin ? `<div class="small">GSTIN ${esc(client.gstin)}</div>` : ''}
      ${client.address ? `<div class="small">${esc(client.address)}</div>` : ''}
    </div>
    <div class="right">
      <div class="label">Period</div>
      <div class="strong">${esc(period)}</div>
    </div>
  </div>

  ${
    lines.length
      ? `<table class="lines">
    <thead>
      <tr>
        <th class="c">Date</th>
        <th>Entry</th>
        <th>Reference</th>
        <th class="r">Charged</th>
        <th class="r">Received</th>
        <th class="r">Balance</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
    <tfoot>
      <tr>
        <td colspan="3" class="r"><strong>Total</strong></td>
        <td class="r"><strong>${money(charged)}</strong></td>
        <td class="r"><strong>${money(received)}</strong></td>
        <td class="r"></td>
      </tr>
    </tfoot>
  </table>`
      : `<p class="empty">Nothing charged or received in this period.</p>`
  }

  <div class="closing">
    <div class="closing-label">${
      settled ? 'Settled in full' : owing ? 'Balance due' : 'In credit'
    }</div>
    <div class="closing-amount">${money(Math.abs(balance))}</div>
  </div>

  <p class="note">
    A cancelled invoice is shown and charges nothing. Amounts paid to others on
    your behalf are not part of this statement and are never deducted from it.
  </p>

  <style>
    .meta { display: flex; justify-content: space-between; gap: 16mm; margin-bottom: 8mm; }
    .meta .right { text-align: right; }
    .label { font-size: 8pt; letter-spacing: .08em; text-transform: uppercase; opacity: .55; }
    .strong { font-weight: 700; font-size: 11pt; }
    .small { font-size: 9pt; opacity: .75; }
    table.lines { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
    table.lines th {
      text-align: left; font-size: 8pt; text-transform: uppercase; letter-spacing: .06em;
      border-bottom: 1px solid ${accent}; padding: 2mm 1.5mm; opacity: .7;
    }
    table.lines td { padding: 1.8mm 1.5mm; border-bottom: .3pt solid #E4E7EC; }
    table.lines tfoot td { border-top: 1px solid #9AA1AC; border-bottom: none; }
    table.lines .r { text-align: right; }
    table.lines .c { text-align: center; white-space: nowrap; }
    .empty { font-size: 10pt; opacity: .7; }
    .closing {
      margin-top: 8mm; padding: 4mm 5mm; border-left: 3px solid ${accent};
      background: #F7F8FA; display: flex; justify-content: space-between; align-items: baseline;
    }
    .closing-label { font-size: 9pt; letter-spacing: .06em; text-transform: uppercase; opacity: .7; }
    .closing-amount { font-size: 15pt; font-weight: 700; }
    .note { margin-top: 6mm; font-size: 8pt; opacity: .6; line-height: 1.5; }
  </style>`;

  return sheet({
    title: `Statement — ${client.name}`,
    docType: 'Statement of account',
    accent,
    firm,
    letterheadUrl: input.letterheadUrl,
    body,
  });
}
