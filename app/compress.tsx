import { useRef, useState } from "react";
import { Alert, Image, Pressable, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { File } from "expo-file-system";
import { router } from "expo-router";
import {
  Button,
  Card,
  Header,
  IconButton,
  Label,
  Screen,
  Section,
} from "../src/components/ui";
import { useTheme } from "../src/theme/provider";
import { importFile } from "../src/services/storage";
import { useDocuments } from "../src/features/documents/provider";
import { formatBytes } from "../src/utils/files.mjs";
import type { LocalDocument } from "../src/types/document";
import { shareDocument } from "../src/features/documents/actions";
import { beginSystemFlow } from "../src/features/ads/systemFlow";
export default function Compress() {
  const { colors } = useTheme();
  const { refresh } = useDocuments();
  const [asset, setAsset] = useState<ImagePicker.ImagePickerAsset>();
  const [quality, setQuality] = useState(0.7);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [result, setResult] = useState<LocalDocument>();
  const [before, setBefore] = useState(0);
  async function choose() {
    try {
      beginSystemFlow();
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 1,
      });
      if (!picked.canceled) {
        setAsset(picked.assets[0]);
        setResult(undefined);
      }
    } catch {
      Alert.alert(
        "Could not open photos",
        "Try importing a supported image from your device.",
      );
    }
  }
  async function compress() {
    if (!asset || lock.current) return;
    lock.current = true;
    setBusy(true);
    let temporary: string | undefined;
    try {
      const original = new File(asset.uri);
      setBefore(original.size);
      const context = ImageManipulator.manipulate(asset.uri);
      // Decode/process natively; never put image bytes or base64 in React state.
      const image = await context.renderAsync();
      try {
        const output = await image.saveAsync({
          compress: quality,
          format: SaveFormat.JPEG,
        });
        temporary = output.uri;
        const document = await importFile(
          output.uri,
          `Compressed_${Date.now()}.jpg`,
          "compressed",
        );
        setResult(document);
        await refresh();
      } finally {
        image.release();
        context.release();
      }
    } catch {
      Alert.alert(
        "Could not compress image",
        "Choose a smaller JPG or PNG image and check available storage.",
      );
    } finally {
      if (temporary) {
        try {
          new File(temporary).delete();
        } catch {}
      }
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <Screen>
      <Header
        title="Compress image"
        subtitle="A smaller file. Your original stays untouched."
        action={
          <IconButton
            name="close-outline"
            label="Close"
            onPress={() => router.back()}
          />
        }
      />
      <View style={{ gap: 16 }}>
        <Button
          title={asset ? "Choose another image" : "Choose an image"}
          icon="image-outline"
          secondary
          disabled={busy}
          onPress={choose}
        />
        {asset && (
          <>
            <Image
              source={{ uri: asset.uri }}
              resizeMode="contain"
              style={{
                width: "100%",
                height: 230,
                borderRadius: 14,
                backgroundColor: colors.surface,
              }}
            />
            <Label style={{ color: colors.secondary, fontSize: 13 }}>
              {asset.width} × {asset.height} px · Output: JPG
            </Label>
            <Section title="Compression" />
            <View style={{ gap: 10 }}>
              {[
                { label: "Highest quality", value: 0.9 },
                { label: "Balanced", value: 0.7 },
                { label: "Smaller file", value: 0.4 },
              ].map((mode) => (
                <Pressable
                  key={mode.value}
                  disabled={busy}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: quality === mode.value }}
                  onPress={() => setQuality(mode.value)}
                >
                  <Card
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      borderColor:
                        quality === mode.value ? colors.blue : colors.border,
                    }}
                  >
                    <Label>{mode.label}</Label>
                    <Label style={{ color: colors.blue }}>
                      {Math.round(mode.value * 100)}%{" "}
                      {quality === mode.value ? "✓" : ""}
                    </Label>
                  </Card>
                </Pressable>
              ))}
            </View>
            <Label style={{ color: colors.secondary, fontSize: 12 }}>
              JPEG removes transparency. Results depend on the original; some
              images may get larger.
            </Label>
            <Button
              title={busy ? "Compressing on your device…" : "Compress & save"}
              disabled={busy}
              onPress={compress}
            />
          </>
        )}
        {result && (
          <Card style={{ gap: 12 }}>
            <Label style={{ fontWeight: "600", color: colors.success }}>
              ✓ Compressed image saved
            </Label>
            <Label>
              {formatBytes(before)} → {formatBytes(result.size)}
            </Label>
            <Label style={{ color: colors.secondary }}>
              {result.size < before
                ? `Saved ${Math.round((1 - result.size / before) * 100)}%`
                : "This image was already efficient. The new file is not smaller."}
            </Label>
            <Button
              title="Open result"
              onPress={() =>
                router.push({
                  pathname: "/document/[id]",
                  params: { id: result.id },
                })
              }
            />
            <Button
              title="Share"
              secondary
              onPress={() => {
                void shareDocument(result).catch(() =>
                  Alert.alert(
                    "Sharing unavailable",
                    "Try again from the document screen.",
                  ),
                );
              }}
            />
          </Card>
        )}
      </View>
    </Screen>
  );
}
