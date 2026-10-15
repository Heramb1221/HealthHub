
import { asList, request } from "./http";
import type { AddConditionInput, HistoryEntry } from "./types";

export interface HistoryApi {
  /** Newest first. */
  list(): Promise<HistoryEntry[]>;
  addCondition(input: AddConditionInput): Promise<HistoryEntry>;
}

const liveHistoryApi: HistoryApi = {
  async list() {
    const items = asList(await request<HistoryEntry[] | { items: HistoryEntry[] }>("/health-history"));
    return [...items].sort((a, b) => (b.occurredOn ?? b.createdAt).localeCompare(a.occurredOn ?? a.createdAt));
  },
  addCondition: (input) => request<HistoryEntry>("/health-history/conditions", { method: "POST", json: input }),
};

export const historyApi: HistoryApi =
  process.env.NEXT_PUBLIC_API_MODE === "live"
    ? liveHistoryApi
    : // Required only in demo builds, so demo accounts and sample data never ship in a live bundle (see README).
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      (require("@/lib/demo/history") as typeof import("@/lib/demo/history")).demoHistoryApi;
