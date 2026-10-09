import { Router } from "express";

/**
 * Liveness plus a database check. `checkDatabase` is injected so the route can
 * be tested without a database. The response never includes connection details.
 */
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
