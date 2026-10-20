import { useEffect, useState } from "react";
import { Feather } from "@expo/vector-icons";

import { prescriptionApi } from "../api/endpoints";
import type { AlertSeverity, ContraindicationAlert, ContraindicationReport } from "../api/types";
import { AppText, Badge, Banner, Card, Divider, Row, Stack } from "../ui/components";
import { colors, space } from "../ui/theme";

interface ContraindicationAlertsProps {
  prescriptionId: string;
  status: string;
}

const SEVERITY_CONFIG: Record<
  AlertSeverity,
  {
    label: string;
    tone: "danger" | "warning" | "neutral";
    icon: "alert-triangle" | "alert-circle" | "info";
  }
> = {
  high: {
    label: "High Risk Interaction",
    tone: "danger",
    icon: "alert-triangle",
  },
  moderate: {
    label: "Moderate Caution",
    tone: "warning",
    icon: "alert-circle",
  },
  low: {
    label: "Clinical Caution",
    tone: "neutral",
    icon: "info",
  },
};

export function ContraindicationAlerts({ prescriptionId, status }: ContraindicationAlertsProps) {
  const [report, setReport] = useState<ContraindicationReport | null>(null);

  useEffect(() => {
    if (status !== "completed") return;
    let cancelled = false;

    void (async () => {
      try {
        const data = await prescriptionApi.contraindications(prescriptionId);
        if (!cancelled) setReport(data);
      } catch {
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [prescriptionId, status]);

  if (status !== "completed" || !report) return null;

  if (!report.hasInteractions || report.alerts.length === 0) {
    return (
      <Banner tone="success" title="No major contraindications detected" icon="check-circle">
        Our automated safety screening checked this prescription for major drug-drug interactions. None were identified among the read medications.
      </Banner>
    );
  }

  const hasHighRisk = report.alerts.some((a: ContraindicationAlert) => a.severity === "high");

  return (
    <Card>
      <Row style={{ justifyContent: "space-between" }}>
        <Row style={{ gap: space.sm }}>
          <Feather name="shield" size={18} color={hasHighRisk ? colors.danger : colors.warning} />
          <AppText variant="label">Medication Interaction & Safety</AppText>
        </Row>
        <Badge
          label={`${report.alerts.length} ${report.alerts.length === 1 ? "alert" : "alerts"}`}
          tone={hasHighRisk ? "danger" : "warning"}
        />
      </Row>

      <Banner
        tone={hasHighRisk ? "danger" : "warning"}
        title="Important interaction precautions identified"
        icon="alert-triangle"
      >
        {report.summary}
      </Banner>

      <AppText variant="caption" muted>
        Do not alter or discontinue any prescribed medications on your own. Discuss these findings with your doctor or pharmacist.
      </AppText>

      <Divider />

      <Stack gap={space.sm}>
        {report.alerts.map((alert: ContraindicationAlert) => {
          const cfg = SEVERITY_CONFIG[alert.severity] ?? SEVERITY_CONFIG.low;
          return (
            <Card key={alert.id} style={{ backgroundColor: colors.background }}>
              <Row style={{ justifyContent: "space-between" }}>
                <AppText variant="label">{alert.title}</AppText>
                <Badge label={cfg.label} tone={cfg.tone} icon={cfg.icon} />
              </Row>

              <AppText variant="small" muted>
                Involves: {alert.medications.join(" + ")}
              </AppText>

              <AppText variant="caption">{alert.patientAdvice}</AppText>

              {alert.mechanism ? (
                <AppText variant="caption" muted>
                  Mechanism: {alert.mechanism}
                </AppText>
              ) : null}
            </Card>
          );
        })}
      </Stack>
    </Card>
  );
}
