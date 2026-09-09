/**
 * The paper: a tax invoice, a delivery challan and a credit note.
 *
 * Rendered as HTML on the server, like the estimate and the letter, and for the
 * same reason: the figures and the layout have to be identical whether the
 * document is printed from the web, turned into a PDF on a phone, or emailed. A
 * second implementation is a second set of totals waiting to disagree with the
 * first.
 *
 * Everything drawn here comes off the document row rather than out of the
 * order. An invoice reprinted next year has to be the one that went out — the
 * client's address as it was, the rates as they were, the tax pair that was
 * actually charged — so nothing on this page consults a live record.
 *
 * The layout follows the shop's estimate, because the people receiving these
 * already know how to read that page.
 */

interface Party {
  name?: string | null;
  gstin?: string | null;
  address?: string | null;
  state?: string | null;
}

export interface InvoiceDocumentInput {
  invoice: Record<string, any>;
  firm: Record<string, any>;
  /** The shop's standing terms, when the invoice did not carry its own. */
  terms?: string | null;
  letterheadUrl?: string | null;
  logoUrl?: string | null;
}

/**
 * A tax invoice.
 *
 * Two things on it are not decoration. The tax columns follow
 * `invoice.interState`, which was decided once when the invoice was raised —
 * printing the wrong pair invalidates the document. And a cancelled invoice is
 * stamped as cancelled across the sheet rather than quietly reprinted: the
 * number stays used, so the only thing standing between a void invoice and
 * somebody paying it is the paper saying so.
 */
export function renderInvoiceHtml(input: InvoiceDocumentInput): string {
  const { invoice, firm } = input;
  const accent = safeColor(firm.accentColor) ?? '#E4232F';
  const cancelled = invoice.status === 'CANCELLED';

  const items: Record<string, any>[] = invoice.items ?? [];
  const rows = items
    .map(
      (item, index) => `
      <tr>
        <td class="c">${index + 1}</td>
        <td>${esc(item.description)}</td>
        <td>${esc(item.hsn ?? '')}</td>
        <td class="r">${num(item.quantity, 2)}</td>
        <td class="c">${esc(item.unit ?? '')}</td>
        <td class="r">${money(item.rate)}</td>
        <td class="r">${money(item.taxAmount)} <span class="pct">(${num(
          item.gstRatePct,
          1,
        )}%)</span></td>
        <td class="r"><strong>${money(item.amount)}</strong></td>
      </tr>`,
    )
    .join('');

  const totalQty = items.reduce((sum, item) => sum + Number(item.quantity ?? 0), 0);
  const taxTotal =
    Number(invoice.cgst ?? 0) + Number(invoice.sgst ?? 0) + Number(invoice.igst ?? 0);

  // Intra-state charges CGST and SGST at half the rate each; inter-state
  // charges one IGST line. The invoice stored which it was, so a reprint after
  // the client moves states cannot change the paper that was issued.
  const taxRows = invoice.interState
    ? `<tr><td>IGST</td><td class="r">${money(invoice.igst)}</td></tr>`
    : `<tr><td>CGST</td><td class="r">${money(invoice.cgst)}</td></tr>
       <tr><td>SGST</td><td class="r">${money(invoice.sgst)}</td></tr>`;

  const credited: Record<string, any>[] = (invoice.creditNotes ?? []).filter(
    (note: Record<string, any>) => note.status !== 'CANCELLED',
  );
  const creditedTotal = credited.reduce(
    (sum, note) => sum + Number(note.total ?? 0),
    0,
  );

  return sheet({
    title: `${String(invoice.code ?? 'Invoice')}`,
    docType: 'Tax Invoice',
    accent,
    firm,
    letterheadUrl: input.letterheadUrl,
    cancelled: cancelled ? String(invoice.cancelReason ?? '') : null,
    body: `
    ${parties({
      accent,
      heading: 'Bill To',
      client: {
        name: invoice.clientName,
        gstin: invoice.clientGstin,
        address: invoice.clientAddress,
        state: invoice.clientState,
      },
      facts: [
        ['Invoice No.:', esc(invoice.code)],
        ['Date:', date(invoice.issuedOn)],
        ...(invoice.dueOn ? [['Due:', date(invoice.dueOn)] as [string, string]] : []),
        ...(invoice.order?.code
          ? [['Order:', esc(invoice.order.code)] as [string, string]]
          : []),
        ...(invoice.firmGstin
          ? [['Our GSTIN:', esc(invoice.firmGstin)] as [string, string]]
          : []),
      ],
    })}

    <table class="lines">
      <thead><tr>
        <th style="width:5%">#</th>
        <th style="width:33%">Description</th>
        <th style="width:10%">HSN/ SAC</th>
        <th style="width:9%">Qty</th>
        <th style="width:7%">Unit</th>
        <th style="width:12%">Rate</th>
        <th style="width:12%">GST</th>
        <th style="width:14%">Amount</th>
      </tr></thead>
      <tbody>
        ${rows}
        <tr class="total">
          <td></td><td>Total</td><td></td>
          <td class="r">${num(totalQty, 2)}</td>
          <td></td><td></td>
          <td class="r">${money(taxTotal)}</td>
          <td class="r">${money(invoice.total)}</td>
        </tr>
      </tbody>
    </table>

    <div class="lower">
      <div class="left">
        <h3>Invoice Amount In Words</h3>
        <div class="words">${esc(invoice.totalInWords ?? '')}</div>
        ${termsBlock(esc, invoice.terms ?? input.terms ?? '')}
        ${bankBlock(firm)}
        ${
          credited.length > 0
            ? `<h3>Credited Against This Invoice</h3>
               <div class="terms">${credited
                 .map(
                   (note) =>
                     `<div>${esc(note.code)} · ${date(note.issuedOn)} · ${money(
                       note.total,
                     )}</div>`,
                 )
                 .join('')}
                 <div><strong>Net of credits: ${money(
                   Number(invoice.total ?? 0) - creditedTotal,
                 )}</strong></div>
               </div>`
            : ''
        }
        ${signature(firm)}
      </div>
      <div class="right">
        <table class="sums">
          <tr><td>Sub Total</td><td class="r">${money(invoice.subtotal)}</td></tr>
          ${
            Number(invoice.discount) > 0
              ? `<tr><td>Discount</td><td class="r">− ${money(invoice.discount)}</td></tr>`
              : ''
          }
          <tr><td>Taxable Value</td><td class="r">${money(invoice.taxable)}</td></tr>
          ${taxRows}
          <tr class="grand"><td>Total</td><td class="r">${money(invoice.total)}</td></tr>
        </table>
        ${
          invoice.note
            ? `<div class="bank"><strong>Note:</strong><div>${esc(invoice.note)}</div></div>`
            : ''
        }
      </div>
    </div>`,
  });
}

export interface ChallanDocumentInput {
  challan: Record<string, any>;
  firm: Record<string, any>;
  letterheadUrl?: string | null;
  logoUrl?: string | null;
}

/**
 * A delivery challan.
 *
 * Not one figure of money on it, and that is the whole point of the document.
 * It travels with the goods and is read by whoever takes delivery — a site
 * supervisor, a watchman, the client's carpenter — and what the job cost is
 * between the shop and whoever ordered it. There is a receiver's signature
 * because that signature is the only proof the goods arrived.
 */
export function renderChallanHtml(input: ChallanDocumentInput): string {
  const { challan, firm } = input;
  const accent = safeColor(firm.accentColor) ?? '#E4232F';

  const items: Record<string, any>[] = challan.items ?? [];
  const rows = items
    .map(
      (item, index) => `
      <tr>
        <td class="c">${index + 1}</td>
        <td>${esc(item.description)}</td>
        <td class="r">${num(item.quantity, 2)}</td>
        <td class="c">${esc(item.unit ?? '')}</td>
      </tr>`,
    )
    .join('');

  const totalQty = items.reduce((sum, item) => sum + Number(item.quantity ?? 0), 0);

  return sheet({
    title: String(challan.code ?? 'Delivery Challan'),
    docType: 'Delivery Challan',
    accent,
    firm,
    letterheadUrl: input.letterheadUrl,
    cancelled: challan.status === 'CANCELLED' ? String(challan.cancelReason ?? '') : null,
    body: `
    <div class="parties">
      <div>
        <h2 style="color:${accent}">Ship To</h2>
        <div class="addr">${esc(challan.shipTo ?? '')}</div>
      </div>
      <table class="facts">
        <tr><td>Challan No.:</td><td>${esc(challan.code)}</td></tr>
        <tr><td>Date:</td><td>${date(challan.issuedOn)}</td></tr>
        ${challan.order?.code ? `<tr><td>Order:</td><td>${esc(challan.order.code)}</td></tr>` : ''}
        ${challan.transport ? `<tr><td>Transport:</td><td>${esc(challan.transport)}</td></tr>` : ''}
        ${challan.vehicle ? `<tr><td>Vehicle:</td><td>${esc(challan.vehicle)}</td></tr>` : ''}
      </table>
    </div>

    <table class="lines">
      <thead><tr>
        <th style="width:8%">#</th>
        <th style="width:64%">Description</th>
        <th style="width:16%">Qty</th>
        <th style="width:12%">Unit</th>
      </tr></thead>
      <tbody>
        ${rows}
        <tr class="total">
          <td></td><td>Total</td>
          <td class="r">${num(totalQty, 2)}</td>
          <td></td>
        </tr>
      </tbody>
    </table>

    <!-- No prices, deliberately: this paper goes with the goods. -->
    <div class="notice">Not a tax invoice. Delivery challan only — no charge is made on this document.</div>
    ${challan.note ? `<div class="words">${esc(challan.note)}</div>` : ''}

    <div class="lower">
      <div class="left">${signature(firm)}</div>
      <div class="right">
        <div class="sign">
          Received the goods described above in good condition
          <div class="line">Receiver's signature</div>
        </div>
      </div>
    </div>`,
  });
}

export interface CreditNoteDocumentInput {
  note: Record<string, any>;
  firm: Record<string, any>;
  letterheadUrl?: string | null;
  logoUrl?: string | null;
}

/**
 * A credit note.
 *
 * It says "Credit Note" in the largest type on the page and names the invoice
 * it credits on the face of it, because a document that reduces what somebody
 * owes and could be mistaken for a bill is the one piece of paper in this shop
 * that must never be ambiguous.
 *
 * It is not a receipt and says so. Nothing here has been paid to anybody; what
 * this reduces is the claim.
 */
export function renderCreditNoteHtml(input: CreditNoteDocumentInput): string {
  const { note, firm } = input;
  const accent = safeColor(firm.accentColor) ?? '#E4232F';
  const invoice = note.invoice ?? {};

  const taxRows = invoice.interState
    ? `<tr><td>IGST</td><td class="r">${money(note.igst)}</td></tr>`
    : `<tr><td>CGST</td><td class="r">${money(note.cgst)}</td></tr>
       <tr><td>SGST</td><td class="r">${money(note.sgst)}</td></tr>`;

  return sheet({
    title: String(note.code ?? 'Credit Note'),
    docType: 'Credit Note',
    accent,
    firm,
    letterheadUrl: input.letterheadUrl,
    cancelled: note.status === 'CANCELLED' ? String(note.cancelReason ?? '') : null,
    body: `
    ${parties({
      accent,
      heading: 'Credit To',
      client: {
        name: invoice.clientName,
        gstin: invoice.clientGstin,
        address: invoice.clientAddress,
        state: invoice.clientState,
      },
      facts: [
        ['Credit Note No.:', esc(note.code)],
        ['Date:', date(note.issuedOn)],
        ['Against Invoice:', esc(invoice.code ?? '')],
        ...(invoice.issuedOn
          ? [['Invoice Date:', date(invoice.issuedOn)] as [string, string]]
          : []),
      ],
    })}

    <div class="banner" style="border-color:${accent}">
      <div class="banner-title">Credit Note against invoice ${esc(invoice.code ?? '')}</div>
      <div>${esc(reasonLabel(String(note.reason ?? '')))} — ${esc(String(note.note ?? ''))}</div>
    </div>

    <div class="lower">
      <div class="left">
        <h3>Credit Amount In Words</h3>
        <div class="words">${esc(note.totalInWords ?? '')}</div>
        <!-- Said in as many words on the paper itself: a credit note reduces
             what is owed and is not money anybody handed over. -->
        <div class="terms">
          <div>This note reduces the amount payable against the invoice named above.</div>
          <div>It is not a receipt, and no payment has been made against it.</div>
        </div>
        ${signature(firm)}
      </div>
      <div class="right">
        <table class="sums">
          <tr><td>Taxable Value</td><td class="r">${money(note.taxable)}</td></tr>
          ${taxRows}
          <tr class="grand"><td>Total Credited</td><td class="r">${money(note.total)}</td></tr>
        </table>
      </div>
    </div>`,
  });
}

/** How a credit reason reads on paper, rather than as an enum. */
export function reasonLabel(reason: string): string {
  const labels: Record<string, string> = {
    RETURN: 'Goods returned',
    CORRECTION: 'Correction to the invoice',
    ALLOWANCE: 'Allowance agreed',
    CANCELLED_WORK: 'Work not carried out',
  };
  return labels[reason] ?? reason;
}

// -- the sheet the three of them are drawn on -------------------------------

export interface SheetInput {
  title: string;
  docType: string;
  accent: string;
  firm: Record<string, any>;
  letterheadUrl?: string | null;
  /** The reason, when the document is void. */
  cancelled?: string | null;
  body: string;
}

/**
 * The A4 page all three documents share.
 *
 * One skeleton rather than three, because the header, the firm block and the
 * cancellation stamp must be the same on every piece of paper the shop hands
 * over — a challan that looked like a different company's would defeat the
 * point of printing one.
 */
export function sheet(input: SheetInput): string {
  const { accent, firm } = input;
  const ink = '#1F2430';

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(input.title)}</title>
<style>
  @page { size: A4; margin: 0; }
  /* Pinned to light. This is paper: inside a dark-mode webview or a PDF
     converter that honours the system theme, an unpinned page comes out dark
     text on dark ground and prints as an unreadable sheet. */
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  html { background: #FFFFFF; }
  body {
    margin: 0;
    background: #FFFFFF;
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    color: ${ink};
    font-size: 11px;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .page { width: 210mm; min-height: 297mm; padding: 0 0 24mm; position: relative; background: #FFFFFF; margin: 0 auto; }
  ${
    input.letterheadUrl
      ? `.page {
           background-image: url('${input.letterheadUrl}');
           background-size: 210mm auto;
           background-repeat: no-repeat;
           background-position: top center;
         }
         .body { padding-top: 46mm; }`
      : '.body { padding-top: 6mm; }'
  }
  .strip { background: ${accent}; color: #fff; display: flex; gap: 18px; padding: 10px 16px; font-size: 10px; }
  .strip div { flex: 1; }
  .firm { background: ${ink}; color: #fff; padding: 14px 16px; display: flex; justify-content: space-between; align-items: flex-start; }
  .firm h1 { margin: 0 0 4px; font-size: 19px; font-weight: 500; }
  .firm .meta { font-size: 9.5px; opacity: 0.82; line-height: 1.5; }
  .doctype { font-size: 22px; font-weight: 400; text-align: right; }
  .body { padding-left: 12mm; padding-right: 12mm; }
  .parties { display: flex; justify-content: space-between; margin: 14px 0 10px; }
  .parties h2 { font-size: 11px; margin: 0 0 4px; font-weight: 600; }
  .parties .name { font-size: 14px; font-weight: 700; }
  .parties .addr { font-size: 10px; line-height: 1.5; max-width: 78mm; white-space: pre-line; }
  .facts td { padding: 1px 0; font-size: 10.5px; }
  .facts td:first-child { font-weight: 700; padding-right: 18px; }
  table.lines { width: 100%; border-collapse: collapse; margin-top: 6px; }
  table.lines th { background: ${accent}; color: #fff; font-size: 10px; padding: 7px 6px; text-align: right; font-weight: 600; }
  table.lines th:nth-child(1), table.lines th:nth-child(2), table.lines th:nth-child(3) { text-align: left; }
  table.lines td { padding: 8px 6px; border: 1px solid #D8DCE3; vertical-align: top; background: #FFFFFF; }
  /* A wrapped money figure reads as two numbers. Never wrap one. */
  table.lines td.r { text-align: right; white-space: nowrap; }
  table.lines td.c { text-align: center; }
  table.lines tr.total td { background: ${accent}; color: #fff; font-weight: 700; border-color: ${accent}; }
  .pct { color: #6B7280; font-size: 9px; display: block; }
  table.lines tr.total .pct { color: rgba(255,255,255,0.75); }
  .lower { display: flex; gap: 18px; margin-top: 14px; }
  .lower .left { flex: 1.35; }
  .lower .right { flex: 1; }
  h3 { color: ${accent}; font-size: 11.5px; margin: 0 0 5px; font-weight: 600; }
  .words { font-size: 10.5px; margin-bottom: 12px; }
  .terms div { font-size: 9.5px; line-height: 1.55; }
  .bank { margin-top: 12px; font-size: 9.5px; line-height: 1.55; }
  .notice { margin-top: 10px; font-size: 10px; font-weight: 700; letter-spacing: 0.2px; }
  .banner { margin-top: 12px; border: 2px solid ${accent}; padding: 10px 12px; font-size: 10.5px; }
  .banner-title { font-size: 13px; font-weight: 700; margin-bottom: 3px; }
  table.sums { width: 100%; border-collapse: collapse; }
  table.sums td { border: 1px solid #D8DCE3; padding: 6px 8px; font-size: 10.5px; background: #FFFFFF; }
  table.sums td.r { text-align: right; white-space: nowrap; }
  table.sums tr.grand td { background: ${accent}; color: #fff; font-weight: 700; border-color: ${accent}; }
  .sign { margin-top: 26px; font-size: 10.5px; }
  .sign .line { border-top: 1px solid ${ink}; width: 52mm; margin-top: 30px; padding-top: 5px; font-weight: 700; }
  /* A cancelled document keeps its number, so the paper has to say what the
     number no longer means — across the face of it, not in a footnote. */
  .void { position: absolute; top: 40%; left: 0; right: 0; text-align: center; font-size: 64px; font-weight: 800; color: rgba(196, 30, 40, 0.16); letter-spacing: 10px; transform: rotate(-18deg); pointer-events: none; }
  .void-why { margin: 10px 0 0; border: 2px solid #C41E28; color: #C41E28; padding: 8px 12px; font-size: 11px; font-weight: 700; }
</style></head>
<body><div class="page">
  ${
    input.letterheadUrl
      ? ''
      : `<div class="strip">
           <div>${esc(firm.phone ?? '')}</div>
           <div>${esc(firm.email ?? '')}</div>
           <div>${esc(firm.address ?? '')}</div>
         </div>
         <div class="firm">
           <div>
             <h1>${esc(firm.name ?? '')}</h1>
             <div class="meta">
               ${firm.gstin ? `GSTIN: ${esc(firm.gstin)}<br/>` : ''}
               ${
                 firm.stateCode
                   ? `State: ${esc(firm.stateCode)}${firm.stateName ? `-${esc(firm.stateName)}` : ''}`
                   : ''
               }
             </div>
           </div>
           <div class="doctype">${esc(input.docType)}</div>
         </div>`
  }
  ${input.cancelled !== null && input.cancelled !== undefined ? '<div class="void">CANCELLED</div>' : ''}
  <div class="body">
    ${
      // With a letterhead the firm block is printed on the paper already, so
      // only the kind of document is added — inside the body, not above it, or
      // the letterhead's own top padding would be applied twice.
      input.letterheadUrl
        ? `<div class="doctype" style="color:${ink}">${esc(input.docType)}</div>`
        : ''
    }
    ${
      input.cancelled !== null && input.cancelled !== undefined
        ? `<div class="void-why">Cancelled${
            input.cancelled ? ` — ${esc(input.cancelled)}` : ''
          }</div>`
        : ''
    }
    ${input.body}
  </div>
</div></body></html>`;
}

/** The two parties and the document's own facts, side by side. */
function parties(input: {
  accent: string;
  heading: string;
  client: Party;
  facts: [string, string][];
}): string {
  const { client } = input;

  return `<div class="parties">
      <div>
        <h2 style="color:${input.accent}">${esc(input.heading)}</h2>
        <div class="name">${esc(client.name ?? '—')}</div>
        ${client.address ? `<div class="addr">${esc(client.address)}</div>` : ''}
        ${client.gstin ? `<div class="addr">GSTIN: ${esc(client.gstin)}</div>` : ''}
        ${client.state ? `<div class="addr">State: ${esc(client.state)}</div>` : ''}
      </div>
      <table class="facts">
        ${input.facts
          .map(([label, value]) => `<tr><td>${esc(label)}</td><td>${value}</td></tr>`)
          .join('')}
      </table>
    </div>`;
}

function termsBlock(escape: (value: unknown) => string, terms: string): string {
  const lines = String(terms ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<div>${escape(line)}</div>`)
    .join('');
  return lines ? `<h3>Terms And Conditions</h3><div class="terms">${lines}</div>` : '';
}

function bankBlock(firm: Record<string, any>): string {
  const lines = [
    firm.bankAccountName ? `Name - ${esc(firm.bankAccountName)}` : '',
    firm.bankAccountNumber ? `Account no. - ${esc(firm.bankAccountNumber)}` : '',
    firm.bankName
      ? `Bank - ${esc(firm.bankName)}${firm.bankBranch ? `, ${esc(firm.bankBranch)}` : ''}`
      : '',
    firm.bankIfsc ? `IFSC- ${esc(firm.bankIfsc)}` : '',
  ]
    .filter(Boolean)
    .map((line) => `<div>${line}</div>`)
    .join('');
  return lines ? `<div class="bank"><strong>Bank Details:</strong>${lines}</div>` : '';
}

function signature(firm: Record<string, any>): string {
  return `<div class="sign">
      For: ${esc(firm.name ?? '')}
      <div class="line">${esc(firm.signatoryName ?? 'Authorised Signatory')}</div>
    </div>`;
}

/** Everything interpolated here can come from a tenant's own typing. */
export function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** A tenant-supplied colour goes straight into a stylesheet, so it is checked. */
export function safeColor(value: unknown): string | null {
  const text = String(value ?? '').trim();
  return /^#[0-9a-f]{3,8}$/i.test(text) ? text : null;
}

export function money(value: unknown): string {
  const amount = Number(value ?? 0);
  return `₹ ${amount.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function num(value: unknown, decimals: number): string {
  return Number(value ?? 0).toFixed(decimals);
}

export function date(value: unknown): string {
  const at = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(at.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  // Read off UTC: an issue date is a date, not a moment, and rendering it in
  // the server's local zone would date a document to the day before.
  return `${pad(at.getUTCDate())}-${pad(at.getUTCMonth() + 1)}-${at.getUTCFullYear()}`;
}
