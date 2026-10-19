import { Feather } from "@expo/vector-icons";
import { useState } from "react";
import { Alert, Linking, Pressable, StyleSheet, Text, View } from "react-native";

import { insuranceApi } from "../api/endpoints";
import { describeError } from "../api/errors";
import type { InsuranceProviderInfo, PatientInsurancePolicy } from "../api/types";
import { useResource } from "../hooks/useResource";
import { AppText, Badge, Banner, Button, Card, Chip, Heading, Row, Screen, Stack, TextField } from "../ui/components";
import { EmptyState, ErrorState, LoadingState } from "../ui/states";
import { colors, radius, space } from "../ui/theme";

export function InsuranceScreen() {
  const [activeTab, setActiveTab] = useState<"policies" | "providers">("policies");
  const [showAddForm, setShowAddForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const policiesRes = useResource((signal) => insuranceApi.policies(signal));
  const providersRes = useResource((signal) => insuranceApi.providers(signal));

  // Form states
  const [providerName, setProviderName] = useState("");
  const [policyNumber, setPolicyNumber] = useState("");
  const [policyHolderName, setPolicyHolderName] = useState("");
  const [sumInsured, setSumInsured] = useState("");
  const [validTill, setValidTill] = useState("");
  const [tpaContact, setTpaContact] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleAddPolicy() {
    if (!providerName.trim() || !policyNumber.trim()) {
      Alert.alert("Missing details", "Insurance Provider and Policy Number are required.");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      await insuranceApi.createPolicy({
        providerName: providerName.trim(),
        policyNumber: policyNumber.trim(),
        policyHolderName: policyHolderName.trim() || undefined,
        sumInsured: sumInsured.trim() || undefined,
        validTill: validTill.trim() || undefined,
        tpaContact: tpaContact.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      setShowAddForm(false);
      setProviderName("");
      setPolicyNumber("");
      setPolicyHolderName("");
      setSumInsured("");
      setValidTill("");
      setTpaContact("");
      setNotes("");
      await policiesRes.reload();
      Alert.alert("Policy Saved", "Your insurance policy was added successfully.");
    } catch (e) {
      const info = describeError(e);
      setFormError(`${info.title}. ${info.detail}`);
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete(p: PatientInsurancePolicy) {
    Alert.alert(
      "Remove Policy?",
      `Are you sure you want to remove the policy for ${p.providerName}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              await insuranceApi.deletePolicy(p.id);
              await policiesRes.reload();
            } catch (e) {
              const info = describeError(e);
              Alert.alert("Error", `${info.title}. ${info.detail}`);
            }
          },
        },
      ]
    );
  }

  const policies = policiesRes.data?.items ?? [];
  const providers = providersRes.data?.items ?? [];

  const filteredProviders = providers.filter((p: InsuranceProviderInfo) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      p.name.toLowerCase().includes(q) ||
      p.code.toLowerCase().includes(q) ||
      p.popularPlans.some((pl) => pl.toLowerCase().includes(q))
    );
  });

  return (
    <Screen refreshing={policiesRes.refreshing || providersRes.refreshing} onRefresh={() => { policiesRes.refresh(); providersRes.refresh(); }}>
      <Stack gap={space.lg}>
        {/* Tab switcher */}
        <Row style={{ gap: space.sm }}>
          <Chip
            label={`My Policies (${policies.length})`}
            selected={activeTab === "policies"}
            onPress={() => setActiveTab("policies")}
          />
          <Chip
            label={`Recognized Insurers (${providers.length})`}
            selected={activeTab === "providers"}
            onPress={() => setActiveTab("providers")}
          />
        </Row>

        {activeTab === "policies" ? (
          <>
            <Banner tone="neutral" title="Personal Record Notice" icon="info">
              Policy records in HealthHub are stored for your emergency convenience and cashless assistance. They do
              not constitute an authoritative guarantee of coverage from the insurer.
            </Banner>

            {formError ? <Banner tone="danger" title={formError} icon="alert-circle" /> : null}

            {!showAddForm ? (
              <Button
                label="Add Insurance Policy"
                variant="primary"
                icon="plus"
                onPress={() => setShowAddForm(true)}
              />
            ) : (
              /* Add Policy Card */
              <Card>
                <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
                  <Heading level={2}>Add Insurance Policy</Heading>
                  <Pressable onPress={() => setShowAddForm(false)}>
                    <Feather name="x" size={20} color={colors.textMuted} />
                  </Pressable>
                </Row>

                <TextField
                  label="Insurance provider *"
                  value={providerName}
                  onChangeText={setProviderName}
                  placeholder="e.g. Star Health or Care Health"
                />

                <TextField
                  label="Policy number *"
                  value={policyNumber}
                  onChangeText={setPolicyNumber}
                  placeholder="e.g. 110022334455"
                  hint="Stored securely and masked in dashboard views"
                />

                <TextField
                  label="Policy holder name"
                  value={policyHolderName}
                  onChangeText={setPolicyHolderName}
                  placeholder="Full name of insured person"
                />

                <TextField
                  label="Sum insured"
                  value={sumInsured}
                  onChangeText={setSumInsured}
                  placeholder="e.g. ₹5,00,000"
                />

                <TextField
                  label="Valid till / Renewal date"
                  value={validTill}
                  onChangeText={setValidTill}
                  placeholder="YYYY-MM-DD"
                />

                <TextField
                  label="TPA / Cashless claim helpline"
                  value={tpaContact}
                  onChangeText={setTpaContact}
                  placeholder="e.g. 1800 425 2255"
                />

                <TextField
                  label="Notes"
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Room rent limit, deductible, etc."
                />

                <Row style={{ gap: space.sm, marginTop: space.sm }}>
                  <Button
                    label="Cancel"
                    variant="secondary"
                    onPress={() => setShowAddForm(false)}
                    style={{ flex: 1 }}
                  />
                  <Button
                    label={saving ? "Saving…" : "Save Policy"}
                    variant="primary"
                    onPress={() => void handleAddPolicy()}
                    loading={saving}
                    style={{ flex: 1 }}
                  />
                </Row>
              </Card>
            )}

            {/* List Policies */}
            {policiesRes.loading ? (
              <LoadingState label="Loading insurance policies…" />
            ) : policiesRes.error && !policiesRes.data ? (
              <ErrorState error={policiesRes.error} onRetry={policiesRes.reload} />
            ) : policies.length === 0 ? (
              <EmptyState
                icon="shield"
                title="No insurance policies saved"
                body="Keep your health insurance coverage, sum insured, and cashless emergency TPA desk contacts handy for hospital admissions."
              />
            ) : (
              policies.map((p) => {
                const isExpired = p.validTill ? new Date(p.validTill) < new Date() : false;
                return (
                  <Card key={p.id}>
                    <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                      <View style={{ flex: 1 }}>
                        <AppText variant="heading">{p.providerName}</AppText>
                        <AppText variant="small" muted style={{ fontFamily: "monospace", marginTop: 2 }}>
                          {p.maskedPolicyNumber}
                        </AppText>
                      </View>
                      <Badge label={isExpired ? "Expired" : "Active"} tone={isExpired ? "danger" : "success"} />
                    </Row>

                    {p.policyHolderName ? (
                      <Row style={styles.detailRow}>
                        <AppText variant="small" muted>
                          Insured Person:
                        </AppText>
                        <AppText variant="small">{p.policyHolderName}</AppText>
                      </Row>
                    ) : null}

                    {p.sumInsured ? (
                      <Row style={styles.detailRow}>
                        <AppText variant="small" muted>
                          Sum Insured:
                        </AppText>
                        <AppText variant="small" style={{ fontWeight: "600", color: colors.success }}>
                          {p.sumInsured}
                        </AppText>
                      </Row>
                    ) : null}

                    {p.validTill ? (
                      <Row style={styles.detailRow}>
                        <AppText variant="small" muted>
                          Renewal Due:
                        </AppText>
                        <AppText variant="small">{p.validTill}</AppText>
                      </Row>
                    ) : null}

                    {p.tpaContact ? (
                      <Row style={styles.detailRow}>
                        <AppText variant="small" muted>
                          Cashless Helpline:
                        </AppText>
                        <Pressable onPress={() => void Linking.openURL(`tel:${p.tpaContact?.replace(/\s+/g, "")}`)}>
                          <AppText variant="small" color={colors.primary} style={{ fontWeight: "600" }}>
                            {p.tpaContact} 📞
                          </AppText>
                        </Pressable>
                      </Row>
                    ) : null}

                    {p.notes ? (
                      <View style={styles.notesBox}>
                        <AppText variant="small" muted>
                          {p.notes}
                        </AppText>
                      </View>
                    ) : null}

                    <Row style={{ justifyContent: "flex-end", marginTop: space.sm }}>
                      <Button
                        label="Remove"
                        variant="danger"
                        icon="trash-2"
                        onPress={() => confirmDelete(p)}
                        style={{ minHeight: 36, paddingVertical: 6, paddingHorizontal: 12 }}
                      />
                    </Row>
                  </Card>
                );
              })
            )}
          </>
        ) : (
          /* Providers Directory */
          <>
            <TextField
              label="Search insurers or plans"
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="e.g. Star, HDFC, Care Advantage"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />

            {providersRes.loading ? (
              <LoadingState label="Loading insurance providers…" />
            ) : providersRes.error && !providersRes.data ? (
              <ErrorState error={providersRes.error} onRetry={providersRes.reload} />
            ) : filteredProviders.length === 0 ? (
              <EmptyState icon="search" title="No providers found" body={`No recognized insurer matches "${searchQuery}".`} />
            ) : (
              filteredProviders.map((prov) => (
                <Card key={prov.id}>
                  <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                    <View style={{ flex: 1 }}>
                      <AppText variant="heading">{prov.name}</AppText>
                      <Badge label={prov.code} tone="info" />
                    </View>
                  </Row>

                  <Row style={styles.detailRow}>
                    <AppText variant="small" muted>
                      Cashless Helpline:
                    </AppText>
                    <Pressable onPress={() => void Linking.openURL(`tel:${prov.cashlessHelpline.replace(/\s+/g, "")}`)}>
                      <AppText variant="small" color={colors.primary} style={{ fontWeight: "600" }}>
                        {prov.cashlessHelpline}
                      </AppText>
                    </Pressable>
                  </Row>

                  <Row style={styles.detailRow}>
                    <AppText variant="small" muted>
                      Support Contact:
                    </AppText>
                    <AppText variant="small">{prov.customerSupportPhone}</AppText>
                  </Row>

                  {prov.popularPlans && prov.popularPlans.length > 0 ? (
                    <View style={{ marginTop: space.xs }}>
                      <AppText variant="small" muted style={{ marginBottom: 4 }}>
                        Recognized Plans:
                      </AppText>
                      <View style={styles.planTags}>
                        {prov.popularPlans.map((pl) => (
                          <View key={pl} style={styles.planTag}>
                            <Text style={styles.planTagText}>{pl}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  ) : null}

                  <Row style={{ justifyContent: "flex-end", marginTop: space.sm }}>
                    <Button
                      label="Visit Website"
                      variant="secondary"
                      icon="external-link"
                      onPress={() => void Linking.openURL(prov.website)}
                      style={{ minHeight: 36, paddingVertical: 6, paddingHorizontal: 12 }}
                    />
                  </Row>
                </Card>
              ))
            )}
          </>
        )}
      </Stack>
    </Screen>
  );
}

const styles = StyleSheet.create({
  detailRow: {
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 6,
  },
  notesBox: {
    marginTop: space.xs,
    padding: space.xs,
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  planTags: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
  },
  planTag: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.sm,
  },
  planTagText: {
    fontSize: 12,
    color: colors.text,
  },
});
