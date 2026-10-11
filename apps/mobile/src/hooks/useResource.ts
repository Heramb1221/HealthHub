import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useRef, useState } from "react";

interface State<T> {
  data: T | null;
  error: unknown;
  loading: boolean;
  refreshing: boolean;
}

/**
 * Loads a resource when the screen gains focus and exposes reload/refresh.
 * Data lives in memory only: nothing from the API is persisted to device storage.
 */
export function useResource<T>(fetcher: (signal: AbortSignal) => Promise<T>) {
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const controllerRef = useRef<AbortController | null>(null);
  const hasDataRef = useRef(false);
  const [state, setState] = useState<State<T>>({ data: null, error: null, loading: true, refreshing: false });

  const run = useCallback(async (mode: "auto" | "refresh" | "silent") => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setState((s) => ({
      ...s,
      loading: mode === "auto" && !hasDataRef.current,
      refreshing: mode === "refresh",
      error: mode === "silent" ? s.error : null,
    }));
    try {
      const data = await fetcherRef.current(controller.signal);
      if (controller.signal.aborted) return;
      hasDataRef.current = true;
      setState({ data, error: null, loading: false, refreshing: false });
    } catch (error) {
      if (controller.signal.aborted) return;
      setState((s) => ({ ...s, error, loading: false, refreshing: false }));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void run("auto");
      return () => controllerRef.current?.abort();
    }, [run]),
  );

  return {
    ...state,
    reload: useCallback(() => run("auto"), [run]),
    refresh: useCallback(() => run("refresh"), [run]),
    /** Re-fetch without flashing a spinner (used for polling). */
    poll: useCallback(() => run("silent"), [run]),
  };
}
