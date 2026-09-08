import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useApi } from './useApi';

it('reports loading, then the data', async () => {
  const { result } = await renderHook(() => useApi(async () => ({ id: 'o1' })));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.data).toEqual({ id: 'o1' });
  expect(result.current.error).toBeNull();
});

it('surfaces the server’s message', async () => {
  const { result } = await renderHook(() =>
    useApi(async () => {
      throw new Error('Order not found');
    }),
  );
  await waitFor(() => expect(result.current.error).toBe('Order not found'));
});

it('says something useful when the server cannot be reached', async () => {
  const { result } = await renderHook(() =>
    useApi(async () => {
      throw 'ECONNREFUSED';
    }),
  );
  await waitFor(() => expect(result.current.error).toBe('Could not reach the server'));
});

it('keeps the last data on screen when a refresh fails', async () => {
  let fail = false;
  const { result } = await renderHook(() =>
    useApi(async () => {
      if (fail) throw new Error('down');
      return 'ok';
    }),
  );
  await waitFor(() => expect(result.current.data).toBe('ok'));
  fail = true;
  await act(async () => result.current.refresh());
  await waitFor(() => expect(result.current.error).toBe('down'));
  // A blank screen would be worse than slightly stale numbers.
  expect(result.current.data).toBe('ok');
});

it('clears the error once a retry succeeds', async () => {
  let fail = true;
  const { result } = await renderHook(() =>
    useApi(async () => {
      if (fail) throw new Error('down');
      return 'ok';
    }),
  );
  await waitFor(() => expect(result.current.error).toBe('down'));
  fail = false;
  await act(async () => result.current.reload());
  await waitFor(() => expect(result.current.error).toBeNull());
});

it('marks a pull-to-refresh as refreshing, not loading', async () => {
  let release: (value: string) => void = () => {};
  const fetcher = jest
    .fn()
    .mockImplementationOnce(async () => 'first')
    .mockImplementationOnce(() => new Promise<string>((r) => (release = r)));

  const { result } = await renderHook(() => useApi(fetcher as never));
  await waitFor(() => expect(result.current.data).toBe('first'));

  await act(async () => result.current.refresh());
  await act(async () => release('second'));
  await waitFor(() => expect(result.current.refreshing).toBe(false));
  expect(result.current.data).toBe('second');
});

it('refetches when a dependency changes', async () => {
  const fetcher = jest.fn(async (id: string) => id);
  const { result, rerender } = await renderHook(
    ({ id }: { id: string }) => useApi(() => fetcher(id), [id]),
    { initialProps: { id: 'a' } },
  );
  await waitFor(() => expect(result.current.data).toBe('a'));
  await rerender({ id: 'b' });
  await waitFor(() => expect(result.current.data).toBe('b'));
});

it('lets a screen write the data back after an action', async () => {
  const { result } = await renderHook(() => useApi(async () => ({ status: 'PLANNED' })));
  await waitFor(() => expect(result.current.data).toEqual({ status: 'PLANNED' }));
  // Settling a payout updates the row in place rather than re-reading the list.
  await act(async () => result.current.setData({ status: 'PAID' }));
  expect(result.current.data).toEqual({ status: 'PAID' });
});
