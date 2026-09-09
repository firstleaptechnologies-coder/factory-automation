import {
  REPORTS,
  REPORT_KINDS,
  REPORT_LABELS,
  reportDefinition,
  reportFileName,
  reportRequestError,
} from './reports';

describe('the report catalogue', () => {
  it('has no duplicate kinds', () => {
    expect(new Set(REPORT_KINDS).size).toBe(REPORT_KINDS.length);
  });

  it('gives every report a label, a description and at least one format', () => {
    for (const report of REPORTS) {
      expect(report.label).toBeTruthy();
      expect(report.description).toBeTruthy();
      expect(report.formats.length).toBeGreaterThan(0);
    }
  });

  it('labels every kind', () => {
    for (const kind of REPORT_KINDS) expect(REPORT_LABELS[kind]).toBeTruthy();
  });

  // The payout ledger is a report in its own right. If it ever stopped being
  // one — folded in as a column of something else, or an option on another
  // report — that would be the netting-off the books must not do.
  it('keeps payouts as a report of their own', () => {
    const payouts = reportDefinition('PAYOUT_LEDGER');

    expect(payouts).toBeDefined();
    expect(payouts?.description).toMatch(/never netted/i);
  });

  // No report may offer to leave payouts out, under any spelling.
  it('offers no way to hide payouts', () => {
    const optionish = JSON.stringify(REPORTS).toLowerCase();

    expect(optionish).not.toMatch(/includepayout|hidepayout|excludepayout|withoutpayout/);
  });
});

describe('refusing a request before it is queued', () => {
  it('refuses a report nobody has heard of', () => {
    expect(reportRequestError({ kind: 'PROFIT_AFTER_TAX' })).toMatch(/no report called/);
  });

  it('refuses a format the report does not produce', () => {
    expect(reportRequestError({ kind: 'GST_SUMMARY', format: 'PDF', from: '2026-04-01', to: '2026-06-30' }))
      .toMatch(/cannot be produced as PDF/);
  });

  // Caught here rather than an hour later inside a worker nobody is watching.
  it('refuses a report that needs a period without one', () => {
    expect(reportRequestError({ kind: 'CASH_BOOK' })).toMatch(/needs a period/);
    expect(reportRequestError({ kind: 'CASH_BOOK', from: '2026-04-01' })).toMatch(/needs a period/);
  });

  it('refuses a period that ends before it starts', () => {
    expect(reportRequestError({ kind: 'CASH_BOOK', from: '2026-06-30', to: '2026-04-01' }))
      .toMatch(/ends before it starts/);
  });

  it('refuses a client statement with no client', () => {
    expect(reportRequestError({ kind: 'CLIENT_STATEMENT' })).toMatch(/needs one/);
  });

  it('allows a report whose period is optional to have none', () => {
    expect(reportRequestError({ kind: 'RECEIVABLES' })).toBeNull();
  });

  it('allows a well-formed request', () => {
    expect(
      reportRequestError({ kind: 'GST_SUMMARY', format: 'XLSX', from: '2026-04-01', to: '2026-06-30' }),
    ).toBeNull();
  });

  it('falls back to the report’s first format when none is named', () => {
    expect(reportRequestError({ kind: 'GST_SUMMARY', from: '2026-04-01', to: '2026-06-30' })).toBeNull();
  });
});

describe('naming the file', () => {
  it('carries the report and its period', () => {
    expect(reportFileName('GST_SUMMARY', 'XLSX', { from: '2026-04-01', to: '2026-06-30' }))
      .toBe('gst-summary-2026-04-01-to-2026-06-30.xlsx');
  });

  it('drops the period when there is none', () => {
    expect(reportFileName('RECEIVABLES', 'XLSX', {})).toBe('receivables.xlsx');
  });
});
