import { previewTotals, usableLines, type PricedLine } from './PricedLines';

const line = (over: Partial<PricedLine> = {}): PricedLine => ({
  key: 'k',
  name: 'Hdmr 22mm',
  quantity: 10,
  unit: 'Sqf',
  ratePerUnit: 1000,
  ...over,
});

const SLABS = [
  { id: 'gst18', name: 'GST 18%', ratePct: '18', isDefault: true, isActive: true },
  { id: 'gst5', name: 'GST 5%', ratePct: '5', isDefault: false, isActive: true },
] as never;

describe('which lines count', () => {
  it('drops the ones nobody named', () => {
    expect(usableLines([line({ name: '  ' })])).toEqual([]);
  });

  it('keeps a named line with no quantity, because an enquiry is full of them', () => {
    // "MDF jali, laser cut", rate to follow. Dropping it would lose what the
    // client actually said.
    expect(usableLines([line({ quantity: 0 })])).toHaveLength(1);
  });

  it('drops it for a quotation, which is a figure somebody must pay', () => {
    expect(usableLines([line({ quantity: 0 })], { needsQuantity: true })).toEqual([]);
  });
});

describe('the preview, which mirrors what the server will do', () => {
  it('adds GST on top when the figure was quoted before tax', () => {
    const totals = previewTotals([line()], SLABS, 'gst18', 'EXCLUSIVE');
    expect(totals.net).toBe(10000);
    expect(totals.tax).toBe(1800);
    expect(totals.gross).toBe(11800);
  });

  it('takes GST out of the figure when it was quoted including tax', () => {
    const totals = previewTotals([line()], SLABS, 'gst18', 'INCLUSIVE');
    // What they pay does not move; the taxable value behind it does.
    expect(totals.gross).toBe(10000);
    expect(Math.round(totals.net * 100) / 100).toBe(8474.58);
  });

  it('takes the line discount off before the tax, not after', () => {
    const totals = previewTotals([line({ discountPct: 10 })], SLABS, 'gst18', 'EXCLUSIVE');
    expect(totals.discount).toBe(1000);
    expect(totals.net).toBe(9000);
    expect(totals.tax).toBe(1620);
  });

  it('prices a line at the slab it was given rather than the default', () => {
    const totals = previewTotals([line({ gstSlabId: 'gst5' })], SLABS, 'gst18', 'EXCLUSIVE');
    expect(totals.tax).toBe(500);
  });

  it('comes to nothing, rather than to NaN, before anything is typed', () => {
    const totals = previewTotals(
      [line({ name: '', quantity: Number('abc') || 0, ratePerUnit: 0 })],
      SLABS,
      'gst18',
      'EXCLUSIVE',
    );
    expect(totals.gross).toBe(0);
    expect(Number.isNaN(totals.gross)).toBe(false);
  });

  it('charges nothing when the shop has no slabs configured at all', () => {
    const totals = previewTotals([line()], undefined, undefined, 'EXCLUSIVE');
    expect(totals.tax).toBe(0);
    expect(totals.gross).toBe(10000);
  });
});
