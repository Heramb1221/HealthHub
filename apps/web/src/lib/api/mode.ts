import { IS_DEMO } from "./config";

export function pick<T>(live: T, demo: T): T {
  return IS_DEMO ? demo : live;
}
