import { normalisePhone } from './contacts';

describe('normalisePhone', () => {
  it('strips the punctuation an address book stores', () => {
    expect(normalisePhone('+91 98111-00022')).toBe('9811100022');
    expect(normalisePhone('(98111) 00022')).toBe('9811100022');
  });

  it('drops an Indian country code so one person is not two clients', () => {
    // The same number saved with and without +91 must normalise to one value,
    // or picking a contact creates a duplicate of a client already on file.
    expect(normalisePhone('+919811100022')).toBe('9811100022');
    expect(normalisePhone('919811100022')).toBe('9811100022');
    expect(normalisePhone('9811100022')).toBe('9811100022');
  });

  it('keeps a short internal extension as it is', () => {
    expect(normalisePhone('4021')).toBe('4021');
  });

  it('returns nothing for a contact with no number', () => {
    expect(normalisePhone(undefined)).toBeUndefined();
    expect(normalisePhone('')).toBeUndefined();
    expect(normalisePhone('no number')).toBeUndefined();
  });
});
