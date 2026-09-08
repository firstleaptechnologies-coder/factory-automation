/**
 * The printable letter.
 *
 * Rendered as HTML on the server, like the estimate, and for the same reason:
 * the app turns it into a PDF on the device — which is what makes sharing it a
 * single step — while the web prints the very same markup. A second
 * implementation is a second letter waiting to disagree with the first.
 *
 * The body is the shop's own words, so it is printed as written: paragraphs
 * split on blank lines, nothing else interpreted. A letter that quietly styled
 * what somebody typed would be a letter they could not predict.
 */

export interface LetterDocumentInput {
  letter: { title: string; body: string; issuedOn: Date | string; kind: string };
  employee: { name: string; code: string; designation?: string | null };
  firm: Record<string, unknown>;
  letterheadUrl?: string | null;
  logoUrl?: string | null;
}

export function renderLetterHtml(input: LetterDocumentInput): string {
  const { letter, employee, firm } = input;
  const accent = safeColor(firm.accentColor as string) ?? '#E4232F';

  const paragraphs = letter.body
    .split(/\n{2,}/)
    .map((block) => `<p>${esc(block.trim()).replace(/\n/g, '<br />')}</p>`)
    .join('\n');

  const letterhead = input.letterheadUrl
    ? `<img class="letterhead" src="${input.letterheadUrl}" alt="" />`
    : `<header class="head">
         ${input.logoUrl ? `<img class="logo" src="${input.logoUrl}" alt="" />` : ''}
         <div>
           <div class="firm">${esc(String(firm.name ?? ''))}</div>
           ${firm.address ? `<div class="sub">${esc(String(firm.address))}</div>` : ''}
         </div>
       </header>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(letter.title)}</title>
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font: 13px/1.65 'Helvetica Neue', Arial, sans-serif;
    color: #1F2430;
    background: #fff;
  }
  .sheet { width: 210mm; min-height: 297mm; padding: 18mm 20mm; margin: 0 auto; }
  .letterhead { width: 100%; display: block; margin-bottom: 10mm; }
  .head { display: flex; gap: 12px; align-items: center; border-bottom: 2px solid ${accent}; padding-bottom: 8px; margin-bottom: 10mm; }
  .logo { height: 46px; }
  .firm { font-size: 17px; font-weight: 700; letter-spacing: 0.2px; }
  .sub { color: #6B7280; font-size: 11px; }
  .meta { display: flex; justify-content: space-between; font-size: 11px; color: #6B7280; margin-bottom: 8mm; }
  h1 { font-size: 15px; margin: 0 0 6mm; letter-spacing: 0.3px; text-transform: uppercase; }
  p { margin: 0 0 4mm; white-space: pre-wrap; }
  .sign { margin-top: 16mm; }
  .sign .line { border-top: 1px solid #1F2430; width: 55mm; margin-bottom: 4px; }
  @media print { .sheet { padding: 12mm 16mm; } }
</style>
</head>
<body>
  <div class="sheet">
    ${letterhead}
    <div class="meta">
      <span>${esc(employee.code)}</span>
      <span>${esc(formatDate(letter.issuedOn))}</span>
    </div>
    <h1>${esc(letter.title)}</h1>
    ${paragraphs}
    <div class="sign">
      <div class="line"></div>
      <div>For ${esc(String(firm.name ?? ''))}</div>
      <div class="sub">Authorised signatory</div>
    </div>
  </div>
</body>
</html>`;
}

/** 9 September 2026 — how a letter dates itself. */
export function formatDate(value: Date | string): string {
  const at = typeof value === 'string' ? new Date(value) : value;
  return at.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Escapes what the shop typed.
 *
 * The body is somebody's own words and goes into a document that may be
 * printed, mailed, or opened in a browser. A stray angle bracket in an
 * address must not become markup.
 */
export function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Only a hex colour is let into the stylesheet. */
export function safeColor(value?: string | null): string | null {
  return value && /^#[0-9a-fA-F]{3,8}$/.test(value) ? value : null;
}
