import { useEffect, useRef, useState } from "react";
import { Alert, Image, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Button, Card, Label } from "../src/components/ui";
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
export default function PageEditor() {
  const { draftId, pageId } = useLocalSearchParams<{
    draftId: string;
    pageId: string;
  }>();
  const [page, setPage] = useState<DraftPage>();
  const [uri, setUri] = useState("");
  const [ratio, setRatio] = useState(0.75);
  const [width, setWidth] = useState(300);
  const [mode, setMode] = useState<"crop" | "redact" | "book">("crop");
  const [corners, setCorners] = useState([0, 0, 1, 0, 1, 1, 0, 1]);
  const [corner, setCorner] = useState(0);
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
  useEffect(() => {
    if (uri)
      Image.getSize(
        uri,
        (w, h) => setRatio(w / h),
        () => {},
      );
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
    if (mode === "crop") {
      setCorners((old) =>
        old.map((v, i) =>
          i === corner * 2 ? nx : i === corner * 2 + 1 ? ny : v,
        ),
      );
    } else if (mode === "redact") {
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
  return (
    <WorkspaceScreen
      title="Review your page"
      subtitle="Your capture is already saved in its draft."
    >
      <TaskStatus task={task} />
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
              onStartShouldSetResponder={() => !task.busy && mode !== "book"}
              onResponderRelease={(e) =>
                tap(e.nativeEvent.locationX, e.nativeEvent.locationY)
              }
              accessibilityLabel="Page preview. Select a crop corner then tap its new position; in redaction mode tap opposite corners of a region."
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
              {mode === "crop" &&
                corners
                  .filter((_, i) => i % 2 === 0)
                  .map((_, i) => (
                    <View
                      pointerEvents="none"
                      key={i}
                      style={{
                        position: "absolute",
                        left: corners[i * 2] * width - 12,
                        top: corners[i * 2 + 1] * (width / ratio) - 12,
                        width: 24,
                        height: 24,
                        borderRadius: 12,
                        backgroundColor: "#075FE4",
                        borderWidth: 2,
                        borderColor: "white",
                      }}
                    />
                  ))}
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
          {mode === "crop" && (
            <>
              <Label>
                Choose a corner, then tap its position on the page. Perspective
                correction uses all four corners.
              </Label>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {["Top left", "Top right", "Bottom right", "Bottom left"].map(
                  (label, i) => (
                    <Button
                      key={label}
                      title={label}
                      secondary={corner !== i}
                      onPress={() => setCorner(i)}
                    />
                  ),
                )}
              </View>
              <Button
                title="Reset corners"
                secondary
                onPress={() => setCorners([0, 0, 1, 0, 1, 1, 0, 1])}
              />
              <Button
                title="Apply crop"
                disabled={task.busy || !hasEngine}
                onPress={() => edit()}
              />
              <Button
                title="Crop & enhance contrast"
                disabled={task.busy || !hasEngine}
                secondary
                onPress={() => edit(true)}
              />
            </>
          )}
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
              `Scan_${Date.now()}.jpg`,
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
