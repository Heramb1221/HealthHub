import { useState } from "react";
import { Image, Platform, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { Feather } from "@expo/vector-icons";
import QRCode from "react-native-qrcode-svg";

export interface DigitalCardData {
  healthId: string;
  fullName: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  bloodGroup: string | null;
  phone: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  issuedAt?: string | null;
  isDemo?: boolean;
}

function formatNumericDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T00:00:00`) : new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
}

function formatGenderBilingual(gender: string | null | undefined): string {
  if (!gender) return "—";
  const g = gender.toLowerCase();
  if (g === "male") return "MALE / पुरुष";
  if (g === "female") return "FEMALE / महिला";
  if (g === "other") return "OTHER / अन्य";
  return gender.toUpperCase();
}

function LinearBarcode({ code }: { code: string }) {
  const bars = Array.from({ length: 36 });
  return (
    <View style={styles.barcodeContainer}>
      <View style={styles.barcodeLines}>
        {bars.map((_, i) => {
          const isThick = (i * 7 + 3) % 4 === 0;
          const isMedium = (i * 3 + 1) % 3 === 0;
          const isShort = (i * 5) % 7 === 0;
          return (
            <View
              key={i}
              style={[
                styles.barcodeBar,
                {
                  width: isThick ? 2 : isMedium ? 1.4 : 0.8,
                  height: isShort ? 10 : 14,
                  backgroundColor: "#0f172a",
                },
              ]}
            />
          );
        })}
      </View>
      <Text style={styles.barcodeText}>{code}</Text>
    </View>
  );
}

function HologramSeal() {
  return (
    <View style={styles.hologram}>
      <Feather name="shield" size={10} color="#78350f" />
      <Text style={styles.hologramText}>SECURE</Text>
    </View>
  );
}

export function CardFront({ card, style }: { card: DigitalCardData; style?: StyleProp<ViewStyle> }) {
  const initials = (card.fullName || "SM")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <View style={[styles.cardWrapper, style]}>

      <View style={styles.headerRow}>
        <View style={styles.brandGroup}>
          <Image
            source={require("../../assets/icon.png")}
            style={styles.logoImage}
            resizeMode="contain"
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              SEHAT MED DIGITAL HEALTH CARD
            </Text>
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              सेहत मेड डिजिटल कार्ड · Bharat ka apna Sathi
            </Text>
          </View>
        </View>
        <View style={styles.smartIdBadge}>
          <Text style={styles.smartIdText}>SMART HEALTH ID</Text>
        </View>
      </View>

      <View style={styles.tricolorBar}>
        <View style={[styles.tricolorSegment, { backgroundColor: "#ff9933" }]} />
        <View style={[styles.tricolorSegment, { backgroundColor: "#e2e8f0" }]} />
        <View style={[styles.tricolorSegment, { backgroundColor: "#138808" }]} />
      </View>

      <View style={styles.bodyGrid}>

        <View style={styles.leftCol}>
          <HologramSeal />
          <View style={styles.photoFrame}>
            <View style={styles.photoPlaceholder}>
              <View style={styles.initialsCircle}>
                <Text style={styles.initialsText}>{initials}</Text>
              </View>
              <Text style={styles.photoLabel}>PHOTO / फोटो</Text>
            </View>
            <View style={styles.verifiedStrip}>
              <Text style={styles.verifiedText}>VERIFIED</Text>
            </View>
          </View>
        </View>

        <View style={styles.rightCol}>

          <View style={styles.healthIdBadge}>
            <Text style={styles.fieldMicro}>स्वास्थ्य पहचान संख्या / HEALTH ID NO.</Text>
            <Text style={styles.healthIdText} numberOfLines={1} selectable>
              {card.healthId || "HH-0000-0000"}
            </Text>
          </View>

          <View>
            <Text style={styles.fieldMicro}>नाम / NAME</Text>
            <Text style={styles.nameText} numberOfLines={1}>
              {card.fullName || "CARDHOLDER NAME"}
            </Text>
          </View>

          <View style={styles.twoColRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldMicro}>जन्म तिथि / D.O.B</Text>
              <Text style={styles.valueTextMono}>{formatNumericDate(card.dateOfBirth)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldMicro}>लिंग / GENDER</Text>
              <Text style={styles.valueText} numberOfLines={1}>
                {formatGenderBilingual(card.gender)}
              </Text>
            </View>
          </View>

          <View style={styles.twoColRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldMicro}>रक्त समूह / BLOOD</Text>
              <View style={styles.bloodBadge}>
                <Feather name="activity" size={9} color="#fff" style={{ marginRight: 3 }} />
                <Text style={styles.bloodText}>{card.bloodGroup || "O+"}</Text>
              </View>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldMicro}>दूरभाष / MOBILE</Text>
              <Text style={styles.valueTextMono} numberOfLines={1}>{card.phone || "—"}</Text>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.footerRow}>
        <View>
          <Text style={styles.footerMicro}>
            जारी / ISSUED: {formatNumericDate(card.issuedAt || new Date().toISOString())}
          </Text>
          <Text style={[styles.footerMicro, { color: card.isDemo ? "#7c3aed" : "#64748b", fontWeight: "700" }]}>
            {card.isDemo ? "DEMO DIGITAL CARD" : "SEHAT MED HEALTH NETWORK"}
          </Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
            <Feather name="check-circle" size={9} color="#059669" />
            <Text style={styles.digitallyVerified}>Digitally Verified</Text>
          </View>
          <Text style={styles.signatureLabel}>प्राधिकृत हस्ताक्षर / AUTHORIZED SIGNATURE</Text>
        </View>
      </View>
    </View>
  );
}

export function CardBack({ card, style }: { card: DigitalCardData; style?: StyleProp<ViewStyle> }) {
  const qrUrl = `https://sehatmed.in/qr/${card.healthId}`;

  return (
    <View style={[styles.cardWrapper, style]}>

      <View style={styles.magStripe}>
        <Text style={styles.magText}>SEHAT MED DIGITAL HEALTH CARD</Text>
        <Text style={styles.magText}>ISO/IEC 7810 CR80</Text>
      </View>

      <View style={styles.backBody}>

        <View style={styles.backQrCol}>
          <View style={styles.qrBox}>
            <QRCode value={qrUrl} size={66} />
          </View>
          <Text style={styles.qrTitle}>आपातकालीन स्कैन</Text>
          <Text style={styles.qrSub}>SCAN FOR EMERGENCY</Text>
        </View>

        <View style={styles.backInfoCol}>

          <View style={styles.emergencyBox}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
              <Feather name="alert-circle" size={9} color="#be123c" />
              <Text style={styles.emergencyTitle}>आपातकालीन संपर्क / EMERGENCY CONTACT</Text>
            </View>
            <Text style={styles.emergencyName} numberOfLines={1}>
              {card.emergencyContactName || "Nominated Kin / Guardian"}
            </Text>
            <Text style={styles.emergencyPhone}>
              {card.emergencyContactPhone || "+91 112 (National Emergency)"}
            </Text>
          </View>

          <View style={styles.helplineGrid}>
            <View style={styles.helplineItem}>
              <Text style={styles.helplineLabel}>AMBULANCE</Text>
              <Text style={[styles.helplineNum, { color: "#be123c" }]}>108</Text>
            </View>
            <View style={styles.helplineItem}>
              <Text style={styles.helplineLabel}>EMERGENCY</Text>
              <Text style={styles.helplineNum}>112</Text>
            </View>
            <View style={styles.helplineItem}>
              <Text style={styles.helplineLabel}>HEALTH LINE</Text>
              <Text style={[styles.helplineNum, { color: "#0e3a6c" }]}>1075</Text>
            </View>
          </View>

          <Text style={styles.backNotice}>
            • Hospital Access: Instant scan provides authenticated triage data.{"\n"}
            • If found: Return to any Hospital/PHC or contact help@sehatmed.in.
          </Text>
        </View>
      </View>

      <View style={styles.backFooter}>
        <View>
          <Text style={[styles.footerMicro, { fontWeight: "800", color: "#334155" }]}>
            Sehat Med Health Network
          </Text>
          <Text style={styles.footerMicro}>www.sehatmed.in · Toll-Free: 1800-11-4477</Text>
        </View>
        <LinearBarcode code={card.healthId || "HH-CARD-2026"} />
      </View>
    </View>
  );
}

export function InteractiveFlipCard({ card }: { card: DigitalCardData }) {
  const [isFlipped, setIsFlipped] = useState(false);

  return (
    <View style={styles.interactiveContainer}>
      <Pressable
        onPress={() => setIsFlipped((prev) => !prev)}
        style={styles.cardPressable}
        accessibilityRole="button"
        accessibilityLabel="Flip health card"
      >
        {isFlipped ? <CardBack card={card} /> : <CardFront card={card} />}
      </Pressable>

      <Pressable
        onPress={() => setIsFlipped((prev) => !prev)}
        style={styles.flipButton}
        accessibilityRole="button"
      >
        <Feather name="refresh-cw" size={13} color="#0e3a6c" />
        <Text style={styles.flipButtonText}>
          {isFlipped ? "Showing Back · Tap to Flip Front" : "Showing Front · Tap to Flip Back"}
        </Text>
      </Pressable>
    </View>
  );
}

export function PrintableCardSheet({
  card,
  isPrintOnly,
}: {
  card: DigitalCardData;
  isPrintOnly?: boolean;
}) {
  return (
    <View style={styles.printSheetContainer} nativeID={isPrintOnly ? "sehat-med-print-sheet" : undefined}>

      {!isPrintOnly && (
        <View style={styles.guideBox}>
          <Text style={styles.guideTitle}>🖨️ Wallet Card Print & Cut Guide:</Text>
          <Text style={styles.guideStep}>
            1. Click <Text style={{ fontWeight: "700" }}>Print / Save PDF</Text> to print on standard A4 or card paper at 100% scale.
          </Text>
          <Text style={styles.guideStep}>
            2. In the print dialog, choose your printer or select <Text style={{ fontWeight: "700" }}>Save as PDF</Text>.
          </Text>
          <Text style={styles.guideStep}>
            3. Cut along the dashed lines (✂) and fold down the center for a standard 85.6mm × 54mm wallet size!
          </Text>
        </View>
      )}

      <View style={[styles.cutBorderBox, isPrintOnly && styles.cutBorderBoxPrint]}>

        <View style={styles.cutHeaderRow}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
            <Feather name="scissors" size={13} color="#475569" />
            <Text style={styles.cutHeaderText}>✂ CUT ALONG DOTTED LINE</Text>
          </View>
          <Text style={styles.cutHeaderText}>CR80 WALLET SIZE (85.6 mm × 54.0 mm)</Text>
        </View>

        <View style={styles.sheetCardsRow}>

          <View style={styles.sheetCardColumn}>
            {!isPrintOnly && (
              <Text style={styles.cardFaceLabel}>FRONT FACE / सम्मुख भाग</Text>
            )}
            <CardFront card={card} style={styles.printableCard} />
          </View>

          <View style={styles.foldDividerVertical}>
            <View style={styles.foldDashLine} />
            <View style={styles.foldBadge}>
              <Text style={styles.foldTextVertical}>✂ FOLD HERE ✂</Text>
            </View>
            <View style={styles.foldDashLine} />
          </View>

          <View style={styles.sheetCardColumn}>
            {!isPrintOnly && (
              <Text style={styles.cardFaceLabel}>BACK FACE / पृष्ठ भाग</Text>
            )}
            <CardBack card={card} style={styles.printableCard} />
          </View>
        </View>

        <View style={styles.cutFooterRow}>
          <Text style={styles.cutFooterText}>✂ CUT & LAMINATE IN STANDARD PVC POUCH</Text>
          <Text style={styles.cutFooterText}>SCALE: 100%</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  interactiveContainer: {
    width: "100%",
    alignItems: "center",
  },
  cardPressable: {
    width: "100%",
    maxWidth: 440,
    alignItems: "center",
  },
  flipButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
    backgroundColor: "#e0f2fe",
    borderWidth: 1,
    borderColor: "#bae6fd",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  flipButtonText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#0369a1",
  },
  cardWrapper: {
    width: "100%",
    maxWidth: 440,
    aspectRatio: 85.6 / 54,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#f8fafc",
    padding: 10,
    justifyContent: "space-between",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    paddingBottom: 4,
  },
  brandGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  logoImage: {
    width: 22,
    height: 22,
    borderRadius: 4,
  },
  headerTitle: {
    fontSize: 9.5,
    fontWeight: "900",
    color: "#0e3a6c",
    letterSpacing: 0.5,
  },
  headerSubtitle: {
    fontSize: 7.5,
    fontWeight: "600",
    color: "#64748b",
  },
  smartIdBadge: {
    backgroundColor: "#0e3a6c",
    borderRadius: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  smartIdText: {
    color: "#fff",
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  tricolorBar: {
    flexDirection: "row",
    height: 2.5,
    width: "100%",
    marginVertical: 4,
    borderRadius: 2,
    overflow: "hidden",
  },
  tricolorSegment: {
    flex: 1,
  },
  bodyGrid: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    flex: 1,
  },
  leftCol: {
    width: 76,
    alignItems: "center",
    gap: 4,
  },
  hologram: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#fef3c7",
    borderWidth: 1,
    borderColor: "#f59e0b",
    alignItems: "center",
    justifyContent: "center",
  },
  hologramText: {
    fontSize: 5,
    fontWeight: "900",
    color: "#92400e",
  },
  photoFrame: {
    width: 62,
    height: 72,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#94a3b8",
    backgroundColor: "#fff",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "space-between",
  },
  photoPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  initialsCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#e2e8f0",
    alignItems: "center",
    justifyContent: "center",
  },
  initialsText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#334155",
  },
  photoLabel: {
    fontSize: 6,
    fontWeight: "700",
    color: "#94a3b8",
    marginTop: 2,
  },
  verifiedStrip: {
    width: "100%",
    backgroundColor: "#0e3a6c",
    paddingVertical: 1,
    alignItems: "center",
  },
  verifiedText: {
    color: "#fff",
    fontSize: 6,
    fontWeight: "900",
  },
  rightCol: {
    flex: 1,
    gap: 3,
  },
  healthIdBadge: {
    borderWidth: 1,
    borderColor: "#0e3a6c33",
    backgroundColor: "#0e3a6c0d",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
  },
  healthIdText: {
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
    fontSize: 11.5,
    fontWeight: "900",
    color: "#0e3a6c",
    letterSpacing: 1.2,
  },
  fieldMicro: {
    fontSize: 6.5,
    fontWeight: "700",
    color: "#64748b",
  },
  nameText: {
    fontSize: 11,
    fontWeight: "900",
    color: "#0f172a",
    textTransform: "uppercase",
  },
  twoColRow: {
    flexDirection: "row",
    gap: 6,
  },
  valueTextMono: {
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
    fontSize: 9,
    fontWeight: "700",
    color: "#1e293b",
  },
  valueText: {
    fontSize: 8.5,
    fontWeight: "700",
    color: "#1e293b",
  },
  bloodBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#be123c",
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 3,
    alignSelf: "flex-start",
  },
  bloodText: {
    color: "#fff",
    fontSize: 8.5,
    fontWeight: "900",
  },
  footerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    paddingTop: 3,
  },
  footerMicro: {
    fontSize: 6.5,
    color: "#64748b",
  },
  digitallyVerified: {
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
    fontSize: 7.5,
    fontWeight: "800",
    color: "#065f46",
  },
  signatureLabel: {
    fontSize: 5.5,
    fontWeight: "600",
    color: "#94a3b8",
  },
  magStripe: {
    height: 22,
    backgroundColor: "#181d24",
    marginHorizontal: -10,
    marginTop: -10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 10,
  },
  magText: {
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
    fontSize: 6.5,
    fontWeight: "700",
    color: "#94a3b8",
  },
  backBody: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    flex: 1,
    paddingVertical: 4,
  },
  backQrCol: {
    width: 80,
    alignItems: "center",
  },
  qrBox: {
    padding: 3,
    backgroundColor: "#fff",
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#cbd5e1",
  },
  qrTitle: {
    fontSize: 7.5,
    fontWeight: "900",
    color: "#0e3a6c",
    marginTop: 2,
  },
  qrSub: {
    fontSize: 6,
    fontWeight: "700",
    color: "#64748b",
  },
  backInfoCol: {
    flex: 1,
    gap: 3,
  },
  emergencyBox: {
    borderWidth: 1,
    borderColor: "#fecdd3",
    backgroundColor: "#fff1f2",
    padding: 4,
    borderRadius: 4,
  },
  emergencyTitle: {
    fontSize: 6.5,
    fontWeight: "900",
    color: "#9f1239",
  },
  emergencyName: {
    fontSize: 8.5,
    fontWeight: "800",
    color: "#881337",
    marginTop: 1,
  },
  emergencyPhone: {
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
    fontSize: 8,
    fontWeight: "700",
    color: "#be123c",
  },
  helplineGrid: {
    flexDirection: "row",
    gap: 4,
  },
  helplineItem: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#fff",
    borderRadius: 3,
    padding: 2,
    alignItems: "center",
  },
  helplineLabel: {
    fontSize: 5.5,
    fontWeight: "700",
    color: "#64748b",
  },
  helplineNum: {
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
    fontSize: 8.5,
    fontWeight: "900",
    color: "#0f172a",
  },
  backNotice: {
    fontSize: 6,
    color: "#64748b",
    lineHeight: 8,
  },
  backFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    paddingTop: 3,
  },
  barcodeContainer: {
    alignItems: "center",
  },
  barcodeLines: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 1.2,
    height: 14,
  },
  barcodeBar: {
    backgroundColor: "#0f172a",
  },
  barcodeText: {
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
    fontSize: 6.5,
    fontWeight: "700",
    color: "#475569",
    letterSpacing: 1,
    marginTop: 1,
  },
  printSheetContainer: {
    width: "100%",
    alignItems: "center",
    paddingVertical: 10,
  },
  guideBox: {
    maxWidth: 720,
    width: "100%",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#bae6fd",
    backgroundColor: "#f0f9ff",
    padding: 12,
    marginBottom: 14,
  },
  guideTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: "#0369a1",
    marginBottom: 4,
  },
  guideStep: {
    fontSize: 11,
    color: "#334155",
    marginTop: 2,
    lineHeight: 16,
  },
  cutBorderBox: {
    width: "auto",
    maxWidth: 750,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: "#94a3b8",
    borderRadius: 8,
    padding: 12,
    backgroundColor: "#ffffff",
    alignSelf: "center",
  },
  cutBorderBoxPrint: {
    borderColor: "#1e293b",
    backgroundColor: "#ffffff",
    padding: 10,
  },
  cutHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  cutHeaderText: {
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
    fontSize: 8.5,
    fontWeight: "800",
    color: "#475569",
    letterSpacing: 0.5,
  },
  sheetCardsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    flexWrap: "wrap",
    paddingVertical: 4,
  },
  sheetCardColumn: {
    alignItems: "center",
  },
  cardFaceLabel: {
    fontSize: 8.5,
    fontWeight: "800",
    color: "#64748b",
    letterSpacing: 0.8,
    marginBottom: 4,
    textTransform: "uppercase",
  },
  printableCard: {
    width: 320,
    maxWidth: 340,
    aspectRatio: 85.6 / 54,
    shadowOpacity: 0,
    elevation: 0,
    borderColor: "#94a3b8",
  },
  foldDividerVertical: {
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: 180,
    paddingHorizontal: 2,
  },
  foldDashLine: {
    flex: 1,
    width: 1,
    borderStyle: "dashed",
    borderRightWidth: 1.5,
    borderColor: "#94a3b8",
  },
  foldBadge: {
    marginVertical: 4,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  foldTextVertical: {
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
    fontSize: 8,
    fontWeight: "800",
    color: "#64748b",
    letterSpacing: 0.8,
  },
  cutFooterRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
  },
  cutFooterText: {
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
    fontSize: 8.5,
    fontWeight: "700",
    color: "#64748b",
  },
});
