import { Feather } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { Alert, Modal, ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";

import { familyApi } from "../api/endpoints";
import { describeError } from "../api/errors";
import type {
  CreateFamilyMemberBody,
  FamilyMember,
  FamilyRelationship,
  Generation,
  UpdateFamilyMemberBody,
  VitalStatus,
} from "../api/types";
import { useResource } from "../hooks/useResource";
import { AppText, Badge, Banner, Button, Card, Chip, Divider, Heading, Row, Screen, Stack, TextField } from "../ui/components";
import { EmptyState, ErrorState, LoadingState } from "../ui/states";
import { colors, radius, space } from "../ui/theme";

const RELATIONSHIPS: { value: FamilyRelationship; label: string; generation: Generation }[] = [
  { value: "father", label: "Father", generation: "parents" },
  { value: "mother", label: "Mother", generation: "parents" },
  { value: "spouse", label: "Spouse", generation: "current" },
  { value: "brother", label: "Brother", generation: "current" },
  { value: "sister", label: "Sister", generation: "current" },
  { value: "son", label: "Son", generation: "children" },
  { value: "daughter", label: "Daughter", generation: "children" },
  { value: "paternal_grandfather", label: "Paternal Grandfather", generation: "grandparents" },
  { value: "paternal_grandmother", label: "Paternal Grandmother", generation: "grandparents" },
  { value: "maternal_grandfather", label: "Maternal Grandfather", generation: "grandparents" },
  { value: "maternal_grandmother", label: "Maternal Grandmother", generation: "grandparents" },
  { value: "other", label: "Other Relative", generation: "other" },
];

const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const;

const COMMON_CONDITIONS = [
  "Type 2 Diabetes",
  "Hypertension",
  "Coronary Artery Disease",
  "High Cholesterol",
  "Asthma",
  "Hypothyroidism",
  "Stroke",
  "Cancer",
];

const GENERATION_METADATA: Record<Generation, { title: string; subtitle: string }> = {
  grandparents: {
    title: "Grandparents (1st Generation)",
    subtitle: "Paternal & maternal elders",
  },
  parents: {
    title: "Parents (2nd Generation)",
    subtitle: "Father, mother, and immediate lineage",
  },
  current: {
    title: "Current Generation",
    subtitle: "Spouse, brothers, and sisters",
  },
  children: {
    title: "Children (Next Generation)",
    subtitle: "Sons and daughters",
  },
  other: {
    title: "Extended Relatives",
    subtitle: "Other family members",
  },
};

export function FamilyTreeScreen() {
  const res = useResource((signal) => familyApi.list(signal));
  const [modalOpen, setModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<FamilyMember | null>(null);

  // Form states
  const [formName, setFormName] = useState("");
  const [formRel, setFormRel] = useState<FamilyRelationship>("father");
  const [formVital, setFormVital] = useState<VitalStatus>("alive");
  const [formAge, setFormAge] = useState("");
  const [formBlood, setFormBlood] = useState("");
  const [formConditions, setFormConditions] = useState<string[]>([]);
  const [newCondInput, setNewCondInput] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const data = res.data;
  const totalCount = data?.totalMembers ?? 0;
  const hereditaryRisks = useMemo(() => data?.hereditaryRisks ?? [], [data?.hereditaryRisks]);
  const generations = data?.generations;

  function openCreateModal() {
    setEditingMember(null);
    setFormName("");
    setFormRel("father");
    setFormVital("alive");
    setFormAge("");
    setFormBlood("");
    setFormConditions([]);
    setNewCondInput("");
    setFormNotes("");
    setModalOpen(true);
  }

  function openEditModal(m: FamilyMember) {
    setEditingMember(m);
    setFormName(m.fullName);
    setFormRel(m.relationship);
    setFormVital(m.vitalStatus);
    setFormAge(m.age !== null ? String(m.age) : "");
    setFormBlood(m.bloodGroup ?? "");
    setFormConditions([...m.conditions]);
    setNewCondInput("");
    setFormNotes(m.notes ?? "");
    setModalOpen(true);
  }

  function handleAddCondition(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (!formConditions.some((c) => c.toLowerCase() === trimmed.toLowerCase())) {
      setFormConditions([...formConditions, trimmed]);
    }
    setNewCondInput("");
  }

  function handleRemoveCondition(index: number) {
    setFormConditions(formConditions.filter((_, i) => i !== index));
  }

  async function handleSave() {
    if (!formName.trim()) {
      Alert.alert("Missing name", "Please enter the family member's full name.");
      return;
    }
    const parsedAge = formAge.trim() ? parseInt(formAge.trim(), 10) : null;
    if (parsedAge !== null && (isNaN(parsedAge) || parsedAge < 0 || parsedAge > 130)) {
      Alert.alert("Invalid age", "Please enter an age between 0 and 130.");
      return;
    }

    setSaving(true);
    try {
      if (editingMember) {
        const body: UpdateFamilyMemberBody = {
          fullName: formName.trim(),
          relationship: formRel,
          vitalStatus: formVital,
          age: parsedAge,
          bloodGroup: formBlood || null,
          conditions: formConditions,
          notes: formNotes.trim() || null,
        };
        await familyApi.update(editingMember.id, body);
      } else {
        const body: CreateFamilyMemberBody = {
          fullName: formName.trim(),
          relationship: formRel,
          vitalStatus: formVital,
          age: parsedAge,
          bloodGroup: formBlood || null,
          conditions: formConditions,
          notes: formNotes.trim() || null,
        };
        await familyApi.create(body);
      }
      setModalOpen(false);
      res.reload();
    } catch (err) {
      const { title, detail } = describeError(err);
      Alert.alert(title, detail);
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete(member: FamilyMember) {
    Alert.alert(
      "Remove family member",
      `Are you sure you want to remove ${member.fullName} (${member.relationshipLabel}) from your family tree?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            setDeletingId(member.id);
            try {
              await familyApi.remove(member.id);
              res.reload();
            } catch (err) {
              const { title, detail } = describeError(err);
              Alert.alert(title, detail);
            } finally {
              setDeletingId(null);
            }
          },
        },
      ]
    );
  }

  if (res.loading && !res.data) {
    return <LoadingState label="Loading family tree…" />;
  }

  if (res.error && !res.data) {
    return <ErrorState error={res.error} onRetry={res.reload} />;
  }

  const generationsOrder: Generation[] = ["grandparents", "parents", "current", "children", "other"];

  return (
    <Screen refreshing={res.loading} onRefresh={res.reload}>
      <Stack gap={space.lg}>
        <Row style={styles.headerRow}>
          <View style={styles.flex}>
            <Heading level={1}>Family Health Tree</Heading>
            <AppText variant="caption" muted style={{ marginTop: 2 }}>
              Patient-reported hereditary health tracking
            </AppText>
          </View>
          <Button label="Add member" icon="plus" onPress={openCreateModal} />
        </Row>

        <Banner tone="info" title="Hereditary history notice" icon="shield">
          Recording family health patterns helps clinicians spot potential genetic predispositions. It does not provide access to your account for any relative.
        </Banner>

        {/* Hereditary risk aggregates */}
        {hereditaryRisks.length > 0 ? (
          <Card style={styles.riskCard}>
            <Row style={styles.riskHeader}>
              <Feather name="activity" size={16} color={colors.primary} />
              <AppText variant="label" style={{ color: colors.primary, fontWeight: "600" }}>
                Identified Hereditary Patterns ({hereditaryRisks.length})
              </AppText>
            </Row>
            <AppText variant="caption" muted style={{ marginTop: 4, marginBottom: space.sm }}>
              Conditions recorded across multiple relatives:
            </AppText>

            <Stack gap={space.xs}>
              {hereditaryRisks.map((risk) => (
                <View key={risk.condition} style={styles.riskItem}>
                  <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
                    <AppText variant="body" style={{ fontWeight: "600" }}>
                      {risk.condition}
                    </AppText>
                    <Badge
                      label={`${risk.count} ${risk.count === 1 ? "relative" : "relatives"}`}
                      tone={risk.count > 1 ? "warning" : "neutral"}
                    />
                  </Row>
                  <AppText variant="caption" muted style={{ marginTop: 2 }}>
                    {risk.members.map((m) => `${m.relationLabel} (${m.name})`).join(", ")}
                  </AppText>
                </View>
              ))}
            </Stack>
          </Card>
        ) : null}

        {/* Generations or Empty State */}
        {totalCount === 0 ? (
          <EmptyState
            icon="users"
            title="No family members recorded"
            body="Add your parents, grandparents, or siblings to keep track of familial health conditions and hereditary risk factors."
            action={{ label: "Add family member", onPress: openCreateModal }}
          />
        ) : (
          generationsOrder.map((genKey) => {
            const list = generations?.[genKey] ?? [];
            if (list.length === 0) return null;
            const meta = GENERATION_METADATA[genKey];

            return (
              <Stack key={genKey} gap={space.sm}>
                <View style={styles.generationHeader}>
                  <AppText variant="heading" style={{ fontSize: 16 }}>
                    {meta.title}
                  </AppText>
                  <AppText variant="caption" muted>
                    {meta.subtitle} • {list.length} {list.length === 1 ? "person" : "people"}
                  </AppText>
                </View>

                {list.map((member) => (
                  <Card key={member.id} style={styles.memberCard}>
                    <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                      <View style={styles.flex}>
                        <Row style={{ alignItems: "center", gap: space.xs }}>
                          <Feather name="user" size={15} color={colors.primary} />
                          <AppText variant="heading" style={{ fontSize: 15 }}>
                            {member.fullName}
                          </AppText>
                        </Row>
                        <AppText variant="caption" muted style={{ marginTop: 2 }}>
                          {member.relationshipLabel}
                        </AppText>
                      </View>

                      <Badge
                        label={member.vitalStatus}
                        tone={
                          member.vitalStatus === "alive"
                            ? "success"
                            : member.vitalStatus === "deceased"
                              ? "neutral"
                              : "info"
                        }
                      />
                    </Row>

                    <Row style={styles.statsRow}>
                      {member.age !== null ? (
                        <View style={styles.pill}>
                          <AppText variant="caption">
                            {member.vitalStatus === "deceased" ? `Died at ${member.age} yrs` : `${member.age} yrs old`}
                          </AppText>
                        </View>
                      ) : null}
                      {member.bloodGroup ? (
                        <View style={styles.pill}>
                          <AppText variant="caption">Blood {member.bloodGroup}</AppText>
                        </View>
                      ) : null}
                    </Row>

                    {member.conditions.length > 0 ? (
                      <View style={{ marginTop: space.sm }}>
                        <AppText variant="caption" muted style={{ marginBottom: 4, fontWeight: "600" }}>
                          Known conditions:
                        </AppText>
                        <Row style={{ flexWrap: "wrap", gap: space.xs }}>
                          {member.conditions.map((cond, cIdx) => (
                            <Badge key={cIdx} label={cond} tone="warning" />
                          ))}
                        </Row>
                      </View>
                    ) : (
                      <AppText variant="caption" muted style={{ fontStyle: "italic", marginTop: space.xs }}>
                        No chronic conditions listed
                      </AppText>
                    )}

                    {member.notes ? (
                      <View style={styles.notesBox}>
                        <AppText variant="caption" muted>
                          Notes: {member.notes}
                        </AppText>
                      </View>
                    ) : null}

                    <Divider />

                    <Row style={{ justifyContent: "flex-end", gap: space.sm, marginTop: space.xs }}>
                      <Button
                        label="Edit"
                        variant="secondary"
                        icon="edit-2"
                        onPress={() => openEditModal(member)}
                      />
                      <Button
                        label={deletingId === member.id ? "Removing…" : "Remove"}
                        variant="secondary"
                        icon="trash-2"
                        onPress={() => confirmDelete(member)}
                        disabled={deletingId === member.id}
                      />
                    </Row>
                  </Card>
                ))}
              </Stack>
            );
          })
        )}
      </Stack>

      {/* Add / Edit Family Member Modal */}
      <Modal visible={modalOpen} animationType="slide" transparent onRequestClose={() => setModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Row style={styles.modalHeader}>
              <Heading level={2}>
                {editingMember ? `Edit ${editingMember.fullName}` : "Add family member"}
              </Heading>
              <TouchableOpacity
                onPress={() => setModalOpen(false)}
                accessibilityLabel="Close modal"
                accessibilityRole="button"
                style={styles.closeBtn}
              >
                <Feather name="x" size={20} color={colors.text} />
              </TouchableOpacity>
            </Row>

            <ScrollView contentContainerStyle={styles.modalScroll} keyboardShouldPersistTaps="handled">
              <Stack gap={space.md}>
                <TextField
                  label="Full Name *"
                  placeholder="e.g. Ramesh Sharma"
                  value={formName}
                  onChangeText={setFormName}
                />

                <View>
                  <AppText variant="label" style={{ marginBottom: space.xs }}>
                    Relationship *
                  </AppText>
                  <Row style={{ flexWrap: "wrap", gap: space.xs }}>
                    {RELATIONSHIPS.map((r) => (
                      <Chip
                        key={r.value}
                        label={r.label}
                        selected={formRel === r.value}
                        onPress={() => setFormRel(r.value)}
                      />
                    ))}
                  </Row>
                </View>

                <View>
                  <AppText variant="label" style={{ marginBottom: space.xs }}>
                    Vital Status
                  </AppText>
                  <Row style={{ gap: space.xs }}>
                    {(["alive", "deceased", "unknown"] as VitalStatus[]).map((st) => (
                      <Chip
                        key={st}
                        label={st.charAt(0).toUpperCase() + st.slice(1)}
                        selected={formVital === st}
                        onPress={() => setFormVital(st)}
                      />
                    ))}
                  </Row>
                </View>

                <Row style={{ gap: space.md }}>
                  <View style={styles.flex}>
                    <TextField
                      label={formVital === "deceased" ? "Age at death (yrs)" : "Current age (yrs)"}
                      placeholder="e.g. 58"
                      value={formAge}
                      onChangeText={setFormAge}
                      keyboardType="numeric"
                    />
                  </View>
                </Row>

                <View>
                  <AppText variant="label" style={{ marginBottom: space.xs }}>
                    Blood Group
                  </AppText>
                  <Row style={{ flexWrap: "wrap", gap: space.xs }}>
                    <Chip label="Unknown" selected={formBlood === ""} onPress={() => setFormBlood("")} />
                    {BLOOD_GROUPS.map((bg) => (
                      <Chip
                        key={bg}
                        label={bg}
                        selected={formBlood === bg}
                        onPress={() => setFormBlood(bg)}
                      />
                    ))}
                  </Row>
                </View>

                <View>
                  <AppText variant="label" style={{ marginBottom: 4 }}>
                    Known Medical Conditions
                  </AppText>
                  <AppText variant="caption" muted style={{ marginBottom: space.xs }}>
                    Add diseases present in this relative
                  </AppText>

                  <Row style={{ gap: space.xs, marginBottom: space.xs }}>
                    <View style={styles.flex}>
                      <TextField
                        label=""
                        placeholder="Add custom condition"
                        value={newCondInput}
                        onChangeText={setNewCondInput}
                      />
                    </View>
                    <Button
                      label="Add"
                      variant="secondary"
                      onPress={() => handleAddCondition(newCondInput)}
                      disabled={!newCondInput.trim()}
                    />
                  </Row>

                  {/* Common condition suggestions */}
                  <Row style={{ flexWrap: "wrap", gap: space.xs, marginBottom: space.xs }}>
                    {COMMON_CONDITIONS.filter(
                      (c) => !formConditions.some((fc) => fc.toLowerCase() === c.toLowerCase())
                    ).map((quick) => (
                      <Chip
                        key={quick}
                        label={`+ ${quick}`}
                        selected={false}
                        onPress={() => handleAddCondition(quick)}
                      />
                    ))}
                  </Row>

                  {/* Selected conditions list */}
                  {formConditions.length > 0 ? (
                    <View style={styles.conditionsSelectedBox}>
                      <Row style={{ flexWrap: "wrap", gap: space.xs }}>
                        {formConditions.map((c, i) => (
                          <TouchableOpacity
                            key={i}
                            style={styles.removableBadge}
                            onPress={() => handleRemoveCondition(i)}
                            accessibilityLabel={`Remove ${c}`}
                            accessibilityRole="button"
                          >
                            <AppText variant="caption" style={{ fontWeight: "500" }}>
                              {c}
                            </AppText>
                            <Feather name="x" size={12} color={colors.text} style={{ marginLeft: 4 }} />
                          </TouchableOpacity>
                        ))}
                      </Row>
                    </View>
                  ) : null}
                </View>

                <TextField
                  label="Clinical Notes / Medical History"
                  placeholder="e.g. Age of onset, medications, cause of death"
                  value={formNotes}
                  onChangeText={setFormNotes}
                  multiline
                  numberOfLines={3}
                />

                <Row style={{ justifyContent: "flex-end", gap: space.sm, marginTop: space.sm }}>
                  <Button label="Cancel" variant="secondary" onPress={() => setModalOpen(false)} />
                  <Button
                    label={saving ? "Saving…" : editingMember ? "Save changes" : "Add member"}
                    onPress={handleSave}
                    disabled={saving}
                  />
                </Row>
              </Stack>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  headerRow: {
    justifyContent: "space-between",
    alignItems: "center",
  },
  riskCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    padding: space.md,
  },
  riskHeader: {
    alignItems: "center",
    gap: space.xs,
  },
  riskItem: {
    backgroundColor: colors.background,
    padding: space.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  generationHeader: {
    paddingVertical: space.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginBottom: space.xs,
  },
  memberCard: {
    padding: space.md,
    gap: space.xs,
  },
  statsRow: {
    flexWrap: "wrap",
    gap: space.xs,
    marginTop: space.xs,
  },
  pill: {
    backgroundColor: colors.background,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  notesBox: {
    backgroundColor: colors.background,
    padding: space.xs,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: space.xs,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContainer: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: "90%",
    padding: space.lg,
  },
  modalHeader: {
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: space.md,
  },
  closeBtn: {
    padding: space.xs,
  },
  modalScroll: {
    paddingBottom: space.xl,
  },
  conditionsSelectedBox: {
    backgroundColor: colors.background,
    padding: space.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  removableBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    paddingHorizontal: space.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
