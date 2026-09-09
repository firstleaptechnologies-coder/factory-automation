import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useDisplayUnit } from './useUnit';

const storage = AsyncStorage as unknown as { getItem: jest.Mock; setItem: jest.Mock };

beforeEach(() => {
  jest.clearAllMocks();
  storage.getItem.mockResolvedValue(null);
});

it('starts on feet, which is how this trade talks about sheets', async () => {
  const { result } = await renderHook(() => useDisplayUnit());
  expect(result.current[0]).toBe('FT');
});

it('restores what was chosen last time the app ran', async () => {
  storage.getItem.mockResolvedValue('MM');
  const { result } = await renderHook(() => useDisplayUnit());
  // Someone who thinks in millimetres should not re-pick it every launch.
  await waitFor(() => expect(result.current[0]).toBe('MM'));
});

it('ignores a stored value that is not a unit any more', async () => {
  storage.getItem.mockResolvedValue('FURLONGS');
  const { result } = await renderHook(() => useDisplayUnit());
  await waitFor(() => expect(storage.getItem).toHaveBeenCalled());
  expect(result.current[0]).toBe('FT');
});

it('carries on with the default when storage cannot be read', async () => {
  storage.getItem.mockRejectedValue(new Error('no storage'));
  const { result } = await renderHook(() => useDisplayUnit());
  await waitFor(() => expect(storage.getItem).toHaveBeenCalled());
  expect(result.current[0]).toBe('FT');
});

it('changes the unit and remembers it', async () => {
  const { result } = await renderHook(() => useDisplayUnit());
  await act(async () => result.current[1]('CM'));
  expect(result.current[0]).toBe('CM');
  expect(storage.setItem).toHaveBeenCalledWith('fas.unit', 'CM');
});
