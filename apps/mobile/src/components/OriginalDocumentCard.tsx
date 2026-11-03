import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { useEffect, useState } from "react";
import { ActivityIndicator, Image, View } from "react-native";
import { prescriptionApi } from "../api/endpoints";
import type { Prescription } from "../api/types";
import { AppText, Banner, Button, Card, SectionTitle } from "../ui/components";
import { colors, space } from "../ui/theme";

type Props = { prescription: Pick<Prescription, "id" | "sourceFile"> };

/**
 * Shows the patient's original uploaded prescription exactly as uploaded, apart from the digitised details.
 * Images render in place; PDFs and anything else open through the system share sheet.
 */
export function OriginalDocumentCard({ prescription }: Props) {
  const mime = prescription.sourceFile?.mimeType ?? "";
  const isImage = mime.startsWith("image/");
  const [source, setSource] = useState<{ uri: string; headers: Record<string, string> } | null>(null);
  const [loading, setLoading] = useState(isImage);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isImage) return;
    let cancelled = false;
    prescriptionApi
      .fileRequest(prescription.id)
      .then(({ url, headers }) => !cancelled && setSource({ uri: url, headers }))
      .catch(() => !cancelled && (setFailed(true), setLoading(false)));
    return () => {
      cancelled = true;
    };
  }, [isImage, prescription.id]);

  async function openExternally() {
    setBusy(true);
    setMessage(null);
    let file: File | null = null;
    try {
      if (!(await Sharing.isAvailableAsync())) {
        setMessage("Sharing isn't available on this device.");
        return;
      }
      const { url, headers } = await prescriptionApi.fileRequest(prescription.id);
      const extension = mime === "application/pdf" ? "pdf" : mime.split("/")[1] || "bin";
      file = await File.downloadFileAsync(url, new File(Paths.cache, `sehatmeds-original-${prescription.id}.${extension}`), { headers, idempotent: true });
      await Sharing.shareAsync(file.uri, { mimeType: mime || undefined, dialogTitle: "Original prescription" });
    } catch {
      setMessage("Couldn't open the original file. Check your connection and try again.");
    } finally {
      try {
        file?.delete();
      } catch {
        // cache cleanup is best-effort
      }
      setBusy(false);
    }
  }

  return (
    <Card>
      <SectionTitle>Original prescription</SectionTitle>
      <AppText variant="small" muted>Your uploaded file, exactly as you sent it. Corrections never change it.</AppText>

      {isImage && !failed && source ? (
        <View style={{ minHeight: 200, borderRadius: 8, overflow: "hidden", backgroundColor: colors.surface }}>
          <Image
            source={source}
            style={{ width: "100%", height: 360 }}
            resizeMode="contain"
            accessibilityLabel="Your original prescription as uploaded"
            onLoadEnd={() => setLoading(false)}
            onError={() => {
              setFailed(true);
              setLoading(false);
            }}
          />
          {loading ? <ActivityIndicator style={{ position: "absolute", top: space.xl, alignSelf: "center" }} /> : null}
        </View>
      ) : null}

      {isImage && failed ? <Banner tone="warning" title="The picture couldn't be shown here" icon="alert-triangle">You can still open the original file below.</Banner> : null}
      {message ? <Banner tone="danger" title={message} icon="alert-circle" /> : null}

      {!isImage || failed ? (
        <Button label={mime === "application/pdf" ? "Open original PDF" : "Open original file"} icon="file-text" variant="secondary" onPress={() => void openExternally()} loading={busy} />
      ) : (
        <Button label="Open or share original" icon="external-link" variant="ghost" onPress={() => void openExternally()} loading={busy} />
      )}
    </Card>
  );
}
