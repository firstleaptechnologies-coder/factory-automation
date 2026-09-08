import { act, renderHook, waitFor } from '@testing-library/react-native';
import { usePaginated } from './usePaginated';

interface Row {
  id: string;
}

const page = (numbers: number[], meta: Partial<{ page: number; pages: number; total: number }>) => ({
  data: numbers.map((n) => ({ id: `r${n}` })) as Row[],
  meta: { page: 1, pages: 1, total: numbers.length, limit: 25, ...meta },
});

it('loads the first page and reports the server’s total', async () => {
  const fetcher = jest.fn(async () => page([1, 2], { total: 137, pages: 6 }));
  const { result } = await renderHook(() => usePaginated(fetcher));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.items).toHaveLength(2);
  // Before this the app asked for page 1 and pretended that was everything.
  expect(result.current.total).toBe(137);
  expect(result.current.hasMore).toBe(true);
});

it('appends the next page rather than replacing what is on screen', async () => {
  const fetcher = jest.fn(async (p: number) =>
    p === 1 ? page([1, 2], { page: 1, pages: 2, total: 4 }) : page([3, 4], { page: 2, pages: 2, total: 4 }),
  );
  const { result } = await renderHook(() => usePaginated(fetcher));
  await waitFor(() => expect(result.current.items).toHaveLength(2));
  await act(async () => result.current.loadMore());
  await waitFor(() => expect(result.current.items).toHaveLength(4));
  expect(result.current.hasMore).toBe(false);
});

it('does not ask for a page past the end', async () => {
  const fetcher = jest.fn(async () => page([1], { page: 1, pages: 1 }));
  const { result } = await renderHook(() => usePaginated(fetcher));
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(async () => result.current.loadMore());
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it('does not fire a second request while one is in flight', async () => {
  // A scroll near the bottom fires loadMore on nearly every frame.
  let release: (value: unknown) => void = () => {};
  const fetcher = jest
    .fn()
    .mockImplementationOnce(async () => page([1], { page: 1, pages: 3, total: 3 }))
    .mockImplementationOnce(() => new Promise((r) => (release = r)));

  const { result } = await renderHook(() => usePaginated(fetcher as never));
  await waitFor(() => expect(result.current.loading).toBe(false));

  await act(async () => {
    result.current.loadMore();
    result.current.loadMore();
    result.current.loadMore();
  });
  expect(fetcher).toHaveBeenCalledTimes(2);
  await act(async () => release(page([2], { page: 2, pages: 3, total: 3 })));
});

it('refetches when a filter changes, even with a stable fetcher', async () => {
  // `useCallback` hands back the same identity for a named function, so keying
  // the effect on the fetcher meant a filter change kept the old rows.
  const seen: (string | undefined)[] = [];
  async function fetcher(this: void, _page: number) {
    return page([1], {});
  }
  const { result, rerender } = await renderHook(
    ({ material }: { material?: string }) => {
      seen.push(material);
      return usePaginated(fetcher, [material]);
    },
    { initialProps: { material: undefined as string | undefined } },
  );
  await waitFor(() => expect(result.current.loading).toBe(false));
  const before = seen.length;

  await rerender({ material: 'm1' });
  await waitFor(() => expect(seen.length).toBeGreaterThan(before));
  expect(result.current.items).toHaveLength(1);
});

it('clears the list while a new filter loads, so old rows are not shown as new', async () => {
  let release: (value: unknown) => void = () => {};
  const fetcher = jest
    .fn()
    .mockImplementationOnce(async () => page([1, 2], {}))
    .mockImplementationOnce(() => new Promise((r) => (release = r)));

  const { result, rerender } = await renderHook(
    ({ material }: { material?: string }) => usePaginated(fetcher as never, [material]),
    { initialProps: { material: undefined as string | undefined } },
  );
  await waitFor(() => expect(result.current.items).toHaveLength(2));

  await rerender({ material: 'm1' });
  expect(result.current.items).toHaveLength(0);
  await act(async () => release(page([3], {})));
});

it('surfaces the server’s message on a failure', async () => {
  const fetcher = jest.fn(async () => {
    throw new Error('Order not found');
  });
  const { result } = await renderHook(() => usePaginated(fetcher as never));
  await waitFor(() => expect(result.current.error).toBe('Order not found'));
  expect(result.current.loading).toBe(false);
});

it('says something useful when the server cannot be reached at all', async () => {
  const fetcher = jest.fn(async () => {
    throw 'ECONNREFUSED';
  });
  const { result } = await renderHook(() => usePaginated(fetcher as never));
  await waitFor(() => expect(result.current.error).toBe('Could not reach the server'));
});

it('clears a stale error once a retry succeeds', async () => {
  let fail = true;
  const fetcher = jest.fn(async () => {
    if (fail) throw new Error('down');
    return page([1], {});
  });
  const { result } = await renderHook(() => usePaginated(fetcher as never));
  await waitFor(() => expect(result.current.error).toBe('down'));
  fail = false;
  await act(async () => result.current.refresh());
  await waitFor(() => expect(result.current.error).toBeNull());
});

it('a pull-to-refresh goes back to page one', async () => {
  const fetcher = jest.fn(async () => page([1], { page: 2, pages: 3, total: 3 }));
  const { result } = await renderHook(() => usePaginated(fetcher as never));
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(async () => result.current.refresh());
  // A stale page 3 is worse than a fresh page 1.
  expect(fetcher.mock.calls.every((call: unknown[]) => call[0] === 1)).toBe(true);
});

it('falls back to the row count when the server sent no meta', async () => {
  const fetcher = jest.fn(async () => {
    throw new Error('down');
  });
  const { result } = await renderHook(() => usePaginated(fetcher as never));
  await waitFor(() => expect(result.current.error).toBeTruthy());
  expect(result.current.total).toBe(0);
});
