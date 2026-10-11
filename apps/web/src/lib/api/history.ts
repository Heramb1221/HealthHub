import { demoHistoryApi } from "@/lib/demo/history";

import { asList, request } from "./http";
import { pick } from "./mode";
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

export const historyApi: HistoryApi = pick(liveHistoryApi, demoHistoryApi);
