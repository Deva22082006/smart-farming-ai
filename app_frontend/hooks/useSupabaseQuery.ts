import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';

interface QueryResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Generic hook for Supabase queries with loading / error / empty handling.
 * The `queryFn` receives nothing — build your query inline using the shared
 * supabase client. The hook re-runs when `deps` change.
 */
export function useSupabaseQuery<T>(
  queryFn: () => PromiseLike<{ data: T | null; error: { message: string } | null }>,
  deps: unknown[] = [],
): QueryResult<T> {
  const { session } = useAuth();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(async () => {
    if (!session) {
      setError('Not authenticated — please sign in.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await queryFn();
      if (result.error) {
        setError(result.error.message);
        setData(null);
      } else {
        setData(result.data);
        setError(null);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'An unexpected error occurred');
      setData(null);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, ...deps]);

  useEffect(() => {
    execute();
  }, [execute]);

  return { data, loading, error, refetch: execute };
}
