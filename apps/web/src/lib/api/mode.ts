import { IS_DEMO } from "./config";

/**
 * Pick the live or demo implementation of a typed API module.
 * Components import the module (e.g. `prescriptionsApi`) and never know which one they got.
 * Demo implementations live in src/lib/demo and must be typed against the same interface.
 */
export function pick<T>(live: T, demo: T): T {
  return IS_DEMO ? demo : live;
}
