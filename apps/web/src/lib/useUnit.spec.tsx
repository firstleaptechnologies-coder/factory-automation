import { act, renderHook } from '@testing-library/react';
import { DEFAULT_UNIT } from '@fas/shared';
import { useDisplayUnit } from './useUnit';

beforeEach(() => window.localStorage.clear());

it('starts on the default when nothing has been chosen', () => {
  const { result } = renderHook(() => useDisplayUnit());

  expect(result.current[0]).toBe(DEFAULT_UNIT);
});

it('remembers what was chosen last time', () => {
  window.localStorage.setItem('fas.unit', 'FT');

  const { result } = renderHook(() => useDisplayUnit());

  expect(result.current[0]).toBe('FT');
});

it('writes the choice down', () => {
  const { result } = renderHook(() => useDisplayUnit());

  act(() => result.current[1]('CM'));

  expect(result.current[0]).toBe('CM');
  expect(window.localStorage.getItem('fas.unit')).toBe('CM');
});

// The same key the app writes, so a shop on both does not say it twice.
it('reads the key the app writes', () => {
  window.localStorage.setItem('fas.unit', 'IN');

  const { result } = renderHook(() => useDisplayUnit());

  expect(result.current[0]).toBe('IN');
});

it('ignores a stored value that is not a unit', () => {
  window.localStorage.setItem('fas.unit', 'furlongs');

  const { result } = renderHook(() => useDisplayUnit());

  expect(result.current[0]).toBe(DEFAULT_UNIT);
});

describe('a browser that refuses storage', () => {
  const blocked = () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
  };

  afterEach(() => jest.restoreAllMocks());

  it('still shows a unit', () => {
    blocked();

    const { result } = renderHook(() => useDisplayUnit());

    expect(result.current[0]).toBe(DEFAULT_UNIT);
  });

  it('still lets the choice be made for this visit', () => {
    blocked();
    const { result } = renderHook(() => useDisplayUnit());

    act(() => result.current[1]('M'));

    expect(result.current[0]).toBe('M');
  });
});
