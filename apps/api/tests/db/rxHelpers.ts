import type { Express } from "express";
import request from "supertest";
import { buildSyntheticPdf } from "../../src/extraction/syntheticDocuments.js";
import { bearer } from "./appHelpers.js";
import type { Harness } from "./helpers.js";

/** Shared helpers for tests that need prescriptions in various states. */
export function rxKit(app: Express, h: Harness) {
  const upload = async (token: string, bytes: Buffer, contentType: string, filename: string): Promise<string> => {
    const res = await request(app).post("/api/v1/prescriptions").set(bearer(token)).attach("file", bytes, { filename, contentType });
    if (res.status !== 201) throw new Error(`upload failed in helper: ${res.status}`);
    return res.body.data.id as string;
  };
  const uploadFixture = (token: string, fixtureId: string) => upload(token, buildSyntheticPdf(fixtureId), "application/pdf", `${fixtureId}.pdf`);
  const uploadUnrecognised = (token: string) =>
    upload(token, Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(100, 3)]), "image/png", "real.png");

  const processRx = (token: string | undefined, id: string, target: Express = app) =>
    request(target).post(`/api/v1/prescriptions/${id}/process`).set(token ? bearer(token) : {});
  /** Upload a fixture and run extraction: leaves version 1. */
  const processed = async (token: string, fixtureId: string): Promise<string> => {
    const id = await uploadFixture(token, fixtureId);
    const res = await processRx(token, id);
    if (res.status !== 200) throw new Error(`process failed in helper: ${res.status}`);
    return id;
  };

  const correct = (token: string | undefined, id: string, body: unknown, target: Express = app) =>
    request(target).patch(`/api/v1/prescriptions/${id}/extracted-fields`).set(token ? bearer(token) : {}).send(body as object);
  const get = (token: string | undefined, path: string, target: Express = app) => request(target).get(`/api/v1${path}`).set(token ? bearer(token) : {});

  const versionsOf = (id: string) =>
    h.db.prescriptionVersion.findMany({ where: { prescriptionId: id }, orderBy: { versionNumber: "asc" }, include: { medications: { orderBy: { position: "asc" } } } });
  const auditOf = (action: string, resourceId: string) => h.db.auditEvent.findMany({ where: { action, resourceId } });

  return { upload, uploadFixture, uploadUnrecognised, processRx, processed, correct, get, versionsOf, auditOf };
}
