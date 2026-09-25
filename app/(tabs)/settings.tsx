import React, { useCallback, useState } from "react";
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
import { NativeAdCard } from "../../src/features/ads/NativeAdCard";
import { PREMIUM_FEATURES, describeTimeLeft, type PremiumFeature } from "../../src/features/ads/rewards.mjs";
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
          <Section title="Ads & rewards" />
          <Card style={{ gap: 14 }}>
            <Label style={{ fontSize: 13, color: colors.secondary }}>
              {ads.canRequestAds
                ? "ScanDoc is free and shows a small number of ads through Google AdMob, never over the camera or the page editor. A short video pays for the extras below; nothing is ever sold."
                : "Ads are switched off on this device. Every tool is open and no video is needed."}
            </Label>
            {ads.canRequestAds && (
              <>
                <View style={{ height: 1, backgroundColor: colors.border }} />
                <RewardRow
                  icon="eye-off-outline"
                  title="Remove ads for 15 minutes"
                  active={ads.adFreeMinutes > 0 ? `Ad-free for another ${describeTimeLeft(ads.rewards.adFreeUntil)} · watch again to add 15 min` : ""}
                  ready={ads.rewardedReady}
                  onPress={() =>
                    void ads.watchRewardedForAdFree().then((outcome) => {
                      if (outcome === "unavailable") Alert.alert("No video available", "Try again in a moment.");
                    })
                  }
                />
                <RewardRow
                  icon="sparkles-outline"
                  title="Remove the PDF watermark for 24 hours"
                  active={ads.watermarkFree ? `No watermark for another ${describeTimeLeft(ads.rewards.watermarkFreeUntil)}` : ""}
                  ready={ads.rewardedReady}
                  onPress={() =>
                    void ads.watchRewarded("watermark").then((outcome) => {
                      if (outcome === "unavailable") Alert.alert("No video available", "Try again in a moment.");
                    })
                  }
                />
                <Label style={{ fontSize: 12, color: colors.secondary }}>
                  {(() => {
                    const open = (Object.keys(PREMIUM_FEATURES) as PremiumFeature[]).filter((f) => ads.isUnlocked(f));
                    return open.length
                      ? `Unlocked tools: ${open.map((f) => `${PREMIUM_FEATURES[f]} (${describeTimeLeft(ads.rewards.unlocks[f])})`).join(", ")}.`
                      : "OCR, Merge, Split, PDF to Images, Compress PDF and Compare each unlock for 24 hours with a video, from inside the tool.";
                  })()}
                </Label>
              </>
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
      <NativeAdCard />
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

function RewardRow({
  icon,
  title,
  active,
  ready,
  onPress,
}: {
  icon: React.ComponentProps<typeof Icon>["name"];
  title: string;
  /** Status line while the reward is running; empty when it is not. */
  active: string;
  ready: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
      <Icon name={icon} color={active ? colors.success : colors.blue} />
      <View style={{ flex: 1 }}>
        <Label style={{ fontWeight: "600" }}>{title}</Label>
        <Label style={{ color: colors.secondary, fontSize: 13 }}>
          {active || (ready ? "Watch a short video" : "Video loading…")}
        </Label>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ disabled: !ready }}
        disabled={!ready}
        onPress={onPress}
        style={{ minHeight: 44, paddingHorizontal: 12, justifyContent: "center", opacity: ready ? 1 : 0.5 }}
      >
        <Label style={{ color: colors.blue, fontSize: 13, fontWeight: "600" }}>Watch</Label>
      </Pressable>
    </View>
  );
}
