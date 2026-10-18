"use client";

import * as React from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, Info, ShieldAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { prescriptionsApi } from "@/lib/api/prescriptions";
import type { AlertSeverity, ContraindicationAlert, ContraindicationReport } from "@/lib/api/types";
import { useResource } from "@/lib/use-resource";

interface ContraindicationAlertsProps {
  prescriptionId: string;
  status: string;
}

const SEVERITY_CONFIG: Record<
  AlertSeverity,
  {
    label: string;
    tone: "danger" | "warning" | "neutral";
    icon: typeof AlertCircle;
  }
> = {
  high: {
    label: "High Risk Interaction",
    tone: "danger",
    icon: ShieldAlert,
  },
  moderate: {
    label: "Moderate Caution",
    tone: "warning",
    icon: AlertTriangle,
  },
  low: {
    label: "Clinical Caution",
    tone: "neutral",
    icon: Info,
  },
};

export function ContraindicationAlerts({ prescriptionId, status }: ContraindicationAlertsProps) {
  // Only load contraindications once the prescription reading has completed
  const report = useResource(
    () => (status === "completed" ? prescriptionsApi.contraindications(prescriptionId) : Promise.resolve(null)),
    `contraindications:${prescriptionId}:${status}`,
  );

  if (status !== "completed") return null;

  if (report.status === "loading") {
    return (
      <div className="space-y-3 rounded-lg border border-border p-4 animate-pulse bg-card">
        <div className="h-4 w-48 bg-muted rounded" />
        <div className="h-12 w-full bg-muted/60 rounded" />
      </div>
    );
  }

  if (report.status === "error" || !report.data) return null;

  const data: ContraindicationReport = report.data;

  if (!data.hasInteractions || data.alerts.length === 0) {
    return (
      <Alert tone="success" className="mb-6">
        <CheckCircle2 aria-hidden="true" />
        <AlertTitle>No major contraindications detected</AlertTitle>
        <AlertDescription>
          Our automated safety screening checked this prescription for major drug-drug interactions. None were identified among the read medications.
        </AlertDescription>
      </Alert>
    );
  }

  const hasHighRisk = data.alerts.some((a) => a.severity === "high");

  return (
    <section aria-labelledby="contraindications-heading" className="space-y-4 mb-8">
      <div className="flex items-center justify-between">
        <h2 id="contraindications-heading" className="text-lg font-semibold flex items-center gap-2">
          <ShieldAlert className={hasHighRisk ? "text-destructive" : "text-warning"} aria-hidden="true" />
          Medication Interaction & Safety Screening
        </h2>
        <Badge tone={hasHighRisk ? "danger" : "warning"} className="text-xs">
          {data.alerts.length} {data.alerts.length === 1 ? "alert" : "alerts"}
        </Badge>
      </div>

      <Alert tone={hasHighRisk ? "danger" : "warning"}>
        <AlertTriangle aria-hidden="true" />
        <AlertTitle>Important interaction precautions identified</AlertTitle>
        <AlertDescription className="space-y-2">
          <p>{data.summary}</p>
          <p className="font-medium text-foreground">
            Do not alter or discontinue any prescribed medications on your own. Discuss these findings with your doctor or pharmacist.
          </p>
        </AlertDescription>
      </Alert>

      <div className="space-y-4">
        {data.alerts.map((alert: ContraindicationAlert) => {
          const config = SEVERITY_CONFIG[alert.severity];
          const Icon = config.icon;

          return (
            <article
              key={alert.id}
              className="rounded-lg border border-border bg-card p-4 space-y-3 shadow-xs"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="space-y-1">
                  <h3 className="font-semibold text-base flex items-center gap-2">
                    <Icon className="size-4 shrink-0" aria-hidden="true" />
                    {alert.title}
                  </h3>
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="text-xs text-muted-foreground mr-1">Interacting medicines:</span>
                    {alert.medications.map((med) => (
                      <span
                        key={med}
                        className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-foreground border border-border"
                      >
                        {med}
                      </span>
                    ))}
                  </div>
                </div>
                <Badge tone={config.tone}>
                  {config.label}
                </Badge>
              </div>

              <div className="space-y-2 pt-1 text-sm border-t border-border/60">
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    What you should know
                  </h4>
                  <p className="text-foreground leading-relaxed mt-0.5">{alert.patientAdvice}</p>
                </div>

                {alert.clinicalNote ? (
                  <div className="rounded-md bg-muted/50 p-2.5 text-xs text-muted-foreground border border-border/50">
                    <strong className="text-foreground">Clinical monitoring note: </strong>
                    {alert.clinicalNote}
                  </div>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground italic border-t border-border pt-3">
        {data.disclaimer}
      </p>
    </section>
  );
}
