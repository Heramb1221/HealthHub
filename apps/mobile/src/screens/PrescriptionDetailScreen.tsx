import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { useEffect, useRef, useState } from "react";

import { medicationApi, prescriptionApi } from "../api/endpoints";
import { describeError } from "../api/errors";
import type { MedicationInput, Prescription, PrescriptionMedication } from "../api/types";
import { useResource } from "../hooks/useResource";
import { formatDateOnly, formatDateTime, orDash, toDateInput } from "../lib/format";
import { canOfferSchedule, doseLine, medicationReviewReasons, REVIEW_REASON_LABEL } from "../lib/safety";
import { PROCESSING_STATUS, SOURCE_TYPE_LABEL, VERIFICATION_STATUS } from "../lib/status";
import { blankToNull, isValidDateOnly } from "../lib/validation";
import type { RootStackParamList } from "../navigation/types";
import { AppText, Badge, Banner, Button, Card, Divider, Field, Screen, Stack, TextField } from "../ui/components";
import { ErrorState, LoadingState } from "../ui/states";
import { colors, space } from "../ui/theme";

type Props = NativeStackScreenProps<RootStackParamList, "PrescriptionDetail">;

interface MedForm {
  name: string;
  strength: string;
  dose: string;
  route: string;
  frequency: string;
  duration: string;
  instructions: string;
}

const EMPTY_MED: MedForm = { name: "", strength: "", dose: "", route: "", frequency: "", duration: "", instructions: "" };

function medToForm(m: PrescriptionMedication): MedForm {
  return {
    name: m.name ?? "",
    strength: m.strength ?? "",
    dose: m.dose ?? "",
    route: m.route ?? "",
    frequency: m.frequency ?? "",
    duration: m.duration ?? "",
    instructions: m.instructions ?? "",
  };
}

function formToInput(f: MedForm): MedicationInput {
  return {
    name: blankToNull(f.name),
    strength: blankToNull(f.strength),
    dose: blankToNull(f.dose),
    route: blankToNull(f.route),
    frequency: blankToNull(f.frequency),
    duration: blankToNull(f.duration),
    instructions: blankToNull(f.instructions),
  };
}

const MED_FIELDS: { key: keyof MedForm; label: string; hint?: string }[] = [
  { key: "name", label: "Medicine name", hint: "As written on the prescription" },
  { key: "strength", label: "Strength", hint: "For example: 500 mg" },
  { key: "dose", label: "Dose", hint: "For example: 1 tablet" },
  { key: "route", label: "Route", hint: "For example: by mouth" },
  { key: "frequency", label: "How often", hint: "For example: twice a day" },
  { key: "duration", label: "For how long", hint: "For example: 5 days" },
  { key: "instructions", label: "Other instructions" },
];

const POLL_MS = 3000;
const MAX_POLLS = 100;

export function PrescriptionDetailScreen({ route }: Props) {
  const { id } = route.params;
  const res = useResource((signal) => prescriptionApi.get(id, signal));
  const versions = useResource((signal) => prescriptionApi.versions(id, signal));
  const [rx, setRx] = useState<Prescription | null>(null);

  const [editing, setEditing] = useState(false);
  const [dateText, setDateText] = useState("");
  const [prescriber, setPrescriber] = useState("");
  const [meds, setMeds] = useState<MedForm[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  const [processing, setProcessing] = useState(false);
  const [processError, setProcessError] = useState<string | null>(null);
  const [scheduleMsg, setScheduleMsg] = useState<Record<number, { tone: "success" | "danger"; text: string }>>({});
  const [scheduleBusy, setScheduleBusy] = useState<number | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfMsg, setPdfMsg] = useState<string | null>(null);

  useEffect(() => {
    if (res.data && !editing) setRx(res.data);
  }, [res.data, editing]);

  // Poll while the server is still working on the file, with an upper bound.
  const pollCount = useRef(0);
  const status = rx?.processingStatus;
  useEffect(() => {
    if (status !== "pending" && status !== "processing") return;
    const timer = setInterval(() => {
      pollCount.current += 1;
      if (pollCount.current > MAX_POLLS) {
        clearInterval(timer);
        return;
      }
      void res.poll();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [status, res.poll]);

  if (res.loading && !rx) return <Screen><LoadingState label="Loading prescription…" /></Screen>;
  if (res.error && !rx) return <Screen><ErrorState error={res.error} onRetry={res.reload} /></Screen>;
  if (!rx) return null;

  const proc = PROCESSING_STATUS[rx.processingStatus];
  const ver = VERIFICATION_STATUS[rx.verificationStatus];
  const canEdit = rx.processingStatus === "completed" || rx.processingStatus === "failed";
  const stillWorking = rx.processingStatus === "pending" || rx.processingStatus === "processing";
  const gaveUp = stillWorking && pollCount.current > MAX_POLLS;

  async function startProcessing() {
    setProcessing(true);
    setProcessError(null);
    try {
      setRx(await prescriptionApi.process(id));
      pollCount.current = 0;
      void res.poll();
    } catch (error) {
      const info = describeError(error);
      setProcessError(`${info.title}. ${info.detail}`);
    } finally {
      setProcessing(false);
    }
  }

  function beginEdit(current: Prescription) {
    setDateText(toDateInput(current.prescriptionDate));
    setPrescriber(current.prescriberName ?? "");
    setMeds(current.medications.length ? current.medications.map(medToForm) : [{ ...EMPTY_MED }]);
    setSaveMsg(null);
    setEditing(true);
  }

  const dateError = dateText && !isValidDateOnly(dateText) ? "Use the format YYYY-MM-DD, for example 2026-10-08." : null;

  async function saveCorrection() {
    if (dateError) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const nonEmpty = meds.filter((m) => Object.values(m).some((v) => v.trim() !== ""));
      const updated = await prescriptionApi.correct(id, {
        prescriptionDate: blankToNull(dateText),
        prescriberName: blankToNull(prescriber),
        medications: nonEmpty.map(formToInput),
      });
      setRx(updated);
      setEditing(false);
      setSaveMsg({ tone: "success", text: "Saved as your correction. The original file and earlier versions are kept." });
      void versions.reload();
    } catch (error) {
      const info = describeError(error);
      setSaveMsg({ tone: "danger", text: `${info.title}. ${info.detail}` });
    } finally {
      setSaving(false);
    }
  }

  async function addToSchedule(index: number) {
    setScheduleBusy(index);
    try {
      const created = await medicationApi.create({
        prescriptionId: id,
        medicationIndex: index,
        startDate: todayKey(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      setScheduleMsg((m) => ({ ...m, [index]: { tone: "success", text: `Added to your medicine schedule${created?.medicationName ? `: ${created.medicationName}` : ""}.` } }));
    } catch (error) {
      const info = describeError(error);
      setScheduleMsg((m) => ({ ...m, [index]: { tone: "danger", text: `${info.title}. ${info.detail}` } }));
    } finally {
      setScheduleBusy(null);
    }
  }

  async function sharePdf() {
    setPdfBusy(true);
    setPdfMsg(null);
    let file: File | null = null;
    try {
      if (!(await Sharing.isAvailableAsync())) {
        setPdfMsg("Sharing isn't available on this device.");
        return;
      }
      const { url, headers } = prescriptionApi.pdfRequest(id);
      file = await File.downloadFileAsync(url, new File(Paths.cache, `healthhub-prescription-${id}.pdf`), { headers, idempotent: true });
      await Sharing.shareAsync(file.uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf", dialogTitle: "Prescription PDF" });
    } catch {
      setPdfMsg("Couldn't get the PDF. Check your connection and that the prescription has finished reading, then try again.");
    } finally {
      // The PDF holds health information: don't leave a copy in the app cache.
      try {
        file?.delete();
      } catch {
        // already gone
      }
      setPdfBusy(false);
    }
  }

  if (editing) {
    return (
      <Screen>
        <Stack>
          <Banner tone="info" title="Compare with your paper prescription" icon="search">
            Your changes are saved as a new version marked "Corrected by you". That is not a clinician's verification.
          </Banner>
          {saveMsg ? <Banner tone={saveMsg.tone} title={saveMsg.text} icon="alert-circle" /> : null}
          <TextField label="Prescription date" value={dateText} onChangeText={setDateText} error={dateError} hint="YYYY-MM-DD, or leave blank if unknown" keyboardType="numbers-and-punctuation" />
          <TextField label="Prescriber name" value={prescriber} onChangeText={setPrescriber} hint="Leave blank if unknown" />
          {meds.map((m, i) => (
            <Card key={i}>
              <AppText variant="heading" accessibilityRole="header">Medicine {i + 1}</AppText>
              {MED_FIELDS.map((f) => (
                <TextField
                  key={f.key}
                  label={`${f.label} (medicine ${i + 1})`}
                  value={m[f.key]}
                  onChangeText={(text) => setMeds((all) => all.map((x, j) => (j === i ? { ...x, [f.key]: text } : x)))}
                  {...(f.hint ? { hint: f.hint } : {})}
                  multiline={f.key === "instructions"}
                />
              ))}
              <Button label={`Remove medicine ${i + 1}`} variant="danger" icon="trash-2" onPress={() => setMeds((all) => all.filter((_, j) => j !== i))} />
            </Card>
          ))}
          <Button label="Add a medicine" variant="secondary" icon="plus" onPress={() => setMeds((all) => [...all, { ...EMPTY_MED }])} />
          <Button label="Save correction" onPress={() => void saveCorrection()} loading={saving} disabled={Boolean(dateError)} />
          <Button label="Cancel" variant="ghost" onPress={() => setEditing(false)} disabled={saving} />
        </Stack>
      </Screen>
    );
  }

  return (
    <Screen refreshing={res.refreshing} onRefresh={res.refresh}>
      <Stack>
        <Card>
          <AppText variant="heading" accessibilityRole="header">Status</AppText>
          <Badge label={proc.label} tone={proc.tone} icon={proc.icon as never} />
          <AppText variant="small" muted>{proc.explanation}</AppText>
          {stillWorking ? <AppText variant="caption" muted>{gaveUp ? "This is taking longer than expected. Pull down to check again." : "Checking automatically…"}</AppText> : null}
          {rx.processingStatus === "pending" || rx.processingStatus === "failed" ? (
            <Button label={rx.processingStatus === "failed" ? "Try reading again" : "Start reading"} icon="play" variant="secondary" onPress={() => void startProcessing()} loading={processing} />
          ) : null}
          {processError ? <Banner tone="danger" title={processError} icon="alert-circle" /> : null}
          <Divider />
          <Badge label={ver.label} tone={ver.tone} icon={ver.icon as never} />
          <AppText variant="small" muted>{ver.explanation}</AppText>
        </Card>

        <Card>
          <AppText variant="heading" accessibilityRole="header">Source</AppText>
          <Field label="Source" value={SOURCE_TYPE_LABEL[rx.sourceType] ?? rx.sourceType} />
          {rx.sourceType === "uploaded_physical" ? (
            <AppText variant="small" muted>This is a copy of a paper prescription that you uploaded. It is not a digitally issued or signed prescription.</AppText>
          ) : null}
          <Field label="Uploaded" value={formatDateTime(rx.createdAt)} />
          <Field label="Last updated" value={formatDateTime(rx.updatedAt)} />
        </Card>

        {rx.processingStatus === "completed" && rx.verificationStatus !== "verified_by_authorized_clinician" ? (
          <Banner tone="warning" title="Check these details before relying on them" icon="alert-triangle">
            Reading by computer can make mistakes. HealthHub does not give medical advice. Follow your doctor's instructions.
          </Banner>
        ) : null}
        {saveMsg ? <Banner tone={saveMsg.tone} title={saveMsg.text} icon="info" /> : null}

        <Card>
          <AppText variant="heading" accessibilityRole="header">Prescription details</AppText>
          <Field label="Prescription date" value={formatDateOnly(rx.prescriptionDate)} />
          <Field label="Prescriber" value={orDash(rx.prescriberName)} />
        </Card>

        <AppText variant="heading" accessibilityRole="header">Medicines</AppText>
        {rx.medications.length === 0 ? (
          <AppText muted>{stillWorking ? "Medicines will appear here once reading finishes." : "No medicines have been recorded for this prescription."}</AppText>
        ) : (
          rx.medications.map((m, i) => {
            const reasons = medicationReviewReasons(m);
            const line = doseLine(m);
            const sched = scheduleMsg[i];
            return (
              <Card key={i}>
                <AppText variant="label">{m.name ?? "Name not read"}</AppText>
                {reasons.length > 0 ? (
                  <Banner tone="warning" title="Needs review" icon="search">
                    {reasons.map((r) => REVIEW_REASON_LABEL[r]).join(" · ")}
                  </Banner>
                ) : line ? (
                  <AppText variant="small" muted>{line}</AppText>
                ) : null}
                <Field label="Strength" value={orDash(m.strength)} />
                <Field label="Dose" value={orDash(m.dose)} />
                <Field label="Route" value={orDash(m.route)} />
                <Field label="How often" value={orDash(m.frequency)} />
                <Field label="For how long" value={orDash(m.duration)} />
                <Field label="Other instructions" value={orDash(m.instructions)} />
                <AppText variant="caption" muted>Reading confidence: {Math.round((m.confidence ?? 0) * 100)}%</AppText>
                {canOfferSchedule(rx, m) ? (
                  <>
                    <Button label={`Add ${m.name ?? "medicine"} to schedule`} variant="secondary" icon="clock" onPress={() => void addToSchedule(i)} loading={scheduleBusy === i} />
                    {sched ? <Banner tone={sched.tone} title={sched.text} icon={sched.tone === "success" ? "check-circle" : "alert-circle"} /> : null}
                  </>
                ) : (
                  <AppText variant="caption" color={colors.warning}>A schedule can't be made until this medicine is complete and reviewed.</AppText>
                )}
              </Card>
            );
          })
        )}

        <Stack gap={space.sm}>
          {canEdit ? <Button label={rx.processingStatus === "failed" ? "Enter details yourself" : "Review and correct details"} icon="edit-3" onPress={() => beginEdit(rx)} /> : null}
          <Button label="Share or save as PDF" icon="share" variant="secondary" onPress={() => void sharePdf()} loading={pdfBusy} disabled={rx.processingStatus !== "completed"} />
          {pdfMsg ? <Banner tone="danger" title={pdfMsg} icon="alert-circle" /> : null}
        </Stack>

        <Card>
          <AppText variant="heading" accessibilityRole="header">Version history</AppText>
          {versions.loading ? (
            <AppText muted>Loading versions…</AppText>
          ) : versions.error ? (
            <AppText muted>Version history couldn't be loaded.</AppText>
          ) : (versions.data?.items.length ?? 0) === 0 ? (
            <AppText muted>No versions yet.</AppText>
          ) : (
            versions.data?.items.map((v) => (
              <Field
                key={v.id}
                label={`Version ${v.versionNumber} · ${v.kind === "patient_correction" ? "Your correction" : "Automatic reading"}`}
                value={`${formatDateTime(v.createdAt)}${v.changedFields?.length ? ` · Changed: ${v.changedFields.join(", ")}` : ""}`}
              />
            ))
          )}
          <AppText variant="caption" muted>The original file is kept unchanged. Corrections never overwrite it.</AppText>
        </Card>
      </Stack>
    </Screen>
  );
}

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
