import { renderHook, waitFor, act } from '@testing-library/react';
import { useApi } from './useApi';

it('reports loading, then the data', async () => {
  const { result } = renderHook(() => useApi(async () => ({ id: 'o1' })));
  expect(result.current.loading).toBe(true);
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.data).toEqual({ id: 'o1' });
  expect(result.current.error).toBeNull();
});

it('surfaces the server’s message on a failure', async () => {
  const { result } = renderHook(() =>
    useApi(async () => {
      throw new Error('Order not found');
    }),
  );
  await waitFor(() => expect(result.current.error).toBe('Order not found'));
  expect(result.current.loading).toBe(false);
});

it('has something to say about a non-Error rejection too', async () => {
  const { result } = renderHook(() =>
    useApi(async () => {
      throw 'oops';
    }),
  );
  await waitFor(() => expect(result.current.error).toBe('Request failed'));
});

it('clears a stale error once a retry succeeds', async () => {
  let fail = true;
  const { result } = renderHook(() =>
    useApi(async () => {
      if (fail) throw new Error('down');
      return 'ok';
    }),
  );
  await waitFor(() => expect(result.current.error).toBe('down'));
  fail = false;
  act(() => result.current.reload());
  await waitFor(() => expect(result.current.data).toBe('ok'));
  expect(result.current.error).toBeNull();
});

it('re-reads on demand, which is what the refresh button is for', async () => {
  const fetcher = jest.fn(async () => 'ok');
  const { result } = renderHook(() => useApi(fetcher));
  await waitFor(() => expect(result.current.loading).toBe(false));
  act(() => result.current.reload());
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
});

it('re-reads when a dependency changes', async () => {
  const fetcher = jest.fn(async (id: string) => id);
  const { result, rerender } = renderHook(({ id }) => useApi(() => fetcher(id), [id]), {
    initialProps: { id: 'a' },
  });
  await waitFor(() => expect(result.current.data).toBe('a'));
  rerender({ id: 'b' });
  await waitFor(() => expect(result.current.data).toBe('b'));
});

it('ignores a response that arrives after the hook was thrown away', async () => {
  let resolve: (value: string) => void = () => {};
  const { unmount } = renderHook(() =>
    useApi(() => new Promise<string>((r) => (resolve = r))),
  );
  unmount();
  // Setting state on an unmounted hook is the classic React warning; the
  // cancellation flag is what avoids it.
  await act(async () => {
    resolve('late');
  });
});
