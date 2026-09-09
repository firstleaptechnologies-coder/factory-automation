import { REPORT_KINDS } from '@decor/shared';
import { BUILDERS, NOT_YET_BUILT, builderFor } from './report-builders';

/**
 * The rail. Every report in the catalogue is either built or listed as not
 * built — never simply absent, because absent is what produces a queued job
 * that quietly makes an empty file.
 */
describe('every catalogued report is accounted for', () => {
  it.each(REPORT_KINDS)('%s is either built or listed as pending', (kind) => {
    const built = kind in BUILDERS;
    const pending = kind in NOT_YET_BUILT;

    expect(built || pending).toBe(true);
  });

  it('never claims a report is both built and pending', () => {
    const both = REPORT_KINDS.filter((kind) => kind in BUILDERS && kind in NOT_YET_BUILT);

    expect(both).toEqual([]);
  });

  it('builds nothing that is not in the catalogue', () => {
    const unknown = Object.keys(BUILDERS).filter(
      (kind) => !REPORT_KINDS.includes(kind as never),
    );

    expect(unknown).toEqual([]);
  });

  it('gives a reason for each report still to be written', () => {
    for (const reason of Object.values(NOT_YET_BUILT)) {
      expect(String(reason).length).toBeGreaterThan(4);
    }
  });

  // The money reports are the ones the phase exists for; they are built.
  it.each(['CASH_BOOK', 'RECEIVABLES', 'PAYOUT_LEDGER', 'GST_SUMMARY'])(
    '%s has a builder',
    (kind) => {
      expect(builderFor(kind)).toBeInstanceOf(Function);
    },
  );

  it('has no builder for a report nobody declared', () => {
    expect(builderFor('PROFIT_AFTER_TAX')).toBeUndefined();
  });
});
