import { duplicateClientFrom, normalisePhone } from './phone';

describe('normalisePhone', () => {
  it('reduces every spelling of one mobile number to the same string', () => {
    for (const spelling of [
      '9829012345',
      '+91 98290 12345',
      '098290-12345',
      '(+91) 98290 12345',
      ' 91 9829012345 ',
    ]) {
      expect(normalisePhone(spelling)).toBe('9829012345');
    }
  });

  it('keeps two genuinely different numbers different', () => {
    expect(normalisePhone('9829012345')).not.toBe(normalisePhone('9829012346'));
  });

  it('leaves a number it does not recognise as it was typed', () => {
    // A landline or an internal extension is still what somebody wrote down;
    // trimming it to ten digits would invent a number nobody has.
    expect(normalisePhone('01412345678')).toBe('1412345678');
    expect(normalisePhone('12345')).toBe('12345');
  });

  it('treats nothing, and nothing but punctuation, as no number', () => {
    expect(normalisePhone(undefined)).toBeUndefined();
    expect(normalisePhone(null)).toBeUndefined();
    expect(normalisePhone('')).toBeUndefined();
    expect(normalisePhone('   ')).toBeUndefined();
    expect(normalisePhone('+-()')).toBeUndefined();
  });
});

describe('duplicateClientFrom', () => {
  const conflict = (body: unknown) => ({ status: 409, body });

  it('reads the client the server named', () => {
    const existing = { id: 'c1', name: 'Verma Interiors', code: 'CLI-7', phone: '9829012345' };
    expect(duplicateClientFrom(conflict({ existing }))).toEqual(existing);
  });

  it('ignores a conflict about something other than a client', () => {
    expect(duplicateClientFrom(conflict({ message: 'Already invoiced' }))).toBeNull();
    expect(duplicateClientFrom(conflict({ existing: { code: 'CLI-7' } }))).toBeNull();
  });

  it('ignores anything that is not a conflict at all', () => {
    const existing = { id: 'c1', name: 'V', code: 'CLI-7', phone: null };
    expect(duplicateClientFrom({ status: 500, body: { existing } })).toBeNull();
    expect(duplicateClientFrom(new Error('offline'))).toBeNull();
    expect(duplicateClientFrom(undefined)).toBeNull();
  });
});
