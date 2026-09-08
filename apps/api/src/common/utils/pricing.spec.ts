import { RateUnit } from '@prisma/client';
import {
  amountInWords,
  billableQuantity,
  lineAmount,
  round2,
  splitGstComponents,
  splitTax,
} from './pricing';

const FT = 304.8;

describe('lineAmount', () => {
  it('prices per square foot from millimetres', () => {
    // 8ft × 4ft = 32 sq ft at ₹100 = ₹3,200.
    expect(
      lineAmount({
        rate: 100,
        rateUnit: RateUnit.PER_SQFT,
        lengthMm: 8 * FT,
        widthMm: 4 * FT,
        quantity: 1,
      }),
    ).toBe(3200);
  });

  it('multiplies a per-unit rate by the quantity', () => {
    expect(
      lineAmount({
        rate: 250,
        rateUnit: RateUnit.PER_PIECE,
        lengthMm: 0,
        widthMm: 0,
        quantity: 4,
      }),
    ).toBe(1000);
  });

  it('treats a lump sum as the whole amount, not a multiplier', () => {
    // The trap: multiplying by quantity would double-charge a line somebody
    // deliberately priced as a whole.
    expect(
      lineAmount({
        rate: 40000,
        rateUnit: RateUnit.LUMP_SUM,
        lengthMm: 8 * FT,
        widthMm: 4 * FT,
        quantity: 7,
      }),
    ).toBe(40000);
  });

  it('prices per running foot on length alone', () => {
    expect(
      lineAmount({
        rate: 50,
        rateUnit: RateUnit.PER_RFT,
        lengthMm: 10 * FT,
        widthMm: 4 * FT,
        quantity: 2,
      }),
    ).toBe(1000);
  });

  it('is zero when nothing has been quoted yet', () => {
    expect(
      lineAmount({
        rate: null,
        rateUnit: RateUnit.PER_SQFT,
        lengthMm: 8 * FT,
        widthMm: 4 * FT,
        quantity: 1,
      }),
    ).toBe(0);
  });

  it('refuses to bill a negative quantity', () => {
    expect(
      lineAmount({
        rate: 100,
        rateUnit: RateUnit.PER_PIECE,
        lengthMm: 0,
        widthMm: 0,
        quantity: -3,
      }),
    ).toBe(0);
  });
});

describe('billableQuantity', () => {
  it('reports the area a per-square-foot line is charged on', () => {
    const { value, label } = billableQuantity({
      rate: 100,
      rateUnit: RateUnit.PER_SQFT,
      lengthMm: 8 * FT,
      widthMm: 4 * FT,
      quantity: 2,
    });
    expect(value).toBeCloseTo(64, 5);
    expect(label).toMatch(/sq ft/);
  });
});

describe('splitTax', () => {
  it('adds GST on top when the quote is before tax', () => {
    expect(splitTax(40000, 18, 'EXCLUSIVE')).toEqual({
      net: 40000,
      tax: 7200,
      gross: 47200,
      concession: 0,
    });
  });

  it('takes GST out of a figure that already contains it', () => {
    // The whole point: ₹40,000 collected at 18% holds ₹6,101.69 of tax, not
    // ₹7,200 — ₹7,200 would only be right if ₹40,000 were the taxable base.
    const split = splitTax(40000, 18, 'INCLUSIVE');
    expect(split.gross).toBe(40000);
    expect(split.net).toBeCloseTo(33898.31, 2);
    expect(split.tax).toBeCloseTo(6101.69, 2);
    expect(split.concession).toBe(0);
  });

  it('records what was given up when the shop absorbs the GST', () => {
    const split = splitTax(40000, 18, 'ABSORBED');
    // The client still pays exactly what they were quoted.
    expect(split.gross).toBe(40000);
    // And the tax genuinely owed comes out of that, as with INCLUSIVE.
    expect(split.tax).toBeCloseTo(6101.69, 2);
    // The concession is what they would have paid on top.
    expect(split.concession).toBe(7200);
  });

  it('always has net plus tax equal to gross exactly', () => {
    // Computing the tax independently can leave a paisa unaccounted for, which
    // is how an invoice ends up failing to add up.
    for (const quoted of [1, 99.99, 12345.67, 40000, 987654.32]) {
      for (const rate of [0, 5, 12, 18, 28]) {
        for (const treatment of ['EXCLUSIVE', 'INCLUSIVE', 'ABSORBED'] as const) {
          const { net, tax, gross } = splitTax(quoted, rate, treatment);
          expect(round2(net + tax)).toBe(gross);
        }
      }
    }
  });

  it('leaves a nil-rated supply untaxed under every treatment', () => {
    for (const treatment of ['EXCLUSIVE', 'INCLUSIVE', 'ABSORBED'] as const) {
      const split = splitTax(5000, 0, treatment);
      expect(split).toMatchObject({ net: 5000, tax: 0, gross: 5000, concession: 0 });
    }
  });
});

describe('splitGstComponents', () => {
  it('halves the tax into CGST and SGST within one state', () => {
    expect(splitGstComponents(951.86, '08', '08')).toEqual({
      cgst: 475.93,
      sgst: 475.93,
      igst: 0,
    });
  });

  it('charges IGST across state lines', () => {
    expect(splitGstComponents(951.86, '08', '27')).toEqual({
      cgst: 0,
      sgst: 0,
      igst: 951.86,
    });
  });

  it('keeps the two halves summing to the whole on an odd paisa', () => {
    const { cgst, sgst } = splitGstComponents(951.85, '08', '08');
    expect(round2(cgst + sgst)).toBe(951.85);
  });

  it('assumes intra-state when a state is unknown', () => {
    // A shop selling locally is the overwhelmingly common case, and guessing
    // IGST would put the wrong pair of lines on the bill.
    expect(splitGstComponents(100, null, '08').igst).toBe(0);
    expect(splitGstComponents(100, '08', undefined).igst).toBe(0);
  });
});

describe('amountInWords', () => {
  it('writes the sample estimate total exactly as the shop prints it', () => {
    expect(amountInWords(6240)).toBe('Six Thousand Two Hundred and Forty Rupees only');
  });

  it('groups the Indian way, in lakh and crore', () => {
    expect(amountInWords(1234567)).toBe(
      'Twelve Lakh Thirty Four Thousand Five Hundred and Sixty Seven Rupees only',
    );
    expect(amountInWords(10000000)).toBe('One Crore Rupees only');
  });

  it('spells out paise when there are any', () => {
    expect(amountInWords(1234567.5)).toMatch(/and Fifty Paise only$/);
  });

  it('handles zero and the awkward teens and hundreds', () => {
    expect(amountInWords(0)).toBe('Zero Rupees only');
    expect(amountInWords(15)).toBe('Fifteen Rupees only');
    expect(amountInWords(100)).toBe('One Hundred Rupees only');
    expect(amountInWords(115)).toBe('One Hundred and Fifteen Rupees only');
  });
});

describe('round2', () => {
  it('rounds to paise', () => {
    expect(round2(2288.16 * 1.18)).toBe(2700.03);
    expect(round2(0.005)).toBe(0.01);
  });
});
