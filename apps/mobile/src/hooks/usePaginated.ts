import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import type { Paginated } from '@fas/shared';

/**
 * A list that grows as you scroll.
 *
 * Every listing endpoint pages; before this the app asked for page 1 and
 * silently pretended that was everything, so a shop past its first 25 orders
 * could not reach the rest. Pages are appended, and coming back to the screen
 * reloads from the first page — a stale page 3 is worse than a fresh page 1.
 */
export function usePaginated<T>(
  fetcher: (page: number) => Promise<Paginated<T>>,
  deps: unknown[] = [],
  { limit = 25 }: { limit?: number } = {},
) {
  const [items, setItems] = useState<T[]>([]);
  const [meta, setMeta] = useState<Paginated<T>['meta'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Guards a second page request while one is already in flight — a scroll
  // near the bottom fires this on nearly every frame otherwise.
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
    async (page: number, mode: 'initial' | 'refresh' | 'more') => {
      if (inFlight.current) return;
      inFlight.current = true;
      if (mode === 'refresh') setRefreshing(true);
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
        setRefreshing(false);
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

  useFocusEffect(
    useCallback(() => {
      void loadPage(1, 'refresh');
    }, [loadPage]),
  );

  const hasMore = Boolean(meta && meta.page < meta.pages);

  return {
    items,
    meta,
    total: meta?.total ?? items.length,
    limit,
    loading,
    refreshing,
    loadingMore,
    hasMore,
    error,
    refresh: () => void loadPage(1, 'refresh'),
    reload: () => void loadPage(1, 'initial'),
    loadMore: () => {
      if (hasMore && meta) void loadPage(meta.page + 1, 'more');
    },
    setItems,
  };
}
