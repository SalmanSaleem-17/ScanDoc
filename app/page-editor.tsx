import { useEffect, useRef, useState } from "react";
import { Alert, Image, Pressable, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { File } from "expo-file-system";
import { router, useLocalSearchParams } from "expo-router";
import { Button, Card, Icon, Label, type IconName } from "../src/components/ui";
import { CropEditor } from "../src/features/crop/CropEditor";
import {
  defaultCorners,
  isValidQuad,
  moveCorner,
  orderCorners,
} from "../src/features/crop/geometry.mjs";
import {
  WorkspaceScreen,
  Field,
  TaskStatus,
  useTask,
} from "../src/features/workflows/components";
import {
  getDraft,
  listPages,
  pageUri,
  replacePage,
  originalPageUri,
  preservePageOriginal,
  type DraftPage,
} from "../src/services/workspace";
import { splitPage } from "../src/services/splitPage";
import {
  hasEngine,
  runEngine,
  engineRequirement,
} from "../src/services/engine";
import { importFile } from "../src/services/storage";
import { useDocuments } from "../src/features/documents/provider";
import { validCorners } from "../src/features/workflows/logic.mjs";
type Box = [number, number, number, number];
// One nudge of the fine-adjust controls, as a fraction of the image.
const STEP = 0.004;
// Compact control for the dark crop stage, where themed buttons would not read.
function StageAction({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 56,
        alignItems: "center",
        justifyContent: "center",
        gap: 4,
        opacity: disabled ? 0.4 : pressed ? 0.6 : 1,
      })}
    >
      <Icon name={icon} color="#FFFFFF" size={22} />
      <Label
        numberOfLines={1}
        style={{ color: "#FFFFFF", fontSize: 11, lineHeight: 15 }}
      >
        {label}
      </Label>
    </Pressable>
  );
}
export default function PageEditor() {
  const { draftId, pageId, detectedCorners } = useLocalSearchParams<{
    draftId: string;
    pageId: string;
    detectedCorners?: string;
  }>();
  const [page, setPage] = useState<DraftPage>();
  const [uri, setUri] = useState("");
  const [original, setOriginal] = useState<string>();
  const [ratio, setRatio] = useState(0.75);
  const [sized, setSized] = useState(false);
  const [width, setWidth] = useState(300);
  const [mode, setMode] = useState<"crop" | "redact" | "book">("crop");
  const [corners, setCorners] = useState(defaultCorners());
  const [corner, setCorner] = useState(0);
  const [fine, setFine] = useState(false);
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [start, setStart] = useState<number[]>();
  const [issues, setIssues] = useState<string[]>([]);
  const [split, setSplit] = useState("50");
  const [curve, setCurve] = useState("0");
  const [rtl, setRtl] = useState(false);
  const [previews, setPreviews] = useState<string[]>([]);
  const cleanPreview = useRef<(() => void) | null>(null);
  const task = useTask();
  const { refresh } = useDocuments();
  useEffect(() => {
    let mounted = true;
    void Promise.all([listPages(draftId), getDraft(draftId)])
      .then(([pages, draft]) => {
        const found = pages.find((p) => p.id === pageId);
        if (!mounted || !found) return;
        setPage(found);
        void originalPageUri(found).then(value => { if(mounted) setOriginal(value); });
        try { const points = JSON.parse(detectedCorners || "null"); if(Array.isArray(points) && validCorners(points)) setCorners(points); } catch {}
        setUri(pageUri(found));
        if (draft?.preset === "book") setMode("book");
      })
      .catch(() =>
        Alert.alert(
          "Could not open page",
          "Return to your draft and try again.",
        ),
      );
    return () => {
      mounted = false;
      cleanPreview.current?.();
    };
  }, [draftId, pageId]);
  // The crop maps normalized corners onto the real photo, so it must not be
  // shown until the true aspect ratio is known: a guessed ratio would crop
  // somewhere other than where the user aimed.
  useEffect(() => {
    if (!uri) return;
    let mounted = true;
    setSized(false);
    Image.getSize(
      uri,
      (w, h) => {
        if (!mounted || w <= 0 || h <= 0) return;
        setRatio(w / h);
        setSized(true);
      },
      () => {},
    );
    return () => {
      mounted = false;
    };
  }, [uri]);
  async function checkQuality(signal: AbortSignal) {
    const result = await runEngine("quality", { uri }, { signal });
    try {
      setIssues(
        result.issues?.length
          ? result.issues
          : [
              "No obvious quality warning. Still check small text and page edges before exporting.",
            ],
      );
    } finally {
      result.clean();
    }
  }
  function tap(x: number, y: number) {
    if (task.busy) return;
    const nx = Math.max(0, Math.min(1, x / width));
    const ny = Math.max(0, Math.min(1, y / (width / ratio)));
    if (mode === "redact") {
      if (!start) setStart([nx, ny]);
      else {
        const box: Box = [
          Math.min(start[0], nx),
          Math.min(start[1], ny),
          Math.abs(start[0] - nx),
          Math.abs(start[1] - ny),
        ];
        if (box[2] > 0.005 && box[3] > 0.005) setBoxes((old) => [...old, box]);
        setStart(undefined);
      }
    }
  }
  function edit(enhance = false) {
    if (!page) return;
    if (mode === "crop" && !validCorners(corners)) {
      Alert.alert(
        "Adjust the corners",
        "Keep the corners clockwise without crossing edges.",
      );
      return;
    }
    void task.run(async (signal) => {
      await preservePageOriginal(page);
      const result = await runEngine(
        "edit",
        {
          uri,
          corners: mode === "crop" ? corners : undefined,
          redactions: mode === "redact" ? boxes : undefined,
          enhance,
        },
        { signal },
      );
      try {
        if (signal.aborted) throw new Error("Cancelled");
        await replacePage(page, result.uri!);
        const next = (await listPages(draftId)).find((p) => p.id === pageId)!;
        setPage(next);
        setUri(pageUri(next));
        setCorners([0, 0, 1, 0, 1, 1, 0, 1]);
        setBoxes([]);
        setStart(undefined);
        Alert.alert("Page saved", "Your draft has been updated.");
      } finally {
        result.clean();
      }
    });
  }
  // Detection runs on the saved photo, not on a preview, so the corners it
  // returns line up exactly with what the crop will use.
  function autoDetect() {
    void task.run(async (signal) => {
      const result = await runEngine("detect", { uri }, { signal });
      try {
        const found = result.corners;
        const ordered =
          found && found.length === 8 ? orderCorners(found) : undefined;
        if (ordered && isValidQuad(ordered)) setCorners(ordered);
        else
          Alert.alert(
            "No page edges found",
            "Drag the corners to fit the page, or retake the photo against a background with more contrast.",
          );
      } finally {
        result.clean();
      }
    });
  }
  async function rotate(degrees: number) {
    if (!page) return;
    await task.run(async () => {
      const context = ImageManipulator.manipulate(uri);
      context.rotate(degrees);
      const image = await context.renderAsync();
      let output: { uri: string } | undefined;
      try {
        output = await image.saveAsync({
          format: SaveFormat.JPEG,
          compress: 0.95,
        });
        await preservePageOriginal(page);
        await replacePage(page, output.uri);
        const next = (await listPages(draftId)).find((p) => p.id === pageId)!;
        setPage(next);
        setUri(pageUri(next));
        setCorners(defaultCorners());
      } finally {
        image.release();
        context.release();
        try {
          const temporary = output && new File(output.uri);
          if (temporary?.exists) temporary.delete();
        } catch {}
      }
    });
  }
  // Keyboard- and screen-reader-friendly alternative to dragging.
  function nudge(dx: number, dy: number) {
    setCorners((old) => {
      const next = moveCorner(old, corner, dx, dy);
      return isValidQuad(next) ? next : old;
    });
  }
  if (uri && mode === "crop")
    return (
      <View style={{ flex: 1, backgroundColor: "#061A40" }}>
        <StatusBar style="light" />
        <SafeAreaView
          style={{ flex: 1 }}
          edges={["top", "bottom", "left", "right"]}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 8,
            }}
          >
            <View style={{ width: 68 }}>
              <StageAction
                icon="close-outline"
                label="Back"
                disabled={task.busy}
                onPress={() =>
                  router.replace({
                    pathname: "/draft/[id]",
                    params: { id: draftId },
                  })
                }
              />
            </View>
            <Label
              accessibilityRole="header"
              style={{
                flex: 1,
                textAlign: "center",
                color: "#FFFFFF",
                fontWeight: "600",
              }}
            >
              Adjust crop
            </Label>
            <View style={{ width: 68 }}>
              <StageAction
                icon="scan-outline"
                label="Auto"
                disabled={task.busy || !hasEngine}
                onPress={autoDetect}
              />
            </View>
          </View>
          {sized ? (
            <CropEditor
              uri={uri}
              ratio={ratio}
              corners={corners}
              onChange={setCorners}
              disabled={task.busy}
            />
          ) : (
            <View
              style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
            >
              <Label style={{ color: "#C9D8EE", textAlign: "center" }}>
                Opening your page…
              </Label>
            </View>
          )}
          <View style={{ paddingHorizontal: 16, paddingTop: 8, gap: 12 }}>
            <Label
              accessibilityLiveRegion="polite"
              style={{
                color: "#C9D8EE",
                fontSize: 12,
                textAlign: "center",
              }}
            >
              {task.busy
                ? task.progress
                : "Drag the corners or edges onto the page. Drag inside the frame to move it."}
            </Label>
            {fine && (
              <View style={{ gap: 8 }}>
                <View style={{ flexDirection: "row", gap: 6 }}>
                  {["Top left", "Top right", "Bottom right", "Bottom left"].map(
                    (label, index) => (
                      <Pressable
                        key={label}
                        accessibilityRole="radio"
                        accessibilityLabel={label}
                        accessibilityState={{ selected: corner === index }}
                        onPress={() => setCorner(index)}
                        style={{
                          flex: 1,
                          minHeight: 44,
                          alignItems: "center",
                          justifyContent: "center",
                          paddingHorizontal: 4,
                          borderRadius: 10,
                          borderWidth: 1,
                          borderColor:
                            corner === index ? "#17D7FF" : "#26364C",
                          backgroundColor:
                            corner === index ? "#0E2A4A" : "transparent",
                        }}
                      >
                        <Label
                          style={{
                            color: "#FFFFFF",
                            fontSize: 11,
                            lineHeight: 15,
                            textAlign: "center",
                          }}
                        >
                          {label}
                        </Label>
                      </Pressable>
                    ),
                  )}
                </View>
                <View style={{ flexDirection: "row" }}>
                  <StageAction
                    icon="chevron-back"
                    label="Left"
                    onPress={() => nudge(-STEP, 0)}
                  />
                  <StageAction
                    icon="chevron-forward"
                    label="Right"
                    onPress={() => nudge(STEP, 0)}
                  />
                  <StageAction
                    icon="chevron-up"
                    label="Up"
                    onPress={() => nudge(0, -STEP)}
                  />
                  <StageAction
                    icon="chevron-down"
                    label="Down"
                    onPress={() => nudge(0, STEP)}
                  />
                </View>
              </View>
            )}
            <View style={{ flexDirection: "row" }}>
              <StageAction
                icon="return-up-back-outline"
                label="Rotate left"
                disabled={task.busy}
                onPress={() => void rotate(-90)}
              />
              <StageAction
                icon="return-up-forward-outline"
                label="Rotate right"
                disabled={task.busy}
                onPress={() => void rotate(90)}
              />
              <StageAction
                icon="expand-outline"
                label="Select all"
                disabled={task.busy}
                onPress={() => setCorners(defaultCorners())}
              />
              <StageAction
                icon="options-outline"
                label={fine ? "Hide adjust" : "Fine adjust"}
                onPress={() => setFine(!fine)}
              />
            </View>
            <Button
              title="Crop & enhance"
              disabled={task.busy || !hasEngine || !sized}
              onPress={() => edit(true)}
            />
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Button
                  title="Crop only"
                  secondary
                  disabled={task.busy || !hasEngine || !sized}
                  onPress={() => edit()}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  title="More tools"
                  secondary
                  disabled={task.busy}
                  onPress={() => setMode("redact")}
                />
              </View>
            </View>
            {!hasEngine && (
              <Label
                style={{
                  color: "#C9D8EE",
                  fontSize: 12,
                  textAlign: "center",
                }}
              >
                {engineRequirement}
              </Label>
            )}
          </View>
        </SafeAreaView>
      </View>
    );
  return (
    <WorkspaceScreen
      title="Review your page"
      subtitle="Your capture is already saved in its draft."
    >
      <TaskStatus task={task} />
      {original && page && <Button title="Restore original photo" secondary disabled={task.busy} onPress={() => void task.run(async () => { await replacePage(page, original); const next = (await listPages(draftId)).find(p => p.id === pageId)!; setPage(next); setUri(pageUri(next)); setCorners([0,0,1,0,1,1,0,1]); })} />}
      {uri && (
        <>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {(["crop", "redact", "book"] as const).map((value) => (
              <View style={{ flex: 1 }} key={value}>
                <Button
                  title={value}
                  secondary={mode !== value}
                  disabled={task.busy}
                  onPress={() => {
                    setMode(value);
                    setStart(undefined);
                  }}
                />
              </View>
            ))}
          </View>
          <View
            onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
            style={{ width: "100%" }}
          >
            <View
              onStartShouldSetResponder={() => !task.busy && mode === "redact"}
              onResponderRelease={(e) =>
                tap(e.nativeEvent.locationX, e.nativeEvent.locationY)
              }
              accessibilityLabel="Page preview. In redaction mode, tap opposite corners of each region to remove."
              style={{
                height: width / ratio,
                backgroundColor: "#FFF",
                overflow: "hidden",
              }}
            >
              <View
                pointerEvents="none"
                style={{ width: "100%", height: "100%" }}
              >
                <Image
                  source={{ uri }}
                  style={{ width: "100%", height: "100%" }}
                />
              </View>
              {mode === "redact" &&
                boxes.map((box, i) => (
                  <View
                    pointerEvents="none"
                    key={i}
                    style={{
                      position: "absolute",
                      left: box[0] * width,
                      top: (box[1] * width) / ratio,
                      width: box[2] * width,
                      height: (box[3] * width) / ratio,
                      backgroundColor: "black",
                    }}
                  />
                ))}
            </View>
          </View>
          {!hasEngine && (
            <Card>
              <Label>{engineRequirement}</Label>
            </Card>
          )}
          <Button
            title="Check scan quality"
            secondary
            disabled={task.busy || !hasEngine}
            onPress={() => task.run(checkQuality)}
          />
          {issues.map((issue) => (
            <Label key={issue}>{issue}</Label>
          ))}
          {mode === "redact" && (
            <>
              <Label>
                {start
                  ? "Tap the opposite corner to finish the black region."
                  : "Tap two opposite corners around each area to remove."}
              </Label>
              <Label>
                Include a margin around every character. Applied regions
                permanently replace pixels in this draft; the original library
                file is unchanged. Export an image-only PDF and inspect it
                before sharing.
              </Label>
              <Button
                title="Undo region"
                secondary
                disabled={!boxes.length || task.busy}
                onPress={() => setBoxes((old) => old.slice(0, -1))}
              />
              <Button
                title="Apply permanent redactions"
                disabled={!boxes.length || task.busy || !hasEngine}
                onPress={() =>
                  Alert.alert(
                    "Permanently remove these pixels?",
                    "Review every region first. This updates the draft page and exports no original text layer.",
                    [
                      { text: "Review", style: "cancel" },
                      {
                        text: "Apply",
                        style: "destructive",
                        onPress: () => edit(),
                      },
                    ],
                  )
                }
              />
            </>
          )}
          {mode === "book" && (
            <>
              <Field
                label="Spine position (%) · 20–80"
                value={split}
                onChangeText={setSplit}
                numeric
              />
              <Field
                label="Manual curve correction (%) · −18 to 18"
                value={curve}
                onChangeText={setCurve}
                numeric
              />
              <Button
                secondary
                title={
                  rtl
                    ? "Reading order: right to left"
                    : "Reading order: left to right"
                }
                onPress={() => setRtl(!rtl)}
              />
              <Label>
                Manual bow correction is for gently curved pages. Preview the
                result; complex folds and warped text may need a flatter rescan.
              </Label>
              <Button
                title="Preview split pages"
                disabled={task.busy || !hasEngine}
                onPress={() =>
                  task.run(async (signal) => {
                    const result = await runEngine(
                      "book",
                      {
                        uri,
                        split: Number(split) / 100,
                        curve: Number(curve) / 100,
                        rtl,
                      },
                      { signal },
                    );
                    cleanPreview.current?.();
                    cleanPreview.current = result.clean;
                    setPreviews(result.uris!);
                  })
                }
              />
              {previews.map((source) => (
                <Image
                  key={source}
                  source={{ uri: source }}
                  resizeMode="contain"
                  style={{ height: 260, width: "100%" }}
                />
              ))}
              {!!previews.length && (
                <Button
                  title="Replace spread with these two pages"
                  disabled={task.busy}
                  onPress={() =>
                    task.run(async () => {
                      await splitPage(page!, previews);
                      router.replace({
                        pathname: "/draft/[id]",
                        params: { id: draftId },
                      });
                    })
                  }
                />
              )}
            </>
          )}
        </>
      )}
      <Button
        title="Save page as image"
        secondary
        disabled={!uri || task.busy}
        onPress={() =>
          task.run(async () => {
            const saved = await importFile(
              uri,
              `Scan_${Date.now()}.${page!.path.split(".").pop()}`,
              "camera",
            );
            await refresh();
            router.push({
              pathname: "/document/[id]",
              params: { id: saved.id },
            });
          })
        }
      />
      <Button
        title="Review all pages"
        secondary
        disabled={task.busy}
        onPress={() =>
          router.replace({ pathname: "/draft/[id]", params: { id: draftId } })
        }
      />
      <Button
        title="Capture next page"
        disabled={task.busy}
        onPress={() =>
          router.replace({ pathname: "/scanner", params: { draftId } })
        }
      />
    </WorkspaceScreen>
  );
}
