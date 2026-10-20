import type { AuditOutcome, Prisma } from "../../generated/prisma/client.js";
import type { Db } from "../../db/client.js";

export interface AuditInput {
  action: string;
  outcome: AuditOutcome;
  actorUserId?: string | null;
  patientId?: string | null;
  resourceType?: string;
  resourceId?: string;
  requestId?: string;

  metadata?: Record<string, string | number | boolean | string[]>;
}

type Writer = Db | Prisma.TransactionClient;

export async function recordAudit(writer: Writer, input: AuditInput): Promise<void> {
  await writer.auditEvent.create({
    data: {
      action: input.action,
      outcome: input.outcome,
      actorUserId: input.actorUserId ?? null,
      patientId: input.patientId ?? null,
      resourceType: input.resourceType ?? null,
      resourceId: input.resourceId ?? null,
      requestId: input.requestId ?? null,
      ...(input.metadata ? { metadata: input.metadata } : {}),
    },
  });
}
