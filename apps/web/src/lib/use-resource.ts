"use client";

import * as React from "react";

export type Resource<T> =
  | { status: "loading" }
  | { status: "ready"; data: T }
  | { status: "error"; error: unknown };

/**
 * Minimal data hook for screens: loading, ready, error, and a reload function for "Try again".
 * Re-runs when `key` changes. The fetcher receives an AbortSignal that fires on unmount or re-run.
 */
export function useResource<T>(fetcher: (signal: AbortSignal) => Promise<T>, key: string = ""): Resource<T> & { reload: () => void; setData: (data: T) => void } {
  const [state, setState] = React.useState<Resource<T>>({ status: "loading" });
  const [attempt, setAttempt] = React.useState(0);
  const fetcherRef = React.useRef(fetcher);

  React.useEffect(() => {
    fetcherRef.current = fetcher;
  });

  React.useEffect(() => {
    const controller = new AbortController();
    fetcherRef
      .current(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setState({ status: "ready", data });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setState({ status: "error", error });
      });
    return () => controller.abort();
  }, [key, attempt]);

  const reload = React.useCallback(() => {
    setState({ status: "loading" });
    setAttempt((n) => n + 1);
  }, []);
  const setData = React.useCallback((data: T) => setState({ status: "ready", data }), []);

  return { ...state, reload, setData };
}
