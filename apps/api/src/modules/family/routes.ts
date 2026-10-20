import { Router } from "express";
import type { Env } from "../../config/env.js";
import type { Db } from "../../db/client.js";
import { AppError } from "../../lib/errors.js";
import { parse } from "../../lib/validate.js";
import { authenticate, requireAuth, requireRole } from "../../middleware/authenticate.js";
import { createFamilyMemberSchema, queryFamilyMembersSchema, updateFamilyMemberSchema } from "./schemas.js";
import { addFamilyMember, deleteFamilyMember, listFamilyMembers, updateFamilyMember } from "./service.js";

export function createFamilyRouter(db: Db, env: Env): Router {
  const router = Router();
  router.use(authenticate(db, env));

  router.get("/", async (req, res) => {
    const query = parse(queryFamilyMembersSchema, req.query);
    res.setHeader("Cache-Control", "private, no-store");
    const result = await listFamilyMembers(db, requireAuth(req), query, { requestId: req.requestId });
    res.json(result);
  });

  router.post("/", requireRole("patient"), async (req, res) => {
    const input = parse(createFamilyMemberSchema, req.body);
    const result = await addFamilyMember(db, requireAuth(req), input, { requestId: req.requestId });
    res.status(201).json({ data: result });
  });

  router.patch("/:id", requireRole("patient"), async (req, res) => {
    const id = req.params.id;
    if (typeof id !== "string" || !id.trim()) throw new AppError("VALIDATION_ERROR");
    const input = parse(updateFamilyMemberSchema, req.body);
    const result = await updateFamilyMember(db, requireAuth(req), id, input, { requestId: req.requestId });
    res.json({ data: result });
  });

  router.delete("/:id", requireRole("patient"), async (req, res) => {
    const id = req.params.id;
    if (typeof id !== "string" || !id.trim()) throw new AppError("VALIDATION_ERROR");
    const result = await deleteFamilyMember(db, requireAuth(req), id, { requestId: req.requestId });
    res.json({ data: result });
  });

  return router;
}
