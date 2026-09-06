import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';

/**
 * Small data hook. Refetches whenever the screen regains focus, which is what
 * you want on a shop floor: come back to a list and it is current, without a
 * cache layer to reason about.
 */
export function useApi<T>(
  fetcher: () => Promise<T>,
  deps: unknown[] = [],
): {
  data: T | null;
  error: string | null;
  loading: boolean;
  refreshing: boolean;
  reload: () => void;
  refresh: () => void;
  setData: (value: T) => void;
} {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fetcher, deps);

  const load = useCallback(
    async (mode: 'initial' | 'refresh') => {
      if (mode === 'refresh') setRefreshing(true);
      try {
        const result = await run();
        setData(result);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not reach the server');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [run],
  );

  useEffect(() => {
    setLoading(true);
    void load('initial');
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void load('refresh');
    }, [load]),
  );

  return {
    data,
    error,
    loading,
    refreshing,
    reload: () => void load('initial'),
    refresh: () => void load('refresh'),
    setData,
  };
}
