import { useState } from "react";

/**
 * Shows a server-confirmed result (e.g. the response to a save) immediately, until a newer fetch replaces it.
 * Derived during render, so no effect or extra render pass is needed to keep two copies in sync.
 */
export function useServerValue<T>(server: T | null): readonly [T | null, (value: T) => void] {
  const [override, setOverride] = useState<{ value: T; base: T | null } | null>(null);
  const value = override && override.base === server ? override.value : server;
  return [value, (next: T) => setOverride({ value: next, base: server })] as const;
}
