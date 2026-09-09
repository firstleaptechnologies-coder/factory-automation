import { renderStatementHtml } from './statement-document';

const FIRM = {
  name: 'Decor Bucket',
  gstin: '08AAWFD7264P1ZC',
  accentColor: '#E4232F',
};

const statement = (over: Partial<Parameters<typeof renderStatementHtml>[0]> = {}) =>
  renderStatementHtml({
    client: { name: 'Bhatia Residence', gstin: '08ABCDE1234F1Z5' },
    firm: FIRM,
    period: { from: '2026-04-01', to: '2027-03-31' },
    lines: [
      { date: '2026-09-08', kind: 'Invoice', reference: 'INV-1', charged: 118000, received: 0, balance: 118000 },
      { date: '2026-09-08', kind: 'Credit note', reference: 'CN-1', charged: -11800, received: 0, balance: 106200 },
      { date: '2026-09-08', kind: 'Payment', reference: 'ORD-6', charged: 0, received: 106200, balance: 0 },
    ],
    ...over,
  });

describe('the printed statement', () => {
  it('carries the shop’s own name and the client’s', () => {
    const html = statement();

    expect(html).toContain('Decor Bucket');
    expect(html).toContain('Bhatia Residence');
    expect(html).toContain('Statement of account');
  });

  it('shows every entry and the balance after it', () => {
    const html = statement();

    expect(html).toContain('INV-1');
    expect(html).toContain('CN-1');
    expect(html).toContain('ORD-6');
  });

  it('closes at settled when nothing is owed', () => {
    expect(statement()).toContain('Settled in full');
  });

  it('says a balance is due when it is', () => {
    const html = statement({
      lines: [
        { date: '2026-09-08', kind: 'Invoice', reference: 'INV-1', charged: 50000, received: 0, balance: 50000 },
      ],
    });

    expect(html).toContain('Balance due');
    expect(html).not.toContain('Settled in full');
  });

  // A client who has overpaid is in credit, not in debt, and the paper must
  // not read as a demand.
  it('says a client is in credit rather than showing a negative demand', () => {
    const html = statement({
      lines: [
        { date: '2026-09-08', kind: 'Payment', reference: 'ORD-6', charged: 0, received: 5000, balance: -5000 },
      ],
    });

    expect(html).toContain('In credit');
    expect(html).not.toContain('Balance due');
  });

  // The rule the whole product is built around, on the one document most
  // likely to end up in a client's hands.
  it('never mentions a payout, and says so', () => {
    const html = statement().toLowerCase();

    expect(html).not.toContain('payout');
    expect(html).not.toContain('disbursement');
    expect(html).toContain('paid to others on');
    expect(html).toContain('never deducted');
  });

  // The client may be holding a copy of it.
  it('lists a cancelled invoice, charging nothing', () => {
    const html = statement({
      lines: [
        {
          date: '2026-09-08',
          kind: 'Invoice (cancelled)',
          reference: 'INV-2',
          charged: 0,
          received: 0,
          balance: 0,
        },
      ],
    });

    expect(html).toContain('INV-2');
    expect(html).toContain('Invoice (cancelled)');
  });

  it('says so plainly when there is nothing in the period', () => {
    expect(statement({ lines: [] })).toContain('Nothing charged or received');
  });

  // Anything the shop or the client typed reaches the page escaped.
  it('escapes what somebody typed', () => {
    const html = statement({
      client: { name: '<script>alert(1)</script>' },
    });

    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  // Paper is light. Inside a dark-mode webview an unpinned sheet prints as
  // dark text on a dark ground.
  it('pins the sheet to light', () => {
    expect(statement()).toContain('color-scheme: light');
  });
});
