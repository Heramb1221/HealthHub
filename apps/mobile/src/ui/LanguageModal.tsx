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
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <View style={styles.overlay}>
        <View style={styles.content}>
          <Row style={styles.header}>
            <View style={{ flex: 1 }}>
              <AppText variant="heading" accessibilityRole="header">
                {t("bhashini_language", "Regional Language")}
              </AppText>
              <AppText variant="caption" muted>
                {t("Govt of India Bhashini Mission", "Govt of India Bhashini Mission")}
              </AppText>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeBtn}
              accessibilityRole="button"
              accessibilityLabel={t("close", "Close")}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
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
                  accessibilityRole="button"
                  accessibilityLabel={`${item.nativeName}, ${item.name}`}
                  accessibilityState={{ selected: isSelected }}
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
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  langItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 48,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
  },
  selectedLangItem: {
    backgroundColor: "rgba(2, 132, 199, 0.1)",
  },
});
