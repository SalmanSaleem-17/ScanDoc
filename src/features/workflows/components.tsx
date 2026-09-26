import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  BackHandler,
  FlatList,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import {
  Button,
  Card,
  Header,
  Icon,
  IconButton,
  Label,
  Screen,
} from "../../components/ui";
import { useTheme } from "../../theme/provider";
import { useDocuments } from "../documents/provider";
import type { LocalDocument } from "../../types/document";
import { engineRequirement, hasEngine } from "../../services/engine";
import { useAds } from "../ads/provider";
import { PREMIUM_FEATURES, describeTimeLeft, type PremiumFeature } from "../ads/rewards.mjs";

// The document picker is deliberately NOT a react-native Modal. A Modal is a
// separate Android window, and that window does not inherit the activity's
// status bar appearance, so its clock and icons stayed white and unreadable on
// a light page. Setting statusBarTranslucent fixes the colour but makes Android
// draw a second status bar at the bottom of the modal. Rendering the picker as
// an overlay inside the app's own window avoids both problems: it reuses the
// same insets and system bars as every other screen.
const PickerContext = React.createContext<
  ((onSelect: (document: LocalDocument) => void) => void) | null
>(null);

export function WorkspaceScreen({
  title,
  subtitle,
  children,
  native = false,
  scroll = true,
  premium,
}: React.PropsWithChildren<{
  title: string;
  subtitle?: string;
  native?: boolean;
  scroll?: boolean;
  /** A tool other apps charge for: a short video unlocks it for 24 hours. */
  premium?: PremiumFeature;
}>) {
  const ads = useAds();
  const gated = !!premium && ads.gateFor(premium);
  const [pick, setPick] = useState<{
    onSelect: (document: LocalDocument) => void;
  } | null>(null);
  const { colors } = useTheme();
  const { documents } = useDocuments();
  // The overlay is a screen of its own as far as the user is concerned, so the
  // Android back gesture must close it rather than leave the workflow.
  useEffect(() => {
    if (!pick) return;
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        setPick(null);
        return true;
      },
    );
    return () => subscription.remove();
  }, [pick]);
  return (
    <PickerContext.Provider
      value={(onSelect) => setPick({ onSelect })}
    >
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <Screen scroll={scroll}>
          <Header
            title={title}
            subtitle={subtitle}
            action={
              <IconButton
                name="close-outline"
                label="Back"
                onPress={() => router.back()}
              />
            }
          />
          <View style={{ gap: 16, flex: scroll ? undefined : 1 }}>
            {native && !hasEngine ? (
              <Card>
                <Label>{engineRequirement}</Label>
                <Label style={{ marginTop: 12 }}>
                  Build command: npm run android
                </Label>
              </Card>
            ) : gated && premium ? (
              <PremiumGate feature={premium} />
            ) : (
              <>
                {premium && ads.available && ads.isUnlocked(premium) && (
                  <Label style={{ fontSize: 12, color: colors.secondary }}>
                    {`Unlocked for another ${describeTimeLeft(ads.rewards.unlocks[premium])}.`}
                  </Label>
                )}
                {children}
              </>
            )}
          </View>
        </Screen>
        {pick && (
          <View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: colors.background },
            ]}
          >
            <SafeAreaView
              style={{ flex: 1, padding: 20 }}
              edges={["top", "bottom", "left", "right"]}
            >
              <Header
                title="Choose a document"
                action={
                  <IconButton
                    name="close-outline"
                    label="Close picker"
                    onPress={() => setPick(null)}
                  />
                }
              />
              <FlatList
                data={documents.filter((d) => !d.trashedAt)}
                keyExtractor={(d) => d.id}
                ListEmptyComponent={
                  <Label>Import or scan a document first.</Label>
                }
                renderItem={({ item }) => (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      pick.onSelect(item);
                      setPick(null);
                    }}
                  >
                    <Card style={{ marginBottom: 10 }}>
                      <Label>{item.name}</Label>
                    </Card>
                  </Pressable>
                )}
              />
            </SafeAreaView>
          </View>
        )}
      </View>
    </PickerContext.Provider>
  );
}
// Shown in place of a premium tool until a rewarded video has been watched.
// It only ever appears when a video can be shown (see rewards.mjs), so the
// tool is never blocked in Expo Go, without consent or offline.
function PremiumGate({ feature }: { feature: PremiumFeature }) {
  const ads = useAds();
  const { colors } = useTheme();
  const [busy, setBusy] = useState(false);
  const name = PREMIUM_FEATURES[feature];
  return (
    <Card style={{ alignItems: "center", gap: 12, paddingVertical: 28 }}>
      <View style={{ padding: 18, borderRadius: 22, backgroundColor: colors.tones.orange.bg }}>
        <Icon name="sparkles-outline" size={34} color={colors.tones.orange.fg} />
      </View>
      <Label style={{ fontWeight: "700", fontSize: 18, textAlign: "center" }}>
        {`${name} is free with a short video`}
      </Label>
      <Label style={{ color: colors.secondary, fontSize: 14, textAlign: "center", maxWidth: 300 }}>
        Other apps sell this tool. Here one short video unlocks it for 4 hours,
        on this device, with nothing to sign up for.
      </Label>
      <View style={{ width: "100%", marginTop: 4 }}>
        <Button
          title={busy ? "Loading video…" : ads.rewardedReady ? "Watch video · unlock for 4 hours" : "Video loading…"}
          icon="play-circle-outline"
          disabled={busy || !ads.rewardedReady}
          onPress={() => {
            setBusy(true);
            void ads.watchRewarded(feature).then((outcome) => {
              setBusy(false);
              if (outcome === "unavailable")
                Alert.alert("No video available", "Try again in a moment.");
              else if (outcome === "dismissed")
                Alert.alert("Video not finished", "Watch it to the end to unlock the tool.");
            });
          }}
        />
      </View>
      <Label style={{ color: colors.secondary, fontSize: 12, textAlign: "center" }}>
        Or remove all ads for 15 minutes in Settings.
      </Label>
    </Card>
  );
}
export function Field({
  label,
  value,
  onChangeText,
  multiline = false,
  numeric = false,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  multiline?: boolean;
  numeric?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Label style={{ fontWeight: "600", fontSize: 13 }}>{label}</Label>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        multiline={multiline}
        keyboardType={numeric ? "decimal-pad" : "default"}
        style={{
          color: colors.text,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 10,
          backgroundColor: colors.surface,
          minHeight: multiline ? 180 : 48,
          padding: 12,
          textAlignVertical: multiline ? "top" : "center",
        }}
      />
    </View>
  );
}
export function useTask() {
  const ads = useAds();
  const active = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      active.current?.abort();
    };
  }, []);
  async function run(
    work: (
      signal: AbortSignal,
      progress: (message: string) => void,
    ) => Promise<void>,
  ) {
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setProgress("Preparing…");
    let succeeded = false;
    try {
      await work(controller.signal, (message) => {
        if (mounted.current) setProgress(message);
      });
      succeeded = true;
    } catch (error) {
      // The engine rejects with a coded, user-safe message (memory limit,
      // internal error, unsupported file); those are shown as they are,
      // because "could not complete" hides the one fact that helps.
      const coded =
        error instanceof Error && "code" in error && typeof error.message === "string" && error.message.length < 240
          ? error.message
          : null;
      if (mounted.current)
        Alert.alert(
          controller.signal.aborted ? "Cancelled" : "Could not complete",
          controller.signal.aborted
            ? "Your saved files and original documents are safe."
            : coded ??
              "Check the selected file, available storage, and entered values, then try again. Password-protected PDFs must be unlocked before importing.",
        );
    } finally {
      active.current = null;
      if (mounted.current) {
        setBusy(false);
        setProgress("");
      }
      // After the result is on screen, not before: the policy in ads/policy.mjs
      // decides whether this break is one where an ad may appear.
      if (succeeded && mounted.current) void ads.showInterstitial();
    }
  }
  return {
    busy,
    progress,
    run,
    cancel: () => {
      active.current?.abort();
      setProgress("Cancelling after the current step…");
    },
  };
}
export function TaskStatus({ task }: { task: ReturnType<typeof useTask> }) {
  return task.busy ? (
    <Card style={{ gap: 12 }}>
      <Label accessibilityLiveRegion="polite">{task.progress}</Label>
      <Button title="Cancel" secondary onPress={task.cancel} />
    </Card>
  ) : null;
}
export function DocumentPicker({
  title,
  value,
  onSelect,
}: {
  title: string;
  value?: LocalDocument;
  onSelect: (document: LocalDocument) => void;
}) {
  const open = React.useContext(PickerContext);
  return (
    <Button
      secondary
      title={value ? `${title}: ${value.name}` : title}
      onPress={() => open?.(onSelect)}
    />
  );
}
