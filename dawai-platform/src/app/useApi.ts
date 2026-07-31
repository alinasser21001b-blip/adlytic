import { useCallback, useEffect, useState } from "react";

export function useApi<T>(
  loader: () => Promise<T>,
  dependencies: readonly unknown[] = [],
  refreshMs?: number,
) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const dependencyKey = JSON.stringify(dependencies);

  const reload = useCallback(async (opts?: { soft?: boolean }) => {
    if (!opts?.soft) setError(null);
    try {
      const next = await loader();
      setData(next);
      setError(null);
    } catch (cause) {
      // Keep last-known data on refresh failures (weak network / poll races).
      setError(cause);
    } finally {
      setLoading(false);
    }
    // loader identity is intentionally excluded; callers pass dependency values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dependencyKey]);

  useEffect(() => {
    setLoading(true);
    void reload();
    if (!refreshMs) return;
    const interval = window.setInterval(() => void reload({ soft: true }), refreshMs);
    return () => window.clearInterval(interval);
  }, [reload, refreshMs]);

  return { data, error, loading, reload, setData };
}
