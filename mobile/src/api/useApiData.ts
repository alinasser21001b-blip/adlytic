// ════════════════════════════════════════════════════════════════════════
//  src/api/useApiData.ts — ONE hook every data screen uses, so loading /
//  error / retry behave identically everywhere instead of being
//  reinvented per screen (ALPHA rule: independent booleans for mutually
//  exclusive UI states is a recurring defect in this codebase — see the
//  adlytic-audit conventions. This hook makes "loading vs error vs data"
//  ONE piece of state, not three).
// ════════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { ApiError } from './errors';
import type { ApiErrorKind } from './errors';

type Status<T> =
  | { phase: 'loading' }
  | { phase: 'error'; kind: ApiErrorKind }
  | { phase: 'ready'; data: T; refreshing: boolean };

export function useApiData<T>(fetcher: () => Promise<T>, deps: unknown[]): {
  state: Status<T>;
  reload: () => void;
} {
  const [state, setState] = useState<Status<T>>({ phase: 'loading' });
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const load = useCallback((isRefresh: boolean) => {
    setState((prev) => (isRefresh && prev.phase === 'ready' ? { ...prev, refreshing: true } : { phase: 'loading' }));
    fetcherRef.current()
      .then((data) => setState({ phase: 'ready', data, refreshing: false }))
      .catch((e) => setState({ phase: 'error', kind: e instanceof ApiError ? e.kind : 'UNKNOWN' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  // Reload whenever the screen gains focus (covers background→foreground and
  // tab re-entry), not only on mount.
  useFocusEffect(useCallback(() => { load(false); }, [load]));

  return { state, reload: () => load(true) };
}
