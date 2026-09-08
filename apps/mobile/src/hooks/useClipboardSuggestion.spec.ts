import { looksLikeAddress, looksLikeGstin, looksLikePhone } from './useClipboardSuggestion';

describe('looksLikePhone', () => {
  it('accepts the shapes people actually paste from WhatsApp', () => {
    expect(looksLikePhone('9811100022')).toBe(true);
    expect(looksLikePhone('+91 98111 00022')).toBe(true);
    expect(looksLikePhone('(98111) 00022')).toBe(true);
  });

  it('rejects anything that is not a number to ring', () => {
    expect(looksLikePhone('98111')).toBe(false);          // too short
    expect(looksLikePhone('1234567890123456')).toBe(false); // too long
    expect(looksLikePhone('08AAWFD7264P1ZC')).toBe(false);  // a GSTIN
    expect(looksLikePhone('Bhatia Residence')).toBe(false);
  });
});

describe('looksLikeGstin', () => {
  it('accepts a real GSTIN, in either case', () => {
    expect(looksLikeGstin('08AAWFD7264P1ZC')).toBe(true);
    expect(looksLikeGstin('08aawfd7264p1zc')).toBe(true);
    expect(looksLikeGstin(' 08AAWFD7264P1ZC ')).toBe(true);
  });

  it('rejects a near miss rather than offering to paste rubbish', () => {
    expect(looksLikeGstin('08AAWFD7264P1Z')).toBe(false);   // 14 characters
    expect(looksLikeGstin('08AAWFD7264P1AC')).toBe(false);  // no Z in slot 13
    expect(looksLikeGstin('9811100022')).toBe(false);
  });
});

describe('looksLikeAddress', () => {
  it('accepts something long enough to be an address', () => {
    expect(looksLikeAddress('H-1053, Sitapura industrial area, Jaipur')).toBe(true);
  });

  it('rejects a stray word or a bare number', () => {
    expect(looksLikeAddress('Jaipur')).toBe(false);
    expect(looksLikeAddress('9811100022')).toBe(false);
  });
});
