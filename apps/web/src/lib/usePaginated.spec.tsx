import { act, renderHook } from '@testing-library/react';
import type { Paginated } from '@decor/shared';
import { usePaginated } from './usePaginated';

/** A stand-in endpoint: `total` rows, served `limit` at a time. */
function pager(total: number, limit = 2) {
  const calls: number[] = [];
  const fetch = async (page: number): Promise<Paginated<{ id: string }>> => {
    calls.push(page);
    const start = (page - 1) * limit;
    return {
      data: Array.from({ length: Math.max(0, Math.min(limit, total - start)) }, (_, i) => ({
        id: `row-${start + i}`,
      })),
      meta: { page, limit, total, pages: Math.max(Math.ceil(total / limit), 1) },
    };
  };
  return { fetch, calls };
}

const ids = (result: { current: { items: { id: string }[] } }) =>
  result.current.items.map((row) => row.id).join(',');

describe('usePaginated', () => {
  it('loads the first page and knows more is waiting', async () => {
    const { fetch } = pager(5);
    const { result } = renderHook(() => usePaginated<{ id: string }>(fetch, []));
    await act(async () => {});

    expect(ids(result)).toBe('row-0,row-1');
    expect(result.current.hasMore).toBe(true);
    expect(result.current.total).toBe(5);
  });

  it('appends the next page rather than replacing it', async () => {
    const { fetch } = pager(5);
    const { result } = renderHook(() => usePaginated<{ id: string }>(fetch, []));
    await act(async () => {});

    await act(async () => {
      result.current.loadMore();
    });
    expect(ids(result)).toBe('row-0,row-1,row-2,row-3');
  });

  it('stops asking once the last page has arrived', async () => {
    const { fetch, calls } = pager(3);
    const { result } = renderHook(() => usePaginated<{ id: string }>(fetch, []));
    await act(async () => {});

    await act(async () => {
      result.current.loadMore();
    });
    expect(result.current.hasMore).toBe(false);

    // Asking again must not fetch a page that does not exist.
    const before = calls.length;
    await act(async () => {
      result.current.loadMore();
    });
    expect(calls.length).toBe(before);
  });

  it('does not fire a second request while one is in flight', async () => {
    // Scrolling near the bottom fires this on nearly every frame; without the
    // guard the same page is fetched repeatedly and rows duplicate.
    const { fetch, calls } = pager(20);
    const { result } = renderHook(() => usePaginated<{ id: string }>(fetch, []));
    await act(async () => {});

    const before = calls.length;
    await act(async () => {
      result.current.loadMore();
      result.current.loadMore();
      result.current.loadMore();
    });
    expect(calls.length).toBe(before + 1);
  });

  it('starts again from page one when the filters change', async () => {
    // Otherwise a filtered list keeps the rows from the previous filter.
    const { fetch } = pager(6);
    let filter = 'a';
    const { result, rerender } = renderHook(() =>
      usePaginated<{ id: string }>(fetch, [filter]),
    );
    await act(async () => {});
    await act(async () => {
      result.current.loadMore();
    });
    expect(result.current.items).toHaveLength(4);

    filter = 'b';
    rerender();
    await act(async () => {});
    expect(result.current.items).toHaveLength(2);
  });

  it('reports an unreachable server instead of hanging', async () => {
    const failing = async () => {
      throw new Error('Network request failed');
    };
    const { result } = renderHook(() => usePaginated(failing as never, []));
    await act(async () => {});

    expect(result.current.error).toBe('Network request failed');
    expect(result.current.loading).toBe(false);
  });
});
