import { Router } from "express";

export const healthRouter = Router();

// Liveness only. A database check is added once Prisma is configured (Milestone 2).
healthRouter.get("/health", (_req, res) => {
  res.json({ data: { status: "ok" } });
});
