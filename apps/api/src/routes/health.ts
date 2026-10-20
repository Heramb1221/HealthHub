import { Router } from "express";

export function createHealthRouter(checkDatabase?: () => Promise<boolean>): Router {
  const router = Router();

  router.get("/health", async (_req, res) => {
    if (!checkDatabase) {
      res.json({ data: { status: "ok" } });
      return;
    }
    const databaseUp = await checkDatabase();
    res.status(databaseUp ? 200 : 503).json({
      data: { status: databaseUp ? "ok" : "degraded", database: databaseUp ? "ok" : "unavailable" },
    });
  });

  return router;
}
