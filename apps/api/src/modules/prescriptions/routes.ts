import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import type { Env } from "../../config/env.js";
import type { Db } from "../../db/client.js";
import { AppError } from "../../lib/errors.js";
import { parse, uuidParam } from "../../lib/validate.js";
import { authenticate, requireAuth, requireRole } from "../../middleware/authenticate.js";
import type { ExtractionProvider } from "../../extraction/types.js";
import type { PrivateFileStore } from "../../storage/types.js";
import { requirePatientAccess } from "../access/patientAccess.js";
import { correctionSchema, correctPrescription } from "./corrections.js";
import { generatePrescriptionPdf } from "./pdf.js";
import { processPrescription } from "./processing.js";
import { createPrescription, getPrescription, listPrescriptions } from "./service.js";
import { parseUpload } from "./upload.js";
import { getLatestVersion, listVersions } from "./versions.js";
import { checkPrescriptionContraindications } from "./contraindications.js";
import { notifyPrescriptionEvent } from "../notifications/service.js";

const listQuerySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.uuid().optional(),
});

export function createPrescriptionRouter(
  db: Db,
  env: Env,
  store: PrivateFileStore,
  /** null means extraction is disabled: processing is refused with PROVIDER_DISABLED. */
  extraction: ExtractionProvider | null,
): Router {
  const router = Router();
  router.use(authenticate(db, env));

  const uploadLimiter = rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    limit: env.UPLOAD_RATE_LIMIT_MAX,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    handler: (_req, _res, next) => next(new AppError("RATE_LIMITED")),
  });

  // Role check and rate limit run before the request body is read.
  router.post("/", requireRole("patient"), uploadLimiter, async (req, res) => {
    const upload = await parseUpload(req, env.UPLOAD_MAX_BYTES);
    const prescription = await createPrescription({ db, store, env }, requireAuth(req), upload, { requestId: req.requestId });
    res.status(201).json({ data: prescription });
  });

  router.get("/", requireRole("patient"), async (req, res) => {
    const query = parse(listQuerySchema, req.query);
    res.json(await listPrescriptions(db, requireAuth(req), query));
  });

  // Resolves the owning patient from the route and runs the consent check
  // before any handler. Patients pass only for their own record.
  const accessGuard = () =>
    requirePatientAccess(db, {
      scope: "prescriptions:read",
      resourceType: "prescription",
      getPatientId: async (req) => {
        const record = await db.prescriptionRecord.findUnique({
          where: { id: uuidParam(req.params.prescriptionId) },
          select: { patientId: true },
        });
        return record?.patientId ?? null;
      },
      getResourceId: (req) => String(req.params.prescriptionId),
    });

  const processLimiter = rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    limit: env.PROCESS_RATE_LIMIT_MAX,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    handler: (_req, _res, next) => next(new AppError("RATE_LIMITED")),
  });

  // Owner or a provider with a live prescriptions:read consent.
  router.get("/:prescriptionId", accessGuard(), async (req, res) => {
    res.json({ data: await getPrescription(db, uuidParam(req.params.prescriptionId)) });
  });

  // Same access as the record itself. Always carries its verification status.
  router.get("/:prescriptionId/latest", accessGuard(), async (req, res) => {
    res.json({ data: await getLatestVersion(db, uuidParam(req.params.prescriptionId)) });
  });

  // Contraindications and drug-drug interaction safety analysis.
  router.get("/:prescriptionId/contraindications", accessGuard(), async (req, res) => {
    res.json({ data: await checkPrescriptionContraindications(db, uuidParam(req.params.prescriptionId), env) });
  });

  // History is owner-only: the patient role is required first, so providers
  // are refused even when they hold a consent.
  router.get("/:prescriptionId/versions", requireRole("patient"), accessGuard(), async (req, res) => {
    const query = parse(listQuerySchema, req.query);
    res.json(await listVersions(db, uuidParam(req.params.prescriptionId), query));
  });

  // Owner-only for the same reason: a consent grants reading, never processing.
  router.post("/:prescriptionId/process", requireRole("patient"), processLimiter, accessGuard(), async (req, res) => {
    const access = req.access;
    if (!access) throw new AppError("FORBIDDEN");
    const prescription = await processPrescription(
      { db, store, provider: extraction },
      requireAuth(req),
      { prescriptionId: uuidParam(req.params.prescriptionId), patientId: access.patientId },
      { requestId: req.requestId },
    );
    // Fire and forget prescription completion notification
    notifyPrescriptionEvent(db, env, prescription.id);
    res.json({ data: prescription });
  });

  // A patient's correction or confirmation becomes a NEW version; nothing is overwritten.
  router.patch("/:prescriptionId/extracted-fields", requireRole("patient"), accessGuard(), async (req, res) => {
    const access = req.access;
    if (!access) throw new AppError("FORBIDDEN");
    const input = parse(correctionSchema, req.body);
    const version = await correctPrescription(
      db,
      requireAuth(req),
      { prescriptionId: uuidParam(req.params.prescriptionId), patientId: access.patientId },
      input,
      { requestId: req.requestId },
    );
    res.status(201).json({ data: version });
  });

  // A file download, not a JSON response. Owner only, never cached.
  router.get("/:prescriptionId/pdf", requireRole("patient"), accessGuard(), async (req, res) => {
    const access = req.access;
    if (!access) throw new AppError("FORBIDDEN");
    const { bytes, filename } = await generatePrescriptionPdf(
      { db, env },
      requireAuth(req),
      { prescriptionId: uuidParam(req.params.prescriptionId), patientId: access.patientId },
      { requestId: req.requestId },
    );
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Content-Length", String(bytes.length));
    res.end(bytes);
  });

  // Streams the original uploaded physical prescription file (image or PDF)
  router.get("/:prescriptionId/file", accessGuard(), async (req, res) => {
    const record = await db.prescriptionRecord.findUnique({
      where: { id: uuidParam(req.params.prescriptionId) },
      select: { originalStorageKey: true, originalMimeType: true, originalFileName: true },
    });
    if (!record) throw new AppError("NOT_FOUND", "Prescription not found");
    const bytes = await store.read(record.originalStorageKey);
    if (!bytes) throw new AppError("NOT_FOUND", "Original prescription file not found");
    res.setHeader("Content-Type", record.originalMimeType);
    res.setHeader("Content-Disposition", `inline; filename="${record.originalFileName}"`);
    res.setHeader("Cache-Control", "private, no-cache");
    res.setHeader("Content-Length", String(bytes.length));
    res.end(bytes);
  });

  return router;
}
