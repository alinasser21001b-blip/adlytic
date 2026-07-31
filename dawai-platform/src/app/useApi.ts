import { useCallback, useEffect, useState } from "react";

export function useApi<T>(
  loader: () => Promise<T>,
  dependencies: readonly unknown[] = [],
  refreshMs?: number,
) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading((current) => current || data === null);
    setError(null);
    try {
      setData(await loader());
    } catch (cause) {
      setError(cause);
    } finally {
      setLoading(false);
    }
  }, dependencies);

  useEffect(() => {
    void reload();
    if (!refreshMs) return;
    const interval = window.setInterval(() => void reload(), refreshMs);
    return () => window.clearInterval(interval);
  }, [reload, refreshMs]);

  return { data, error, loading, reload, setData };
}
