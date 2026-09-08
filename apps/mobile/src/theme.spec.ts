import { DEFAULT_ACCENT, applyAccent, gradients, palette, readableOnAccent } from './theme';

describe('applyAccent', () => {
  afterEach(() => applyAccent(DEFAULT_ACCENT));

  it('derives the whole ramp from one colour', () => {
    applyAccent('#2F81F7');
    expect(palette.accent).toBe('#2F81F7');
    // Bright is lighter, deep is darker — otherwise the gradient inverts.
    expect(palette.accentBright).not.toBe(palette.accent);
    expect(palette.accentDeep).not.toBe(palette.accent);
    expect(palette.accentGlow).toMatch(/^rgba\(47,129,247,/);
  });

  it('rebuilds the accent gradients in place', () => {
    // Mutated rather than replaced, because every StyleSheet already holds a
    // reference to these arrays.
    const before = gradients.accent;
    applyAccent('#E4232F');
    expect(gradients.accent[1]).toBe('#E4232F');
    expect(gradients.accent).not.toBe(before);
  });

  it('accepts shorthand hex', () => {
    applyAccent('#0AF');
    expect(palette.accent).toBe('#00AAFF');
  });

  it('refuses anything that is not a colour, leaving the theme alone', () => {
    applyAccent('#2F81F7');
    const good = palette.accent;
    for (const bad of ['red', 'rgb(1,2,3)', '', 'FF6B1A', '#12', 'url(x)']) {
      applyAccent(bad);
      expect(palette.accent).toBe(good);
    }
  });
});

describe('readableOnAccent', () => {
  it('puts white on a dark accent and near-black on a pale one', () => {
    applyAccent('#1F3A93');
    expect(readableOnAccent()).toBe('#FFFFFF');

    // A shop that picks a pale brand yellow must not get white text on it.
    applyAccent('#F5E663');
    expect(readableOnAccent()).not.toBe('#FFFFFF');

    applyAccent(DEFAULT_ACCENT);
  });
});
