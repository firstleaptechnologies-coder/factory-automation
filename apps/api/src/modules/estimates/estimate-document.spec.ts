import { renderEstimateHtml } from './estimate-document';

const FIRM = {
  name: 'Decor Bucket',
  gstin: '08AAWFD7264P1ZC',
  stateCode: '08',
  stateName: 'Rajasthan',
  phone: '8764029735',
  email: 'decorbucket.interiors@gmail.com',
  address: 'H-1053, Sitapura industrial area, Jaipur',
  bankAccountName: 'Decor bucket',
  bankAccountNumber: '50200099660350',
  bankName: 'HDFC',
  bankIfsc: 'HDFC0007372',
  signatoryName: 'Authorized Signatory',
  accentColor: '#E4232F',
};

const ESTIMATE = {
  code: 'EST-2627-0001',
  clientName: 'Nakul mathura',
  issuedOn: new Date('2026-09-07T00:00:00Z'),
  subtotal: 5542.4,
  discount: 254.24,
  total: 5288.16,
  cgst: 475.93,
  sgst: 475.94,
  igst: 0,
  taxAmount: 951.87,
  grandTotal: 6240.03,
  savedAmount: 300,
  items: [
    {
      name: 'Hdmr cutting 22mm',
      hsnSac: '',
      quantity: 20,
      unit: 'Sqf',
      ratePerUnit: 127.12,
      discountAmount: 254.24,
      discountPct: 10,
      taxAmount: 411.87,
      gstRatePct: 18,
      amount: 2700.03,
    },
  ],
};

const render = (over: Record<string, unknown> = {}) =>
  renderEstimateHtml({
    estimate: ESTIMATE,
    firm: FIRM,
    amountInWords: 'Six Thousand Two Hundred and Forty Rupees only',
    terms: '1.Freight - As per actuals\n2. Payment Terms :',
    interState: false,
    ...over,
  } as never);

describe('renderEstimateHtml', () => {
  it('prints the figures the estimate carries', () => {
    const html = render();
    expect(html).toContain('EST-2627-0001');
    expect(html).toContain('Nakul mathura');
    expect(html).toContain('Hdmr cutting 22mm');
    expect(html).toContain('Six Thousand Two Hundred and Forty Rupees only');
    expect(html).toContain('Decor Bucket');
    expect(html).toContain('HDFC0007372');
  });

  it('shows CGST and SGST within one state, and IGST across states', () => {
    // Printing the wrong pair invalidates the document.
    const intra = render();
    expect(intra).toContain('SGST');
    expect(intra).toContain('CGST');
    expect(intra).not.toContain('>IGST<');

    const inter = render({ interState: true });
    expect(inter).toContain('IGST');
    expect(inter).not.toContain('>SGST<');
  });

  it('pins itself to a light page', () => {
    // Rendered inside a dark-mode webview or a PDF converter that honours the
    // system theme, an unpinned page prints as an unreadable sheet.
    const html = render();
    expect(html).toContain('color-scheme: light');
    expect(html).toContain('background: #FFFFFF');
  });

  it('never lets a money figure wrap into two numbers', () => {
    expect(render()).toMatch(/table\.lines td\.r \{[^}]*white-space: nowrap/);
  });

  it('escapes tenant text rather than letting it become markup', () => {
    // Every one of these fields is typed by a tenant.
    const html = render({
      estimate: { ...ESTIMATE, clientName: '<script>alert(1)</script>' },
      firm: { ...FIRM, name: 'Ampersand & Co "quoted"' },
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('Ampersand &amp; Co &quot;quoted&quot;');
  });

  it('refuses a colour that is not a colour', () => {
    // The accent goes straight into a stylesheet, so anything else would let a
    // tenant write arbitrary CSS into their own printed documents.
    const html = render({ firm: { ...FIRM, accentColor: 'red; } body { display:none } .x{' } });
    expect(html).not.toContain('display:none');
    expect(html).toContain('#E4232F'); // falls back to the default accent
  });

  it('omits the built-in header when a letterhead is supplied', () => {
    const withLetterhead = render({ letterheadUrl: 'data:image/png;base64,AAA' });
    expect(withLetterhead).toContain('background-image');
    // The firm block is drawn on the letterhead already; drawing ours over it
    // would double the address.
    expect(withLetterhead).not.toContain('class="strip"');
  });

  it('formats dates the way the shop reads them', () => {
    expect(render()).toContain('07-09-2026');
  });
});
