import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";

import { prescriptionApi } from "../api/endpoints";
import { describeError } from "../api/errors";
import type { UploadFile } from "../api/types";
import type { RootStackParamList } from "../navigation/types";
import { AppText, Banner, Button, Card, Screen, Stack } from "../ui/components";
import { PermissionDenied } from "../ui/states";
import { space } from "../ui/theme";

type Props = NativeStackScreenProps<RootStackParamList, "PrescriptionUpload">;

function describeSize(bytes: number | undefined): string {
  if (!bytes) return "";
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function PrescriptionUploadScreen({ navigation }: Props) {
  const [file, setFile] = useState<(UploadFile & { size?: number }) | null>(null);
  const [cameraDenied, setCameraDenied] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function fromAsset(asset: ImagePicker.ImagePickerAsset) {
    setFile({
      uri: asset.uri,
      name: asset.fileName ?? `prescription-${Date.now()}.jpg`,
      mimeType: asset.mimeType ?? "image/jpeg",
      ...(asset.fileSize !== undefined ? { size: asset.fileSize } : {}),
    });
  }

  async function takePhoto() {
    setNotice(null);
    setError(null);
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      setCameraDenied(true);
      return;
    }
    setCameraDenied(false);
    try {
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.8, allowsEditing: false });
      const asset = result.assets?.[0];
      if (!result.canceled && asset) fromAsset(asset);
    } catch {
      setNotice("The camera isn't available on this device. Choose a photo from your library instead.");
    }
  }

  async function pickPhoto() {
    setNotice(null);
    setError(null);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8, allowsEditing: false });
      const asset = result.assets?.[0];
      if (!result.canceled && asset) fromAsset(asset);
    } catch {
      setNotice("Couldn't open your photo library. Check HealthHub's photo access in Settings.");
    }
  }

  async function pickPdf() {
    setNotice(null);
    setError(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: "application/pdf", copyToCacheDirectory: true, multiple: false });
      const asset = result.assets?.[0];
      if (!result.canceled && asset) {
        setFile({
          uri: asset.uri,
          name: asset.name || `prescription-${Date.now()}.pdf`,
          mimeType: asset.mimeType ?? "application/pdf",
          ...(asset.size !== undefined ? { size: asset.size } : {}),
        });
      }
    } catch {
      setNotice("Couldn't open the file picker on this device.");
    }
  }

  async function upload() {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const created = await prescriptionApi.upload(file);
      // Server response is the proof of success: continue to its real processing status.
      navigation.replace("PrescriptionDetail", { id: created.id });
    } catch (e) {
      const info = describeError(e);
      setError(`${info.title}. ${info.detail}`);
      setUploading(false);
    }
  }

  return (
    <Screen>
      <Stack>
        <Banner tone="warning" title="Test prescriptions only" icon="alert-triangle">
          Don't upload real patient records during this prototype. The file is sent to the HealthHub server you're connected to.
        </Banner>
        <AppText variant="heading" accessibilityRole="header">Choose a prescription</AppText>
        <AppText muted>Use a flat, well-lit photo with all text in frame, or a PDF. English-language prescriptions work best.</AppText>

        {cameraDenied ? (
          <PermissionDenied what="Camera" why="HealthHub needs the camera only to photograph a prescription when you choose Take photo. You can also pick a photo or PDF instead." />
        ) : null}
        {notice ? <Banner tone="info" title={notice} icon="info" /> : null}

        <Stack gap={space.sm}>
          <Button label="Take photo" icon="camera" variant="secondary" onPress={() => void takePhoto()} disabled={uploading} />
          <Button label="Choose photo from library" icon="image" variant="secondary" onPress={() => void pickPhoto()} disabled={uploading} />
          <Button label="Choose PDF" icon="file" variant="secondary" onPress={() => void pickPdf()} disabled={uploading} />
        </Stack>

        {file ? (
          <Card>
            <AppText variant="label">Ready to upload</AppText>
            <AppText selectable>{file.name}</AppText>
            <AppText variant="small" muted>{[file.mimeType, describeSize(file.size)].filter(Boolean).join(" · ")}</AppText>
          </Card>
        ) : null}
        {error ? <Banner tone="danger" title={error} icon="alert-circle" /> : null}
        <Button label="Upload" icon="upload-cloud" onPress={() => void upload()} loading={uploading} disabled={!file} />
        <AppText variant="caption" muted>
          After upload you'll see the reading status. Details read by computer can be wrong, so you will be asked to review them.
        </AppText>
      </Stack>
    </Screen>
  );
}
