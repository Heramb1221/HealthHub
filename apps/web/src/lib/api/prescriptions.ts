
import { asList, request, requestBlob } from "./http";
import type { CorrectionInput, Prescription, PrescriptionVersion, UploadInput, UploadResult } from "./types";

export interface PrescriptionsApi {
  /** Newest first. */
  list(): Promise<Prescription[]>;
  get(id: string): Promise<Prescription>;
  /** Uploads the file. The response carries the new record's ID and processing status, never a storage URL. */
  upload(input: UploadInput): Promise<UploadResult>;
  /** Asks the server to (re)read the file. Used to retry a failed or stuck reading. */
  process(id: string): Promise<UploadResult>;
  /** Oldest first. */
  versions(id: string): Promise<PrescriptionVersion[]>;
  /** Saves the patient's corrections as a new version. Never edits the original file or earlier versions. */
  correct(id: string, input: CorrectionInput): Promise<Prescription>;
  downloadPdf(id: string): Promise<{ blob: Blob; filename?: string }>;
}

const path = (id: string) => `/prescriptions/${encodeURIComponent(id)}`;

const livePrescriptionsApi: PrescriptionsApi = {
  async list() {
    const items = asList(await request<Prescription[] | { items: Prescription[] }>("/prescriptions"));
    // Do not rely on server ordering: the contract does not define it.
    return [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
  get: (id) => request<Prescription>(path(id)),
  async upload({ file, prescriptionDate, prescriberName }) {
    const formData = new FormData();
    formData.set("file", file);
    if (prescriptionDate) formData.set("prescriptionDate", prescriptionDate);
    if (prescriberName) formData.set("prescriberName", prescriberName);
    const created = await request<UploadResult>("/prescriptions", { method: "POST", formData });
    try {
      return await request<UploadResult>(`${path(created.id)}/process`, { method: "POST" });
    } catch {
      return created;
    }
  },
  process: (id) => request<UploadResult>(`${path(id)}/process`, { method: "POST" }),
  async versions(id) {
    const items = asList(await request<PrescriptionVersion[] | { items: PrescriptionVersion[] }>(`${path(id)}/versions`));
    return [...items].sort((a, b) => a.versionNumber - b.versionNumber);
  },
  correct: (id, input) => request<Prescription>(`${path(id)}/extracted-fields`, { method: "PATCH", json: input }),
  downloadPdf: (id) => requestBlob(`${path(id)}/pdf`),
};

export const prescriptionsApi: PrescriptionsApi =
  process.env.NEXT_PUBLIC_API_MODE === "live"
    ? livePrescriptionsApi
    : // Required only in demo builds, so demo accounts and sample data never ship in a live bundle (see README).
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      (require("@/lib/demo/prescriptions") as typeof import("@/lib/demo/prescriptions")).demoPrescriptionsApi;
