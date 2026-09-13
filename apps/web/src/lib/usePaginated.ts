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

  // Guards a second *page* while one is in flight, so a double-tap on "load
  // more" does not append the same rows twice.
  const inFlight = useRef(false);

  /*
   * Which request the rows on screen are allowed to come from.
   *
   * A dependency that changes while a request is in flight used to be dropped
   * on the floor: the effect called `loadPage`, the in-flight guard refused
   * it, and nothing ever asked again — so the list showed the *previous*
   * filter's rows while the controls showed the new one, which is the exact
   * failure the guard below it was written to prevent. It is now the reply
   * that is checked rather than the request refused: a newer request always
   * goes, and an older one's answer is thrown away when it lands late.
   */
  const latest = useRef(0);

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
      if (mode === 'more' && inFlight.current) return;

      const ticket = (latest.current += 1);
      inFlight.current = true;
      if (mode === 'more') setLoadingMore(true);
      try {
        const result = await run(page);
        // Overtaken: these are the old filter's rows, and showing them would
        // contradict the controls.
        if (ticket !== latest.current) return;
        setItems((current) => (page === 1 ? result.data : [...current, ...result.data]));
        setMeta(result.meta);
        setError(null);
      } catch (e) {
        if (ticket !== latest.current) return;
        setError(e instanceof Error ? e.message : 'Could not reach the server');
      } finally {
        // Only the request still in charge may say the list has stopped
        // loading — otherwise a slow reply from a filter nobody is looking at
        // clears the spinner for the one they are.
        if (ticket === latest.current) {
          inFlight.current = false;
          setLoading(false);
          setLoadingMore(false);
        }
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
