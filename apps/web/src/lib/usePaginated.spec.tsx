import { act, renderHook } from '@testing-library/react';
import type { Paginated } from '@fas/shared';
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

/*
 * A filter that changes while the list is still loading.
 *
 * The in-flight guard refused the second request outright, so the change was
 * dropped: the rows on screen stayed the old filter's while the controls
 * showed the new one. It surfaced on the orders page, where the display unit
 * is now a remembered preference adopted in an effect — the page asked in feet,
 * adopted millimetres a moment later, and the second request never went.
 *
 * Common enough without that: typing a search while the first page is still
 * in the air is the ordinary case on a shop-floor connection.
 */
describe('a dependency that changes mid-request', () => {
  /** A fetcher whose replies are released by hand, newest last. */
  function controllable() {
    const resolvers: ((rows: string[]) => void)[] = [];
    const asked: string[] = [];
    const fetch = (filter: string) => async (page: number): Promise<Paginated<{ id: string }>> => {
      asked.push(filter);
      return new Promise((resolve) => {
        resolvers.push((rows) =>
          resolve({
            data: rows.map((id) => ({ id })),
            meta: { page, limit: 25, total: rows.length, pages: 1 },
          }),
        );
      });
    };
    return { fetch, asked, resolvers };
  }

  it('asks again rather than dropping the change', async () => {
    const { fetch, asked, resolvers } = controllable();
    const { rerender } = renderHook(
      ({ filter }) => usePaginated<{ id: string }>(fetch(filter), [filter]),
      { initialProps: { filter: 'ft' } },
    );

    // Nothing has answered yet, and the filter moves on.
    rerender({ filter: 'mm' });
    await act(async () => {});

    expect(asked).toEqual(['ft', 'mm']);
  });

  it('shows the new filter’s rows, not the old one’s', async () => {
    const { fetch, resolvers } = controllable();
    const { result, rerender } = renderHook(
      ({ filter }) => usePaginated<{ id: string }>(fetch(filter), [filter]),
      { initialProps: { filter: 'ft' } },
    );

    rerender({ filter: 'mm' });
    await act(async () => {});

    // The second reply lands first, then the first arrives late.
    await act(async () => {
      resolvers[1](['mm-row']);
    });
    await act(async () => {
      resolvers[0](['ft-row']);
    });

    expect(ids(result)).toBe('mm-row');
  });

  it('keeps saying it is loading until the request in charge answers', async () => {
    const { fetch, resolvers } = controllable();
    const { result, rerender } = renderHook(
      ({ filter }) => usePaginated<{ id: string }>(fetch(filter), [filter]),
      { initialProps: { filter: 'ft' } },
    );

    rerender({ filter: 'mm' });
    await act(async () => {});

    // The abandoned request answering must not clear the spinner for the one
    // the screen is actually waiting on.
    await act(async () => {
      resolvers[0](['ft-row']);
    });
    expect(result.current.loading).toBe(true);

    await act(async () => {
      resolvers[1](['mm-row']);
    });
    expect(result.current.loading).toBe(false);
  });

  it('does not show an abandoned request’s failure', async () => {
    const failures: ((error: Error) => void)[] = [];
    const fetch = (filter: string) => async (): Promise<Paginated<{ id: string }>> =>
      new Promise((resolve, reject) => {
        failures.push(reject);
        if (filter === 'mm') resolve({ data: [], meta: { page: 1, limit: 25, total: 0, pages: 1 } });
      });

    const { result, rerender } = renderHook(
      ({ filter }) => usePaginated<{ id: string }>(fetch(filter), [filter]),
      { initialProps: { filter: 'ft' } },
    );

    rerender({ filter: 'mm' });
    await act(async () => {});
    await act(async () => {
      failures[0](new Error('the filter nobody is looking at'));
    });

    expect(result.current.error).toBeNull();
  });
});

/*
 * The guard that is still worth having: two taps on "load more" must not
 * append the same page twice.
 */
it('ignores a second page asked for while the first is still coming', async () => {
  const { fetch, calls } = pager(6);
  const { result } = renderHook(() => usePaginated<{ id: string }>(fetch, []));
  await act(async () => {});

  await act(async () => {
    result.current.loadMore();
    result.current.loadMore();
  });

  expect(calls).toEqual([1, 2]);
  expect(ids(result)).toBe('row-0,row-1,row-2,row-3');
});
