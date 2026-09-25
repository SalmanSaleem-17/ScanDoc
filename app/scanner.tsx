import LiveScanner from "../src/features/scanner/LiveScanner";
import { hasLiveDetection } from "../src/services/engine";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import { Alert, AppState, Linking, Pressable, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { File } from "expo-file-system";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Button,
  EmptyState,
  Icon,
  Label,
  Loading,
  Screen,
} from "../src/components/ui";
import { addPage, createDraft, getDraft } from "../src/services/workspace";
import { beginSystemFlow } from "../src/features/ads/systemFlow";
export default function Scanner() {
  // appendTo: the pages captured here are added to that document when the
  // draft is finished, instead of becoming a new file.
  const { draftId, appendTo } = useLocalSearchParams<{
    draftId?: string;
    appendTo?: string;
  }>();
  const currentDraft = useRef(draftId);
  const [permission, requestPermission, checkPermission] =
    useCameraPermissions();
  // Live edge detection runs in the app's own native camera view. If that view
  // cannot start on a device (camera provider, OpenCV, or an OEM quirk), the
  // standard camera below takes over rather than leaving a dead end.
  const [liveUnavailable, setLiveUnavailable] = useState(false);
  const camera = useRef<CameraView>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [torch, setTorch] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [active, setActive] = useState(AppState.currentState === "active");
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      setReady(false);
      setActive(state === "active");
      // Coming back from the system Settings page after granting access: the
      // hook does not poll, so the status is read again here.
      if (state === "active") void checkPermission().catch(() => {});
    });
    return () => subscription.remove();
  }, [checkPermission]);
  async function capture() {
    if (!ready || lock.current) return;
    lock.current = true;
    setBusy(true);
    let temporary: string | undefined;
    try {
      const image = await camera.current?.takePictureAsync({ quality: 0.95 });
      if (!image) return;
      temporary = image.uri;
      if (!currentDraft.current || !(await getDraft(currentDraft.current)))
        currentDraft.current = (await createDraft("document", appendTo ?? null)).id;
      const pageId = await addPage(currentDraft.current, image.uri);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
        () => {},
      );
      router.replace({
        pathname: "/page-editor",
        params: { draftId: currentDraft.current, pageId },
      });
    } catch {
      Alert.alert(
        "Could not save capture",
        "Check available storage and try again. Previously captured pages remain in your workspace.",
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
  if (!permission)
    return (
      <Screen>
        <Loading text="Checking camera access…" />
      </Screen>
    );
  if (!permission.granted || failed)
    return (
      <Screen>
        <EmptyState
          title={failed ? "Camera unavailable" : "A camera for your paperwork"}
          description={
            failed
              ? "You can still add gallery images in the scan workspace."
              : "Allow camera access to capture documents locally."
          }
          action={
            <View style={{ gap: 12 }}>
              <Button
                title={
                  failed
                    ? "Go back"
                    : permission.canAskAgain
                      ? "Allow camera"
                      : "Open Settings"
                }
                onPress={() =>
                  failed
                    ? router.back()
                    : permission.canAskAgain
                      ? void requestPermission()
                      : (beginSystemFlow(), void Linking.openSettings())
                }
              />
              {!failed && (
                <Button
                  secondary
                  title="Not now"
                  onPress={() => router.back()}
                />
              )}
            </View>
          }
        />
      </Screen>
    );
  if (hasLiveDetection && !liveUnavailable)
    return (
      <LiveScanner
        draftId={draftId}
        appendTo={appendTo}
        onUnavailable={() => setLiveUnavailable(true)}
      />
    );
  return (
    <View style={{ flex: 1, backgroundColor: "#07111F" }}>
      <StatusBar style="light" />
      {active && (
        <CameraView
          ref={camera}
          facing="back"
          enableTorch={torch}
          onCameraReady={() => setReady(true)}
          onMountError={() => setFailed(true)}
          style={{ flex: 1 }}
        />
      )}
      <SafeAreaView
        style={{
          position: "absolute",
          width: "100%",
          height: "100%",
          justifyContent: "space-between",
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            padding: 16,
            backgroundColor: "#07111FCC",
          }}
        >
          <Pressable
            accessibilityLabel="Close scanner"
            accessibilityRole="button"
            disabled={busy}
            onPress={() => router.back()}
            style={{ padding: 12 }}
          >
            <Icon name="close" color="white" />
          </Pressable>
          <Label style={{ color: "white", fontWeight: "600" }}>
            Document capture
          </Label>
          <Pressable
            accessibilityLabel={torch ? "Turn flash off" : "Turn flash on"}
            accessibilityRole="button"
            onPress={() => setTorch(!torch)}
            style={{ padding: 12 }}
          >
            <Icon name={torch ? "flash" : "flash-off-outline"} color="white" />
          </Pressable>
        </View>
        <View
          style={{
            padding: 22,
            backgroundColor: "#07111FEE",
            gap: 16,
            alignItems: "center",
          }}
        >
          <Label
            style={{ color: "#CED8E6", fontSize: 13, textAlign: "center" }}
          >
            {busy
              ? "Saving page to your draft…"
              : liveUnavailable
                ? "Manual capture. Edges are detected after you take the photo."
                : "Manual capture. Live detection requires the ScanDoc Android build."}
          </Label>
          <Pressable
            accessibilityLabel="Capture document"
            accessibilityRole="button"
            disabled={!ready || busy}
            onPress={capture}
            style={{
              width: 76,
              height: 76,
              borderRadius: 38,
              borderWidth: 4,
              borderColor: "#17D7FF",
              padding: 5,
              opacity: busy ? 0.5 : 1,
            }}
          >
            <View
              style={{ flex: 1, borderRadius: 40, backgroundColor: "white" }}
            />
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}
