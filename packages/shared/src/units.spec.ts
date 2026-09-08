import { DEFAULT_UNIT, LENGTH_UNITS, fromMm, parseLengthToMm, toMm } from './units';

describe('unit conversion', () => {
  it('stores everything in millimetres', () => {
    expect(toMm(8, 'FT')).toBeCloseTo(2438.4, 4);
    expect(toMm(1, 'M')).toBe(1000);
    expect(toMm(1, 'IN')).toBeCloseTo(25.4, 6);
    expect(toMm(1, 'CM')).toBe(10);
    expect(toMm(500, 'MM')).toBe(500);
  });

  it('round-trips every unit to the precision it is displayed at', () => {
    // A size typed in feet, stored in mm and shown again in feet must be the
    // number the shop wrote down. `fromMm` rounds to each unit's own display
    // precision, so the round trip is exact to that and no further — asking
    // for more decimals than a unit shows is asking it to invent them.
    const precision: Record<string, number> = { MM: 1, CM: 2, M: 3, IN: 3, FT: 3 };

    for (const unit of LENGTH_UNITS) {
      for (const value of [1, 4, 8.5, 123.456]) {
        const rounded = Number(value.toFixed(precision[unit]));
        expect(fromMm(toMm(rounded, unit), unit)).toBeCloseTo(rounded, precision[unit]);
      }
    }
  });

  it('keeps a millimetre value exact, since that is what is stored', () => {
    for (const value of [1, 914.4, 2438.4, 123456.7]) {
      expect(fromMm(toMm(value, 'MM'), 'MM')).toBe(value);
    }
  });

  it('defaults to feet, which is what the floor speaks', () => {
    expect(DEFAULT_UNIT).toBe('FT');
  });
});

describe('parseLengthToMm', () => {
  it('reads a plain number in the given unit', () => {
    expect(parseLengthToMm('8', 'FT')).toBeCloseTo(2438.4, 4);
  });

  it("reads feet and inches written as 8' 6\"", () => {
    // 8ft 6in = 102in = 2590.8mm.
    expect(parseLengthToMm(`8' 6"`, 'FT')).toBeCloseTo(2590.8, 3);
  });

  it('reads a fraction in the unit already chosen', () => {
    // A thickness field set to inches offers "3/4" as its own example, so
    // typing exactly that has to mean three quarters of an inch.
    expect(parseLengthToMm('3/4', 'IN')).toBeCloseTo(19.05, 3);
    expect(parseLengthToMm('1/2', 'FT')).toBeCloseTo(152.4, 3);
  });

  it('reads a whole number and a fraction together', () => {
    expect(parseLengthToMm('6 1/2', 'IN')).toBeCloseTo(165.1, 3);
    expect(parseLengthToMm('6 1/2"', 'MM')).toBeCloseTo(165.1, 3);
  });

  it('still reads inches when the fraction says so, whatever unit is active', () => {
    expect(parseLengthToMm('3/4 in', 'FT')).toBeCloseTo(19.05, 3);
    expect(parseLengthToMm('3/4"', 'MM')).toBeCloseTo(19.05, 3);
  });

  it('refuses what it cannot read rather than guessing', () => {
    expect(parseLengthToMm('', 'FT')).toBeNull();
    expect(parseLengthToMm('abc', 'FT')).toBeNull();
    expect(parseLengthToMm('3/0', 'IN')).toBeNull();
    expect(parseLengthToMm('/4', 'IN')).toBeNull();
  });
});
