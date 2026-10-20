import type { Db } from "../../db/client.js";
import type { AuthContext } from "../../middleware/authenticate.js";
import { AppError } from "../../lib/errors.js";

export async function ownPatientId(db: Db, auth: AuthContext): Promise<string> {
  if (auth.role !== "patient") throw new AppError("FORBIDDEN");
  const patient = await db.patient.findUnique({ where: { userId: auth.userId }, select: { id: true } });
  if (!patient) throw new AppError("FORBIDDEN");
  return patient.id;
}
