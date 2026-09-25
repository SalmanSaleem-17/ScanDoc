import { useCallback, useState } from "react";
import { Alert, Linking, Pressable, View } from "react-native";
import { useFocusEffect } from "expo-router";
import Constants from "expo-constants";
import {
  Button,
  Card,
  Header,
  Icon,
  Label,
  Screen,
  Section,
} from "../../src/components/ui";
import { useTheme } from "../../src/theme/provider";
import { useDocuments } from "../../src/features/documents/provider";
import { emptyTrash } from "../../src/services/storage";
import {
  TRASH_RETENTION_DAYS,
  describeDirectory,
  libraryBytes,
} from "../../src/services/library.mjs";
import {
  FOLDER_HINT,
  chooseExportDirectory,
  exportDirectory,
} from "../../src/services/saveToDevice";
import { formatBytes } from "../../src/utils/files.mjs";
import { useAds } from "../../src/features/ads/provider";
import { POLICY_URL } from "../../src/features/ads/config";
import { beginSystemFlow } from "../../src/features/ads/systemFlow";
export default function Settings() {
  const { colors, mode, setMode } = useTheme();
  const { documents, refresh } = useDocuments();
  const ads = useAds();
  const usage = libraryBytes(documents);
  const [exportDir, setExportDir] = useState<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      let live = true;
      void exportDirectory().then((value) => {
        if (live) setExportDir(value);
      });
      return () => {
        live = false;
      };
    }, []),
  );
  const plural = (count: number, word: string) =>
    `${count} ${word}${count === 1 ? "" : "s"}`;
  function confirmEmptyTrash() {
    Alert.alert(
      "Empty trash?",
      `${plural(usage.trashCount, "document")} (${formatBytes(usage.trash)}) will be deleted from this device, along with any recognized text. This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Empty trash",
          style: "destructive",
          onPress: () =>
            void emptyTrash()
              .then(() => refresh())
              .catch(() =>
                Alert.alert(
                  "Could not empty the trash",
                  "Some files may still be in use. Try again in a moment.",
                ),
              ),
        },
      ],
    );
  }
  return (
    <Screen tabScreen>
      <Header title="Settings" />
      <Section title="Appearance" />
      <Card style={{ paddingVertical: 4 }}>
        {(["system", "light", "dark"] as const).map((value, index) => (
          <Pressable
            key={value}
            accessibilityRole="radio"
            accessibilityState={{ checked: mode === value }}
            onPress={() => setMode(value)}
            style={{
              minHeight: 60,
              flexDirection: "row",
              alignItems: "center",
              gap: 14,
              borderBottomWidth: index < 2 ? 1 : 0,
              borderColor: colors.border,
            }}
          >
            <Icon
              name={
                value === "system"
                  ? "phone-portrait-outline"
                  : value === "light"
                    ? "sunny-outline"
                    : "moon-outline"
              }
            />
            <Label style={{ flex: 1 }}>
              {value === "system"
                ? "System default"
                : value === "light"
                  ? "Light"
                  : "Dark"}
            </Label>
            <Icon
              name={mode === value ? "radio-button-on" : "radio-button-off"}
              color={mode === value ? colors.blue : colors.secondary}
            />
          </Pressable>
        ))}
      </Card>
      <Section title="Storage" />
      <Card style={{ gap: 14 }}>
        <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
          <Icon name="folder-outline" />
          <View style={{ flex: 1 }}>
            <Label style={{ fontWeight: "600" }}>Library</Label>
            <Label style={{ color: colors.secondary, fontSize: 13 }}>
              {`${plural(usage.activeCount, "document")} · ${formatBytes(usage.active)} on this device`}
            </Label>
          </View>
        </View>
        <View style={{ height: 1, backgroundColor: colors.border }} />
        <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
          <Icon name="trash-outline" color={colors.secondary} />
          <View style={{ flex: 1 }}>
            <Label style={{ fontWeight: "600" }}>Trash</Label>
            <Label style={{ color: colors.secondary, fontSize: 13 }}>
              {usage.trashCount
                ? `${plural(usage.trashCount, "document")} · ${formatBytes(usage.trash)} · removed automatically after ${TRASH_RETENTION_DAYS} days`
                : `Empty · items are kept for ${TRASH_RETENTION_DAYS} days before removal`}
            </Label>
          </View>
        </View>
        <View style={{ height: 1, backgroundColor: colors.border }} />
        <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
          <Icon name="download-outline" />
          <View style={{ flex: 1 }}>
            <Label style={{ fontWeight: "600" }}>Save to device folder</Label>
            <Label style={{ color: colors.secondary, fontSize: 13 }}>
              {exportDir
                ? describeDirectory(exportDir) || "Chosen folder"
                : "Chosen the first time you save. " + FOLDER_HINT}
            </Label>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Choose the folder documents are saved to"
            onPress={() =>
              void chooseExportDirectory()
                .then((value) => {
                  if (value) setExportDir(value);
                })
                .catch(() =>
                  Alert.alert(
                    "Could not open the folder picker",
                    "Try again, or save a document and choose a folder there.",
                  ),
                )
            }
            style={{ minHeight: 44, justifyContent: "center" }}
          >
            <Label style={{ color: colors.blue, fontSize: 13 }}>
              {exportDir ? "Change" : "Choose"}
            </Label>
          </Pressable>
        </View>
        {usage.trashCount > 0 && (
          <Button
            title="Empty trash now"
            icon="trash-outline"
            destructive
            onPress={confirmEmptyTrash}
          />
        )}
      </Card>
      <Section title="Privacy" />
      <Card style={{ gap: 16 }}>
        <View style={{ flexDirection: "row", gap: 12 }}>
          <Icon name="shield-checkmark-outline" color={colors.success} />
          <View style={{ flex: 1 }}>
            <Label style={{ fontWeight: "600" }}>Private by design</Label>
            <Label
              style={{ color: colors.secondary, fontSize: 13, marginTop: 5 }}
            >
              Documents and their text stay in this app&rsquo;s private storage.
              Nothing is uploaded.
            </Label>
          </View>
        </View>
        <View style={{ height: 1, backgroundColor: colors.border }} />
        <Label style={{ fontSize: 13, color: colors.secondary }}>
          Uninstalling removes the library, and it is not part of device
          backups: share anything important to a place you control.
        </Label>
        <Button
          title="Privacy policy"
          icon="document-text-outline"
          secondary
          onPress={() => {
            beginSystemFlow();
            void Linking.openURL(POLICY_URL).catch(() => {});
          }}
        />
      </Card>
      {ads.available && (
        <>
          <Section title="Ads" />
          <Card style={{ gap: 14 }}>
            <Label style={{ fontSize: 13, color: colors.secondary }}>
              {ads.canRequestAds
                ? "ScanDoc is free and shows a small number of ads through Google AdMob. They never appear over the camera or the page editor, and every feature works the same without them."
                : "Ads are switched off on this device. Every feature works the same."}
            </Label>
            {ads.adFreeMinutes > 0 && (
              <Label style={{ fontWeight: "600" }}>
                {`Ad-free for ${ads.adFreeMinutes} more ${ads.adFreeMinutes === 1 ? "minute" : "minutes"}.`}
              </Label>
            )}
            {ads.canRequestAds && (
              <Button
                title="Remove ads for 1 hour"
                icon="play-circle-outline"
                secondary
                onPress={() =>
                  void ads.watchRewardedForAdFree().then((outcome) => {
                    if (outcome === "rewarded")
                      Alert.alert("Thank you", "Ads are off for the next hour. Watching again adds another hour.");
                    else if (outcome === "unavailable")
                      Alert.alert("No video available", "Try again in a moment.");
                  })
                }
              />
            )}
            {ads.privacyOptionsRequired && (
              <Button
                title="Ad privacy settings"
                icon="options-outline"
                secondary
                onPress={() => void ads.openPrivacyOptions()}
              />
            )}
          </Card>
        </>
      )}
      <Section title="About" />
      <Card style={{ gap: 12 }}>
        <Label style={{ fontWeight: "600" }}>ScanDoc: Scanner, PDF & OCR</Label>
        <Label style={{ color: colors.secondary, fontSize: 13 }}>
          {`Version ${Constants.expoConfig?.version ?? "1.0.0"} · Documents never leave this device`}
        </Label>
      </Card>
    </Screen>
  );
}
