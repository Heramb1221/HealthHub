import { Feather } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { Alert, Modal, ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";

import { vaccinationApi } from "../api/endpoints";
import { describeError } from "../api/errors";
import type { PatientVaccination } from "../api/types";
import { useResource } from "../hooks/useResource";
import { VACCINE_CATEGORIES, type VaccineCategory } from "../lib/vaccineCatalog";
import { AppText, Badge, Banner, Button, Card, Chip, Divider, Row, Screen, Stack, TextField } from "../ui/components";
import { EmptyState, ErrorState, LoadingState } from "../ui/states";
import { colors, radius, space } from "../ui/theme";

export function VaccinationScreen() {
  const res = useResource((signal) => vaccinationApi.list(signal));
  const [selectedCat, setSelectedCat] = useState<VaccineCategory | "all">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "taken" | "not_taken" | "unrecorded">("all");
  const [search, setSearch] = useState("");
  const [expandedName, setExpandedName] = useState<string | null>(null);

  const [detailDate, setDetailDate] = useState("");
  const [detailNotes, setDetailNotes] = useState("");
  const [savingName, setSavingName] = useState<string | null>(null);

  const [customModal, setCustomModal] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customStatus, setCustomStatus] = useState<"taken" | "not_taken">("taken");
  const [customDate, setCustomDate] = useState("");
  const [customNotes, setCustomNotes] = useState("");
  const [savingCustom, setSavingCustom] = useState(false);

  const allItems: PatientVaccination[] = useMemo(() => res.data?.data ?? [], [res.data?.data]);
  const summary = res.data?.summary ?? {
    total: allItems.length,
    taken: allItems.filter((i: PatientVaccination) => i.status === "taken").length,
    notTaken: allItems.filter((i: PatientVaccination) => i.status === "not_taken").length,
    unrecorded: allItems.filter((i: PatientVaccination) => i.status === null).length,
  };

  const filtered = useMemo(() => {
    return allItems.filter((item: PatientVaccination) => {
      if (selectedCat !== "all") {
        if (selectedCat === "custom" && !item.isCustom && item.category !== "custom") return false;
        if (selectedCat !== "custom" && item.category !== selectedCat) return false;
      }
      if (statusFilter === "taken" && item.status !== "taken") return false;
      if (statusFilter === "not_taken" && item.status !== "not_taken") return false;
      if (statusFilter === "unrecorded" && item.status !== null) return false;

      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const matchName = item.vaccineName.toLowerCase().includes(q);
        const matchDesc = item.description.toLowerCase().includes(q);
        if (!matchName && !matchDesc) return false;
      }
      return true;
    });
  }, [allItems, selectedCat, statusFilter, search]);

  async function handleSetStatus(item: PatientVaccination, targetStatus: "taken" | "not_taken", dateVal?: string | null, notesVal?: string | null) {
    setSavingName(item.vaccineName);
    try {
      await vaccinationApi.record({
        vaccineName: item.vaccineName,
        vaccineId: item.vaccineId,
        category: item.category,
        status: targetStatus,
        administeredDate: dateVal !== undefined ? dateVal : item.administeredDate,
        notes: notesVal !== undefined ? notesVal : item.notes,
      });
      await res.reload();
    } catch (err) {
      const info = describeError(err);
      Alert.alert(info.title, info.detail);
    } finally {
      setSavingName(null);
    }
  }

  async function handleClear(item: PatientVaccination) {
    setSavingName(item.vaccineName);
    try {
      await vaccinationApi.remove(item.vaccineName);
      setExpandedName(null);
      await res.reload();
    } catch (err) {
      const info = describeError(err);
      Alert.alert(info.title, info.detail);
    } finally {
      setSavingName(null);
    }
  }

  async function handleSaveCustom() {
    if (!customName.trim()) {
      Alert.alert("Missing name", "Please enter the vaccine name.");
      return;
    }
    setSavingCustom(true);
    try {
      await vaccinationApi.record({
        vaccineName: customName.trim(),
        category: "custom",
        status: customStatus,
        administeredDate: customDate.trim() || null,
        notes: customNotes.trim() || null,
      });
      setCustomModal(false);
      setCustomName("");
      setCustomDate("");
      setCustomNotes("");
      await res.reload();
    } catch (err) {
      const info = describeError(err);
      Alert.alert(info.title, info.detail);
    } finally {
      setSavingCustom(false);
    }
  }

  if (res.loading && !res.data) {
    return (
      <Screen>
        <LoadingState label="Loading vaccination directory…" />
      </Screen>
    );
  }

  if (res.error && !res.data) {
    return (
      <Screen>
        <ErrorState error={res.error} onRetry={res.reload} />
      </Screen>
    );
  }

  return (
    <Screen refreshing={res.refreshing} onRefresh={res.refresh}>
      <Stack>
        <Banner tone="info" title="Self-reported record" icon="shield">
          Track which vaccines you have received. Based on India's National Immunization Programme, IAP recommendations, and approved vaccines.
        </Banner>

        <Row style={{ flexWrap: "wrap", gap: space.sm }}>
          <Badge label={`Total: ${summary.total}`} tone="neutral" />
          <Badge label={`Taken: ${summary.taken}`} tone="success" icon="check-circle" />
          <Badge label={`Not Taken: ${summary.notTaken}`} tone="warning" icon="x-circle" />
          <Badge label={`Unrecorded: ${summary.unrecorded}`} tone="neutral" />
        </Row>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryScroll}>
          {VACCINE_CATEGORIES.map((cat) => (
            <Chip
              key={cat.id}
              label={cat.label}
              selected={selectedCat === cat.id}
              onPress={() => setSelectedCat(cat.id)}
            />
          ))}
        </ScrollView>

        <TextField
          label="Search vaccines"
          value={search}
          onChangeText={setSearch}
          placeholder="e.g. Polio, Covishield, BCG"
          clearButtonMode="while-editing"
        />

        <Row style={{ flexWrap: "wrap" }}>
          <Chip label="All" selected={statusFilter === "all"} onPress={() => setStatusFilter("all")} />
          <Chip label="Taken" selected={statusFilter === "taken"} onPress={() => setStatusFilter("taken")} />
          <Chip label="Not Taken" selected={statusFilter === "not_taken"} onPress={() => setStatusFilter("not_taken")} />
          <Chip label="Unrecorded" selected={statusFilter === "unrecorded"} onPress={() => setStatusFilter("unrecorded")} />
        </Row>

        <Button
          label="Add other vaccine"
          icon="plus"
          variant="secondary"
          onPress={() => setCustomModal(true)}
        />

        {filtered.length === 0 ? (
          <EmptyState
            icon="shield"
            title="No matching vaccines"
            body={search ? `No vaccines found matching "${search}".` : "No vaccines found for the selected filter."}
            action={{
              label: "Reset filters",
              onPress: () => {
                setSelectedCat("all");
                setStatusFilter("all");
                setSearch("");
              },
            }}
          />
        ) : (
          filtered.map((item: PatientVaccination) => {
            const isTaken = item.status === "taken";
            const isNotTaken = item.status === "not_taken";
            const isExpanded = expandedName === item.vaccineName;
            const isSaving = savingName === item.vaccineName;

            return (
              <Card key={item.vaccineName}>
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1 }}>
                    <AppText variant="heading">{item.vaccineName}</AppText>
                    <AppText variant="caption" muted style={{ marginTop: 2 }}>
                      {item.isCustom ? "Custom entry" : item.categoryLabel}
                    </AppText>
                  </View>
                  {isTaken ? (
                    <Badge label="Taken" tone="success" icon="check-circle" />
                  ) : isNotTaken ? (
                    <Badge label="Not Taken" tone="warning" icon="x-circle" />
                  ) : (
                    <Badge label="Unrecorded" tone="neutral" />
                  )}
                </View>

                <AppText variant="small" muted style={{ marginTop: 4 }}>
                  {item.description}
                </AppText>

                {item.administeredDate ? (
                  <AppText variant="caption" style={{ color: colors.success, marginTop: 4 }}>
                    Administered on: {item.administeredDate}
                  </AppText>
                ) : null}

                {item.notes ? (
                  <AppText variant="caption" muted style={{ fontStyle: "italic", marginTop: 2 }}>
                    Notes: {item.notes}
                  </AppText>
                ) : null}

                <Divider />

                <Row style={{ gap: space.sm }}>
                  <Button
                    label="Taken"
                    icon="check"
                    variant={isTaken ? "primary" : "secondary"}
                    loading={isSaving && isTaken}
                    disabled={isSaving}
                    style={{ flex: 1 }}
                    onPress={() => void handleSetStatus(item, "taken")}
                  />
                  <Button
                    label="Not Taken"
                    icon="x"
                    variant={isNotTaken ? "danger" : "secondary"}
                    loading={isSaving && isNotTaken}
                    disabled={isSaving}
                    style={{ flex: 1 }}
                    onPress={() => void handleSetStatus(item, "not_taken")}
                  />
                </Row>

                <Row style={{ justifyContent: "space-between", marginTop: space.sm, alignItems: "center" }}>
                  <TouchableOpacity
                    onPress={() => {
                      if (isExpanded) {
                        setExpandedName(null);
                      } else {
                        setExpandedName(item.vaccineName);
                        setDetailDate(item.administeredDate ?? "");
                        setDetailNotes(item.notes ?? "");
                      }
                    }}
                    style={styles.disclosureBtn}
                    accessibilityRole="button"
                  >
                    <Feather name={isExpanded ? "chevron-up" : "chevron-down"} size={16} color={colors.primary} />
                    <AppText variant="caption" style={{ color: colors.primary, fontWeight: "600" }}>
                      {item.administeredDate || item.notes ? "Edit date/notes" : "+ Add date/notes"}
                    </AppText>
                  </TouchableOpacity>

                  {item.status ? (
                    <TouchableOpacity
                      onPress={() => void handleClear(item)}
                      style={styles.disclosureBtn}
                      accessibilityRole="button"
                    >
                      <Feather name="rotate-ccw" size={14} color={colors.textMuted} />
                      <AppText variant="caption" muted>
                        Clear
                      </AppText>
                    </TouchableOpacity>
                  ) : null}
                </Row>

                {isExpanded ? (
                  <View style={styles.expandedBox}>
                    <TextField
                      label="Administration date (optional)"
                      value={detailDate}
                      onChangeText={setDetailDate}
                      placeholder="YYYY-MM-DD"
                      keyboardType="numbers-and-punctuation"
                    />
                    <TextField
                      label="Notes (optional)"
                      value={detailNotes}
                      onChangeText={setDetailNotes}
                      placeholder="e.g. Dose 1 at local clinic"
                      maxLength={500}
                    />
                    <Row style={{ justifyContent: "flex-end", gap: space.sm }}>
                      <Button
                        label="Cancel"
                        variant="ghost"
                        onPress={() => setExpandedName(null)}
                      />
                      <Button
                        label="Save details"
                        loading={isSaving}
                        onPress={() => {
                          if (!item.status) {
                            Alert.alert("Please mark status", "Mark the vaccine as Taken or Not Taken first.");
                            return;
                          }
                          void handleSetStatus(item, item.status, detailDate.trim() || null, detailNotes.trim() || null);
                          setExpandedName(null);
                        }}
                      />
                    </Row>
                  </View>
                ) : null}
              </Card>
            );
          })
        )}
      </Stack>

      <Modal visible={customModal} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContent}>
            <AppText variant="heading">Add other vaccine</AppText>
            <AppText variant="small" muted style={{ marginTop: 4 }}>
              Record a vaccine not listed in the standard directory.
            </AppText>

            <View style={{ marginTop: space.md, gap: space.sm }}>
              <TextField
                label="Vaccine name *"
                value={customName}
                onChangeText={setCustomName}
                placeholder="e.g. Tetanus Toxoid"
                maxLength={120}
              />

              <AppText variant="label" style={{ marginTop: space.xs }}>
                Have you taken this vaccine?
              </AppText>
              <Row style={{ gap: space.sm }}>
                <Chip
                  label="Yes, Taken"
                  selected={customStatus === "taken"}
                  onPress={() => setCustomStatus("taken")}
                />
                <Chip
                  label="No, Not Taken"
                  selected={customStatus === "not_taken"}
                  onPress={() => setCustomStatus("not_taken")}
                />
              </Row>

              <TextField
                label="Date taken (optional)"
                value={customDate}
                onChangeText={setCustomDate}
                placeholder="YYYY-MM-DD"
                keyboardType="numbers-and-punctuation"
              />

              <TextField
                label="Notes (optional)"
                value={customNotes}
                onChangeText={setCustomNotes}
                placeholder="e.g. Booster dose"
                maxLength={500}
              />
            </View>

            <Row style={{ justifyContent: "flex-end", gap: space.sm, marginTop: space.lg }}>
              <Button
                label="Cancel"
                variant="ghost"
                disabled={savingCustom}
                onPress={() => setCustomModal(false)}
              />
              <Button
                label="Save vaccine"
                loading={savingCustom}
                disabled={!customName.trim()}
                onPress={() => void handleSaveCustom()}
              />
            </Row>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  categoryScroll: {
    paddingVertical: space.xs,
    gap: space.xs,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: space.sm,
  },
  disclosureBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
  },
  expandedBox: {
    marginTop: space.sm,
    paddingTop: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    gap: space.sm,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    padding: space.lg,
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: space.lg,
    maxHeight: "85%",
  },
});
