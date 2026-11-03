
import { asList, request, requestBlob } from "./http";
import type { CorrectionInput, Prescription, PrescriptionVersion, UploadInput, UploadResult } from "./types";

export interface PrescriptionsApi {

  list(): Promise<Prescription[]>;
  get(id: string): Promise<Prescription>;

  upload(input: UploadInput): Promise<UploadResult>;

  process(id: string): Promise<UploadResult>;

  versions(id: string): Promise<PrescriptionVersion[]>;
  /** The newest version of the record (what a correction is based on). */
  latestVersion(id: string): Promise<PrescriptionVersion>;

  correct(id: string, input: CorrectionInput): Promise<Prescription>;
  downloadPdf(id: string): Promise<{ blob: Blob; filename?: string }>;
  downloadFile(id: string): Promise<{ blob: Blob; filename?: string }>;
  contraindications(id: string): Promise<import("./types").ContraindicationReport>;
  delete(id: string): Promise<{ deleted: boolean }>;
}

const path = (id: string) => `/prescriptions/${encodeURIComponent(id)}`;

/**
 * Build the PATCH body the API's strict correctionSchema accepts: `baseVersionNumber` is required,
 * and `confirmed: true` marks rows the patient checked against the paper original.
 */
export function toCorrectionBody(input: CorrectionInput & { baseVersionNumber: number }) {
  return {
    baseVersionNumber: input.baseVersionNumber,
    prescriptionDate: input.prescriptionDate,
    prescriberName: input.prescriberName,
    medications: input.medications.map((m) => ({ ...m, ...(input.confirmedByPatient ? { confirmed: true } : {}) })),
  };
}

const livePrescriptionsApi: PrescriptionsApi = {
  async list() {
    const items = asList(await request<Prescription[] | { items: Prescription[] }>("/prescriptions"));

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
  latestVersion: (id) => request<PrescriptionVersion>(`${path(id)}/latest`),
  async correct(id, input) {
    // The API requires the version the edit is based on. Without it every save is rejected (400).
    const base = input.baseVersionNumber ?? (await request<PrescriptionVersion>(`${path(id)}/latest`)).versionNumber;
    await request<unknown>(`${path(id)}/extracted-fields`, { method: "PATCH", json: toCorrectionBody({ ...input, baseVersionNumber: base }) });
    // The API answers with the new *version*; the screen needs the *prescription* (its id is different).
    return request<Prescription>(path(id));
  },
  downloadPdf: (id) => requestBlob(`${path(id)}/pdf`),
  downloadFile: (id) => requestBlob(`${path(id)}/file`),
  contraindications: (id) => request<import("./types").ContraindicationReport>(`${path(id)}/contraindications`),
  delete: (id) => request<{ deleted: boolean }>(path(id), { method: "DELETE" }),
};

export const prescriptionsApi: PrescriptionsApi =
  process.env.NEXT_PUBLIC_API_MODE === "live"
    ? livePrescriptionsApi
    :
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      (require("@/lib/demo/prescriptions") as typeof import("@/lib/demo/prescriptions")).demoPrescriptionsApi;
