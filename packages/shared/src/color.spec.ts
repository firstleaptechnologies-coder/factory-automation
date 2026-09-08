import {
  INK_DARK,
  INK_LIGHT,
  contrastRatio,
  ensureReadable,
  hexToHsl,
  hslToHex,
  inkOn,
  isReadable,
  normalizeHex,
  relativeLuminance,
} from './color';

describe('reading a hex somebody typed', () => {
  it('takes it with or without the hash', () => {
    expect(normalizeHex('#2EA043')).toBe('#2EA043');
    expect(normalizeHex('2ea043')).toBe('#2EA043');
  });

  it('expands the short form, which is what gets pasted', () => {
    expect(normalizeHex('#f80')).toBe('#FF8800');
  });

  it('ignores the spaces around a paste', () => {
    expect(normalizeHex('  #2EA043 ')).toBe('#2EA043');
  });

  it('says plainly when it is not a colour', () => {
    // The caller keeps what was typed rather than silently picking black.
    expect(normalizeHex('teal')).toBeNull();
    expect(normalizeHex('#12345')).toBeNull();
    expect(normalizeHex('')).toBeNull();
  });
});

describe('hue, saturation and lightness', () => {
  it('round-trips a colour to within a step of itself', () => {
    // The sliders work in whole degrees and percents, so a round trip can land
    // a couple of values out of 255 away. That is invisible — but it is why a picker
    // keeps the colour it was opened on until something is actually moved,
    // rather than rewriting it on the way in.
    for (const hex of ['#FF6B1A', '#2EA043', '#2F81F7', '#D6F55B', '#8957E5']) {
      const back = hslToHex(hexToHsl(hex));
      const apart = (a: string, b: string) =>
        [1, 3, 5].map((at) =>
          Math.abs(parseInt(a.slice(at, at + 2), 16) - parseInt(b.slice(at, at + 2), 16)),
        );
      expect(Math.max(...apart(hex, back))).toBeLessThanOrEqual(2);
    }
  });

  it('reads pure red, green and blue as the hues they are', () => {
    expect(hexToHsl('#FF0000').h).toBe(0);
    expect(hexToHsl('#00FF00').h).toBe(120);
    expect(hexToHsl('#0000FF').h).toBe(240);
  });

  it('calls grey grey, whatever hue it is asked to remember', () => {
    expect(hexToHsl('#808080').s).toBe(0);
  });

  it('clamps rather than wrapping a lightness out of range', () => {
    expect(hslToHex({ h: 30, s: 100, l: 140 })).toBe('#FFFFFF');
    expect(hslToHex({ h: 30, s: 100, l: -20 })).toBe('#000000');
  });

  it('wraps the hue, since a wheel has no end', () => {
    expect(hslToHex({ h: 380, s: 100, l: 50 })).toBe(hslToHex({ h: 20, s: 100, l: 50 }));
  });
});

describe('luminance and contrast', () => {
  it('puts black at nothing and white at everything', () => {
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 5);
    expect(relativeLuminance('#FFFFFF')).toBeCloseTo(1, 5);
  });

  it('rates black on white at the maximum', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
  });

  it('rates a colour against itself as invisible', () => {
    expect(contrastRatio('#2EA043', '#2EA043')).toBeCloseTo(1, 5);
  });

  it('does not care which way round it is asked', () => {
    expect(contrastRatio('#2EA043', '#FFFFFF')).toBeCloseTo(
      contrastRatio('#FFFFFF', '#2EA043'),
      5,
    );
  });
});

describe('the ink to write on a colour', () => {
  it('writes light on a dark colour', () => {
    expect(inkOn('#1F2327')).toBe(INK_LIGHT);
    expect(inkOn('#8957E5')).toBe(INK_LIGHT);
  });

  it('writes dark on a pale one', () => {
    expect(inkOn('#D6F55B')).toBe(INK_DARK);
    expect(inkOn('#FFFFFF')).toBe(INK_DARK);
  });

  it('decides by measurement, not by lightness', () => {
    // A saturated yellow and a saturated blue can share a lightness and still
    // take opposite inks; a brightness shortcut gets exactly this wrong.
    const yellow = '#FFFF00';
    const blue = '#0000FF';
    expect(hexToHsl(yellow).l).toBe(hexToHsl(blue).l);
    expect(inkOn(yellow)).toBe(INK_DARK);
    expect(inkOn(blue)).toBe(INK_LIGHT);
  });

  it('always picks the more readable of the two', () => {
    for (const hex of ['#FF6B1A', '#2EA043', '#D29922', '#6B7785', '#DA3633']) {
      const ink = inkOn(hex);
      const other = ink === INK_LIGHT ? INK_DARK : INK_LIGHT;
      expect(contrastRatio(hex, ink)).toBeGreaterThanOrEqual(contrastRatio(hex, other));
    }
  });
});

describe('a colour somebody has to be able to read on', () => {
  it('leaves a colour that already works alone', () => {
    expect(ensureReadable('#1F2327')).toBe('#1F2327');
    expect(ensureReadable('#D6F55B')).toBe('#D6F55B');
  });

  it('moves a mid tone neither ink can be read on', () => {
    // With two inks to choose from, only the middle of the range fails — and
    // it fails for both, which is exactly the case that needs moving.
    expect(isReadable('#7A7A7A')).toBe(false);
    const fixed = ensureReadable('#7A7A7A');
    expect(isReadable(fixed)).toBe(true);
    expect(fixed).not.toBe('#7A7A7A');
  });

  it('keeps the hue, so it is still the colour they asked for', () => {
    const asked = '#7FB3FF';
    expect(hexToHsl(ensureReadable(asked)).h).toBe(hexToHsl(asked).h);
  });

  it('moves away from its own ink rather than towards it', () => {
    // Dark ink means the colour has to get lighter, and the other way round.
    const asked = '#5F8C3F';
    const fixed = ensureReadable(asked);
    expect(relativeLuminance(fixed)).toBeGreaterThan(relativeLuminance(asked));
    expect(isReadable(fixed)).toBe(true);
  });

  it('gives every colour on the wheel a readable answer', () => {
    for (let h = 0; h < 360; h += 15) {
      for (const l of [10, 30, 50, 70, 90]) {
        expect(isReadable(ensureReadable(hslToHex({ h, s: 90, l })))).toBe(true);
      }
    }
  });

  it('hands back what it was given when that is not a colour at all', () => {
    expect(ensureReadable('nonsense')).toBe('nonsense');
  });
});
