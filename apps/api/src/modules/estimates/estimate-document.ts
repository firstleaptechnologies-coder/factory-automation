/**
 * The printable estimate.
 *
 * Rendered as HTML on the server rather than drawn on the device, for one
 * reason: the figures and the layout must be identical whether the document is
 * printed from the web, turned into a PDF on a phone, or emailed. A second
 * implementation is a second set of totals waiting to disagree with the first.
 *
 * The layout follows the shop's existing estimate — a coloured contact strip,
 * the firm block, a priced table with HSN, discount and GST columns, the amount
 * in words, terms, bank details and a signatory line — because the people
 * receiving these already know how to read that page.
 */

export interface DocumentInput {
  estimate: Record<string, any>;
  firm: Record<string, any>;
  amountInWords: string;
  terms: string;
  interState: boolean;
  /** Absolute URL of the uploaded letterhead, when the firm has one. */
  letterheadUrl?: string | null;
  logoUrl?: string | null;
}

export function renderEstimateHtml(input: DocumentInput): string {
  const { estimate, firm, terms } = input;
  const accent = safeColor(firm.accentColor) ?? '#E4232F';
  const ink = '#1F2430';

  const client = estimate.client ?? {};
  const clientName = estimate.clientName ?? client.name ?? '—';

  const rows = (estimate.items ?? [])
    .map(
      (item: Record<string, any>, index: number) => `
      <tr>
        <td class="c">${index + 1}</td>
        <td><strong>${esc(item.name)}</strong>${
          item.description ? `<div class="sub">${esc(item.description)}</div>` : ''
        }</td>
        <td>${esc(item.hsnSac ?? '')}</td>
        <td class="r">${num(item.quantity, 0)}</td>
        <td class="c">${esc(item.unit ?? '')}</td>
        <td class="r">${money(item.ratePerUnit)}</td>
        <td class="r">${money(item.discountAmount)} <span class="pct">(${num(
          item.discountPct,
          1,
        )}%)</span></td>
        <td class="r">${money(item.taxAmount)} <span class="pct">(${num(
          item.gstRatePct,
          1,
        )}%)</span></td>
        <td class="r"><strong>${money(item.amount)}</strong></td>
      </tr>`,
    )
    .join('');

  const totalQty = (estimate.items ?? []).reduce(
    (sum: number, item: Record<string, any>) => sum + Number(item.quantity ?? 0),
    0,
  );

  // Intra-state shows CGST and SGST as separate lines at half the rate each;
  // inter-state shows one IGST line. Printing the wrong pair invalidates the
  // document, so it follows the numbers rather than a setting.
  const taxRows = input.interState
    ? `<tr><td>IGST</td><td class="r">${money(estimate.igst)}</td></tr>`
    : `<tr><td>SGST</td><td class="r">${money(estimate.sgst)}</td></tr>
       <tr><td>CGST</td><td class="r">${money(estimate.cgst)}</td></tr>`;

  const termLines = terms
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<div>${esc(line)}</div>`)
    .join('');

  const bank = [
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

  return `<!doctype html>
<html><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(estimate.code)}</title>
<style>
  @page { size: A4; margin: 0; }
  /* Pinned to light. This is paper: rendered inside a dark-mode webview or a
     PDF converter that honours the system theme, an unpinned page comes out
     dark text on dark ground and prints as an unreadable sheet. */
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
  .strip {
    background: ${accent};
    color: #fff;
    display: flex;
    gap: 18px;
    padding: 10px 16px;
    font-size: 10px;
  }
  .strip div { flex: 1; }
  .firm {
    background: ${ink};
    color: #fff;
    padding: 14px 16px;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
  }
  .firm h1 { margin: 0 0 4px; font-size: 19px; font-weight: 500; }
  .firm .meta { font-size: 9.5px; opacity: 0.82; line-height: 1.5; }
  .doctype { font-size: 22px; font-weight: 400; }
  .body { padding-left: 12mm; padding-right: 12mm; }
  .parties { display: flex; justify-content: space-between; margin: 14px 0 10px; }
  .parties h2 { color: ${accent}; font-size: 11px; margin: 0 0 4px; font-weight: 600; }
  .parties .name { font-size: 14px; font-weight: 700; }
  .parties .addr { font-size: 10px; line-height: 1.5; max-width: 78mm; white-space: pre-line; }
  .facts td { padding: 1px 0; font-size: 10.5px; }
  .facts td:first-child { font-weight: 700; padding-right: 18px; }
  table.lines { width: 100%; border-collapse: collapse; margin-top: 6px; }
  table.lines th {
    background: ${accent};
    color: #fff;
    font-size: 10px;
    padding: 7px 6px;
    text-align: right;
    font-weight: 600;
  }
  table.lines th:nth-child(1), table.lines th:nth-child(2), table.lines th:nth-child(3) {
    text-align: left;
  }
  table.lines td { padding: 8px 6px; border: 1px solid #D8DCE3; vertical-align: top; background: #FFFFFF; }
  /* A wrapped money figure reads as two numbers. Never wrap one. */
  table.lines td.r { text-align: right; white-space: nowrap; }
  table.lines td.c { text-align: center; }
  table.lines tr.total td {
    background: ${accent};
    color: #fff;
    font-weight: 700;
    border-color: ${accent};
  }
  .sub { font-size: 9px; color: #6B7280; font-weight: 400; margin-top: 2px; }
  .pct { color: #6B7280; font-size: 9px; display: block; }
  table.lines tr.total .pct { color: rgba(255,255,255,0.75); }
  .lower { display: flex; gap: 18px; margin-top: 14px; }
  .lower .left { flex: 1.35; }
  .lower .right { flex: 1; }
  h3 { color: ${accent}; font-size: 11.5px; margin: 0 0 5px; font-weight: 600; }
  .words { font-size: 10.5px; margin-bottom: 12px; }
  .terms div { font-size: 9.5px; line-height: 1.55; }
  .bank { margin-top: 12px; font-size: 9.5px; line-height: 1.55; }
  table.sums { width: 100%; border-collapse: collapse; }
  table.sums td { border: 1px solid #D8DCE3; padding: 6px 8px; font-size: 10.5px; background: #FFFFFF; }
  table.sums td.r { text-align: right; white-space: nowrap; }
  table.sums tr.grand td { background: ${accent}; color: #fff; font-weight: 700; border-color: ${accent}; }
  .sign { margin-top: 26px; font-size: 10.5px; }
  .sign .line { border-top: 1px solid ${ink}; width: 52mm; margin-top: 30px; padding-top: 5px; font-weight: 700; }
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
                   ? `State: ${esc(firm.stateCode)}${
                       firm.stateName ? `-${esc(firm.stateName)}` : ''
                     }`
                   : ''
               }
             </div>
           </div>
           <div class="doctype">Estimate</div>
         </div>`
  }

  <div class="body">
    <div class="parties">
      <div>
        <h2>Estimate For</h2>
        <div class="name">${esc(clientName)}</div>
        ${
          estimate.billingAddress
            ? `<div class="addr">${esc(estimate.billingAddress)}</div>`
            : ''
        }
        ${estimate.clientGstin ? `<div class="addr">GSTIN: ${esc(estimate.clientGstin)}</div>` : ''}
        ${
          estimate.shippingAddress && estimate.shippingAddress !== estimate.billingAddress
            ? `<h2 style="margin-top:8px">Ship To</h2><div class="addr">${esc(
                estimate.shippingAddress,
              )}</div>`
            : ''
        }
      </div>
      <table class="facts">
        <tr><td>Estimate No.:</td><td>${esc(estimate.code)}</td></tr>
        <tr><td>Date:</td><td>${date(estimate.issuedOn)}</td></tr>
        ${estimate.validTill ? `<tr><td>Valid till:</td><td>${date(estimate.validTill)}</td></tr>` : ''}
      </table>
    </div>

    <table class="lines">
      <thead><tr>
        <th style="width:5%">#</th>
        <th style="width:24%">Item Name</th>
        <th style="width:10%">HSN/ SAC</th>
        <th style="width:9%">Quantity</th>
        <th style="width:7%">Unit</th>
        <th style="width:11%">Price/ Unit</th>
        <th style="width:12%">Discount</th>
        <th style="width:12%">GST</th>
        <th style="width:15%">Amount</th>
      </tr></thead>
      <tbody>
        ${rows}
        <tr class="total">
          <td></td><td>Total</td><td></td>
          <td class="r">${num(totalQty, 0)}</td>
          <td></td><td></td>
          <td class="r">${money(estimate.discount)}</td>
          <td class="r">${money(estimate.taxAmount)}</td>
          <td class="r">${money(estimate.grandTotal)}</td>
        </tr>
      </tbody>
    </table>

    <div class="lower">
      <div class="left">
        <h3>Estimate Amount In Words</h3>
        <div class="words">${esc(input.amountInWords)}</div>
        ${termLines ? `<h3>Terms And Conditions</h3><div class="terms">${termLines}</div>` : ''}
        ${bank ? `<div class="bank"><strong>Bank Details:</strong>${bank}</div>` : ''}
        <div class="sign">
          For: ${esc(firm.name ?? '')}
          <div class="line">${esc(firm.signatoryName ?? 'Authorized Signatory')}</div>
        </div>
      </div>
      <div class="right">
        <table class="sums">
          <tr><td>Sub Total</td><td class="r">${money(estimate.subtotal)}</td></tr>
          ${
            Number(estimate.discount) > 0
              ? `<tr><td>Discount</td><td class="r">${money(estimate.discount)}</td></tr>`
              : ''
          }
          ${taxRows}
          <tr class="grand"><td>Total</td><td class="r">${money(estimate.grandTotal)}</td></tr>
          ${
            Number(estimate.savedAmount) > 0
              ? `<tr><td>You Saved</td><td class="r">${money(estimate.savedAmount)}</td></tr>`
              : ''
          }
        </table>
      </div>
    </div>
  </div>
</div></body></html>`;
}

/** Everything interpolated here can come from a tenant's own typing. */
function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** A tenant-supplied colour goes straight into a stylesheet, so it is checked. */
function safeColor(value: unknown): string | null {
  const text = String(value ?? '').trim();
  return /^#[0-9a-f]{3,8}$/i.test(text) ? text : null;
}

function money(value: unknown): string {
  const amount = Number(value ?? 0);
  return `₹ ${amount.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function num(value: unknown, decimals: number): string {
  return Number(value ?? 0).toFixed(decimals);
}

function date(value: unknown): string {
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`;
}
