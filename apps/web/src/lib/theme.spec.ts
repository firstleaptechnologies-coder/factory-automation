import { normaliseHex } from './theme';

describe('normaliseHex', () => {
  it('accepts a six-digit hex and upper-cases it', () => {
    expect(normaliseHex('#ff6b1a')).toBe('#FF6B1A');
  });

  it('expands shorthand', () => {
    expect(normaliseHex('#0af')).toBe('#00AAFF');
  });

  it('refuses anything that could reach a stylesheet as something else', () => {
    // A tenant's colour is written straight onto a CSS custom property, so
    // anything that is not plainly a colour is rejected rather than escaped.
    for (const bad of [
      'red',
      'rgb(1,2,3)',
      'FF6B1A',
      '#12',
      '#12345',
      'url(javascript:alert(1))',
      'red; background: url(x)',
      '',
    ]) {
      expect(normaliseHex(bad)).toBeNull();
    }
  });
});
