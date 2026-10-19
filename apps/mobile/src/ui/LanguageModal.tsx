import React from "react";
import { Modal, StyleSheet, TouchableOpacity, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useLanguage } from "../i18n/LanguageContext";
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from "../i18n/languages";
import { AppText, Row, Stack } from "./components";
import { colors, radius, space } from "./theme";

export function LanguageModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { language, setLanguage, t } = useLanguage();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.content}>
          <Row style={styles.header}>
            <View style={{ flex: 1 }}>
              <AppText variant="heading">{t("bhashini_language", "Regional Language")}</AppText>
              <AppText variant="caption" muted>Govt of India Bhashini Mission</AppText>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} accessibilityLabel="Close language selector">
              <Feather name="x" size={20} color={colors.text} />
            </TouchableOpacity>
          </Row>

          <Stack gap={space.xs} style={{ marginTop: space.sm }}>
            {SUPPORTED_LANGUAGES.map((item) => {
              const isSelected = item.code === language;
              return (
                <TouchableOpacity
                  key={item.code}
                  onPress={() => {
                    setLanguage(item.code as SupportedLanguage);
                    onClose();
                  }}
                  style={[styles.langItem, isSelected && styles.selectedLangItem]}
                >
                  <View>
                    <AppText variant="body" style={{ fontWeight: isSelected ? "700" : "500", color: isSelected ? colors.primary : colors.text }}>
                      {item.nativeName}
                    </AppText>
                    <AppText variant="caption" muted>{item.name}</AppText>
                  </View>
                  {isSelected ? <Feather name="check" size={18} color={colors.primary} /> : null}
                </TouchableOpacity>
              );
            })}
          </Stack>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.4)",
    justifyContent: "flex-end",
  },
  content: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: space.lg,
    paddingBottom: space.xl,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  header: {
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  closeBtn: {
    padding: space.xs,
  },
  langItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
  },
  selectedLangItem: {
    backgroundColor: "rgba(2, 132, 199, 0.1)",
  },
});
