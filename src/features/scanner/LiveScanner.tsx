import { useEffect, useRef, useState, type ComponentType, type Ref } from "react";
import { Alert, AppState, Image, Pressable, StyleSheet, View, type ViewProps } from "react-native";
import { requireNativeViewManager } from "expo-modules-core";
import { useIsFocused } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { NavigationBar } from "expo-navigation-bar";
import { File } from "expo-file-system";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { Icon, Label } from "../../components/ui";
import { addPage, createDraft, getDraft, listPages, pageUri, preservePageOriginal, replacePage } from "../../services/workspace";
import { runEngine, hasLiveDetection } from "../../services/engine";
import { beginSystemFlow } from "../ads/systemFlow";

type Detection = {
  state: string; guidance: string; progress: number; captureReady: boolean;
  confidence: number; sharpness: number; brightness: number; coverage: number;
  motion: number; processingMs: number; analysisFps: number; p95Ms: number; averageMs: number;
};
type CameraHandle = { capture(automatic: boolean): Promise<{ uri: string; corners?: number[] }> };
type CameraProps = ViewProps & {
  ref?: Ref<CameraHandle>; active: boolean; flash: string;
  onReady: () => void; onError: (event: { nativeEvent?: { message?: string } }) => void;
  onDetection: (event: { nativeEvent: Detection }) => void;
};
// Loaded only in a development/production build that exposes supportsLiveDetection.
const NativeCamera = (hasLiveDetection ? requireNativeViewManager("ScanDocEngine") : View) as ComponentType<CameraProps>;
// Development builds on emulators start CameraX far more slowly (it retries
// initialisation when the expected front camera is missing), so the fallback
// waits longer there; phones open the camera in a second or two.
const PREVIEW_WATCHDOG_MS = __DEV__ ? 60_000 : 20_000;
const guidance: Record<string, string> = {
  SEARCHING: "Find a document", NEXT_PAGE: "Turn the page or move the document",
  MOVE_CLOSER: "Move closer", MOVE_FARTHER: "Move farther away",
  FIT_DOCUMENT: "Fit the whole document", HOLD_STEADY: "Hold steady",
  MORE_LIGHT: "More light needed", REDUCE_GLARE: "Reduce glare",
  REDUCE_ANGLE: "Hold phone above document", READY: "Ready",
};

export default function LiveScanner({ draftId, appendTo, onUnavailable }: { draftId?: string; appendTo?: string; onUnavailable?: () => void }) {
  const camera = useRef<CameraHandle>(null);
  const draft = useRef(draftId);
  const lock = useRef(false);
  const alive = useRef(true);
  const focused = useIsFocused();
  const [active, setActive] = useState(AppState.currentState === "active");
  const mayNavigate = useRef(false);
  mayNavigate.current = active && focused;
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [automatic, setAutomatic] = useState(true);
  const [flash, setFlash] = useState<"off" | "on" | "auto">("off");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [detection, setDetection] = useState<Detection>();
  const [count, setCount] = useState(0);
  const [thumbnail, setThumbnail] = useState("");
  const [debug, setDebug] = useState(false);
  useEffect(() => {
    alive.current = true;
    const listener = AppState.addEventListener("change", s => setActive(s === "active"));
    if (draftId) void listPages(draftId).then(p => { if (alive.current) setCount(p.length); }).catch(() => {});
    return () => { alive.current = false; listener.remove(); };
  }, [draftId]);

  useEffect(() => { if (!active || !focused) setReady(false); }, [active, focused]);
  // A camera that never starts streaming raises no error event. If the preview
  // has not reported ready within this window the parent is told, so the
  // standard camera can take over instead of a permanently black screen. The
  // window is generous on purpose: a first CameraX start on a slow phone (or a
  // loaded emulator, where it measured 14 s) can take well over ten seconds,
  // and switching away from a camera that is about to work is worse than
  // waiting.
  useEffect(() => {
    if (!active || !focused || ready || failed) return;
    const timer = setTimeout(() => {
      if (!alive.current) return;
      if (__DEV__) console.warn("[LiveScanner] no preview after the watchdog window; using the standard camera");
      setFailed(true);
      onUnavailable?.();
    }, PREVIEW_WATCHDOG_MS);
    return () => clearTimeout(timer);
  }, [active, focused, ready, failed, onUnavailable]);

  async function ensureDraft() {
    if (!draft.current || !(await getDraft(draft.current))) draft.current = (await createDraft("document", appendTo ?? null)).id;
    return draft.current;
  }
  async function capture(auto = false) {
    if (lock.current || !ready || !active || !focused || failed) return;
    lock.current = true; setBusy(true); setStatus("Capturing…");
    let temporary: string | undefined;
    let saved = false;
    try {
      const photo = await camera.current!.capture(auto);
      temporary = photo.uri;
      const id = await ensureDraft();
      const pageId = await addPage(id, photo.uri);
      saved = true;
      const page = (await listPages(id)).find(p => p.id === pageId)!;
      await preservePageOriginal(page);
      let corners: number[] | undefined = photo.corners;
      if (alive.current) setStatus("Refining page edges…");
      try {
        const result = await runEngine("detect", { uri: pageUri(page) });
        corners = result.corners ?? photo.corners;
        result.clean();
        if (auto && corners) {
          const corrected = await runEngine("edit", { uri: pageUri(page), corners, enhance: true });
          try { await replacePage(page, corrected.uri!); } finally { corrected.clean(); }
        }
      } catch { /* The original is already durable. A failed refinement never loses the page. */ }
      const pages = await listPages(id);
      if (alive.current) {
        setCount(pages.length);
        setThumbnail(pageUri(pages.find(p => p.id === pageId)!));
        setStatus(corners ? "Page saved" : "Page saved · review the crop");
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        if (!auto && mayNavigate.current) router.push({ pathname: "/page-editor", params: { draftId: id, pageId, detectedCorners: corners ? JSON.stringify(corners) : "" } });
      }
    } catch {
      if (alive.current) {
        setAutomatic(false);
        Alert.alert(saved ? "Photo saved" : "Could not capture", saved ? "Your photo is in the scan workspace. Open it to review and edit." : "Check available storage and try the capture button again.");
      }
    } finally {
      if (temporary) { try { new File(temporary).delete(); } catch {} }
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  }
  async function gallery() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setStatus("Choose photos?");
    try {
      beginSystemFlow();
      const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsMultipleSelection: true, selectionLimit: 50, quality: 1 });
      if (!picked.canceled) {
        const id = await ensureDraft();
        let failures = 0;
        for (const [index, image] of picked.assets.entries()) {
          if (alive.current) setStatus(`Importing ${index + 1} of ${picked.assets.length}?`);
          try { await addPage(id, image.uri); } catch { failures++; }
        }
        if (failures && alive.current) Alert.alert("Some photos could not be imported", `${failures} photos failed. Successfully imported pages remain in the workspace.`);
        const pages = await listPages(id); setCount(pages.length); if (pages.length) setThumbnail(pageUri(pages[pages.length - 1]));
      }
    } catch { Alert.alert("Could not import all photos", "Photos already imported remain in your scan workspace. Try fewer images or check available storage."); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  function review() {
    if (busy) return;
    if (draft.current) router.push({ pathname: "/draft/[id]", params: { id: draft.current } });
    else router.push("/workspace");
  }
  return (
    <SafeAreaView style={styles.screen}>
      {focused && <StatusBar style="light" />}
      {focused && <NavigationBar style="light" />}
      <View style={styles.toolbar}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close scanner" disabled={busy} onPress={() => router.back()} style={styles.touch}><Icon name="close" color="white" /></Pressable>
        <Pressable onLongPress={() => __DEV__ && setDebug(v => !v)}><Label style={styles.title}>Scan Document</Label></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`Flash ${flash}`} onPress={() => setFlash(f => f === "off" ? "auto" : f === "auto" ? "on" : "off")} style={styles.touch}>
          <Icon name={flash === "off" ? "flash-off-outline" : "flash-outline"} color="white" /><Label style={styles.small}>{flash}</Label>
        </Pressable>
      </View>
      <View style={{ flex: 1, overflow: "hidden", minHeight: 120 }}>
        {!failed && <NativeCamera ref={camera} style={StyleSheet.absoluteFill} active={active && focused} flash={flash}
          onReady={() => setReady(true)} onError={({ nativeEvent }: { nativeEvent?: { message?: string } }) => { if (__DEV__) console.warn("[LiveScanner] native camera error:", nativeEvent?.message); setFailed(true); setReady(false); onUnavailable?.(); }}
          onDetection={({ nativeEvent: next }) => {
            setDetection(previous => !debug && previous?.state === next.state && previous.guidance === next.guidance && Math.abs(previous.progress - next.progress) < .03 ? previous : next);
            if (next.captureReady && automatic && !lock.current) void capture(true);
          }} />}
        {failed && <View style={styles.failure}><Label style={styles.title}>Camera unavailable</Label><Label style={styles.small}>Import a photo or reopen the scanner.</Label></View>}
        {__DEV__ && debug && detection && <View pointerEvents="none" style={styles.debug}><Label style={styles.small}>{`CV ${detection.analysisFps.toFixed(1)} fps · ${detection.processingMs} ms\nConfidence ${detection.confidence.toFixed(2)} · Motion ${detection.motion.toFixed(3)}\nSharpness ${detection.sharpness.toFixed(0)} · Light ${detection.brightness.toFixed(2)}\nCoverage ${detection.coverage.toFixed(2)} · ${detection.state}`}</Label></View>}
        <View pointerEvents="none" style={styles.guidance}><Label style={{ color: "white", textAlign: "center" }}>{busy ? status : guidance[detection?.guidance ?? "SEARCHING"]}</Label></View>
      </View>
      <View style={styles.controls}>
        <View style={styles.captureRow}>
          <Pressable accessibilityRole="button" accessibilityLabel="Import photos" disabled={busy} onPress={() => void gallery()} style={styles.side}><Icon name="images-outline" color="white" /><Label style={styles.small}>Gallery</Label></Pressable>
          <View style={{ width: 88, height: 88, alignItems: "center", justifyContent: "center" }}>
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>{Array.from({ length: 24 }, (_, i) => <View key={i} style={{ position: "absolute", left: 41, top: 1, width: 6, height: 86, transform: [{ rotate: `${i * 15}deg` }] }}><View style={{ height: 4, borderRadius: 2, backgroundColor: automatic && i < (detection?.progress ?? 0) * 24 ? "#17D7FF" : "#26364C" }} /></View>)}</View>
          <Pressable accessibilityRole="button" accessibilityLabel="Capture document" accessibilityState={{ disabled: busy || !ready }} disabled={busy || !ready} onPress={() => void capture(false)} style={[styles.shutter, { opacity: busy || !ready ? .5 : 1 }]}><View style={styles.shutterInner} /></Pressable>
          </View>
          <Pressable accessibilityRole="switch" accessibilityState={{ checked: automatic }} accessibilityLabel="Automatic capture" onPress={() => setAutomatic(v => !v)} style={styles.side}><Icon name={automatic ? "sparkles" : "hand-left-outline"} color={automatic ? "#17D7FF" : "white"} /><Label style={styles.small}>{automatic ? "Auto" : "Manual"}</Label></Pressable>
        </View>
        <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round((detection?.progress ?? 0) * 100) }} style={styles.progress}><View style={{ height: 3, width: `${automatic ? (detection?.progress ?? 0) * 100 : 0}%`, backgroundColor: "#17D7FF" }} /></View>
        <Pressable accessibilityRole="button" accessibilityLabel={`Review ${count} pages`} disabled={busy} onPress={review} style={styles.review}>
          {!!thumbnail && <Image source={{ uri: thumbnail }} resizeMethod="resize" resizeMode="cover" style={{ width: 28, height: 36, borderRadius: 4 }} />}
          <Label style={styles.small}>{count ? `${count} ${count === 1 ? "page" : "pages"} · Review & save PDF` : "Pages are saved on your device"}</Label><Icon name="chevron-forward" color="#A4B2C7" size={16} />
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#07111F" }, toolbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 8 },
  touch: { minWidth: 56, minHeight: 52, alignItems: "center", justifyContent: "center" }, title: { color: "white", fontWeight: "600" }, small: { color: "#C5D3E5", fontSize: 12 },
  failure: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }, debug: { position: "absolute", top: 8, left: 8, padding: 8, backgroundColor: "#07111FDD" },
  guidance: { position: "absolute", bottom: 16, alignSelf: "center", maxWidth: "94%", padding: 12, borderRadius: 12, backgroundColor: "#07111FDD" },
  controls: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8, maxWidth: 700, width: "100%", alignSelf: "center" },
  captureRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-around" }, side: { minWidth: 70, minHeight: 64, alignItems: "center", justifyContent: "center", gap: 4 },
  shutter: { width: 76, height: 76, borderWidth: 3, borderColor: "#17D7FF", borderRadius: 38, padding: 5 }, shutterInner: { flex: 1, backgroundColor: "white", borderRadius: 32 },
  progress: { height: 3, backgroundColor: "#26364C", marginTop: 14, borderRadius: 2, overflow: "hidden" },
  review: { minHeight: 52, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
});
