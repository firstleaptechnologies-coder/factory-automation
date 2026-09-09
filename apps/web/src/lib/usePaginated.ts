'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Paginated } from '@fas/shared';

/**
 * A list that grows a page at a time.
 *
 * Every listing endpoint pages; before this the web asked for page one and
 * quietly pretended that was everything, so a shop past its first 25 orders
 * could not reach the rest.
 */
export function usePaginated<T>(
  fetcher: (page: number) => Promise<Paginated<T>>,
  deps: unknown[] = [],
  { limit = 25 }: { limit?: number } = {},
) {
  const [items, setItems] = useState<T[]>([]);
  const [meta, setMeta] = useState<Paginated<T>['meta'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Guards a second request while one is in flight.
  const inFlight = useRef(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fetcher, deps);

  /*
   * The effect below keys on the dependencies themselves, not on the fetcher's
   * identity.
   *
   * `useCallback` hands back whatever function it was given when the deps
   * change — so a caller passing a *stable* reference (a named function rather
   * than an inline arrow) got the same identity back, the effect never re-ran,
   * and changing a filter silently kept the previous filter's rows.
   */
  const depsKey = JSON.stringify(deps);

  const loadPage = useCallback(
    async (page: number, mode: 'initial' | 'more') => {
      if (inFlight.current) return;
      inFlight.current = true;
      if (mode === 'more') setLoadingMore(true);
      try {
        const result = await run(page);
        setItems((current) => (page === 1 ? result.data : [...current, ...result.data]));
        setMeta(result.meta);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not reach the server');
      } finally {
        inFlight.current = false;
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [run],
  );

  useEffect(() => {
    setLoading(true);
    setItems([]);
    void loadPage(1, 'initial');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depsKey]);

  const hasMore = Boolean(meta && meta.page < meta.pages);

  return {
    items,
    meta,
    total: meta?.total ?? items.length,
    limit,
    loading,
    loadingMore,
    hasMore,
    error,
    reload: () => void loadPage(1, 'initial'),
    loadMore: () => {
      if (hasMore && meta) void loadPage(meta.page + 1, 'more');
    },
  };
}
