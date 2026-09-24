import { useEffect, useState } from "react";
import { router } from "expo-router";
import { Button, Card, Label, SegmentedControl } from "../src/components/ui";
import {
  DocumentPicker,
  Field,
  TaskStatus,
  useTask,
  WorkspaceScreen,
} from "../src/features/workflows/components";
import type { LocalDocument } from "../src/types/document";
import {
  PAGE_LIMIT,
  pageCountOf,
  withRenderedPages,
} from "../src/features/pdf/operations";
import { formatPages, parsePageRanges } from "../src/features/pdf/pages.mjs";
import { importFile } from "../src/services/storage";
import { useDocuments } from "../src/features/documents/provider";
import { useTheme } from "../src/theme/provider";
import { sequenceName, timestampName } from "../src/utils/files.mjs";

export default function PdfToImage() {
  const { colors } = useTheme();
  const { refresh } = useDocuments();
  const [document, setDocument] = useState<LocalDocument>();
  const [count, setCount] = useState<number | null>();
  const [scope, setScope] = useState<"all" | "some">("all");
  const [value, setValue] = useState("1-2");
  const [saved, setSaved] = useState<{ files: number; failed: number }>();
  const task = useTask();

  useEffect(() => {
    if (!document) return;
    const controller = new AbortController();
    setCount(undefined);
    void pageCountOf(document, controller.signal)
      .then((pages) => !controller.signal.aborted && setCount(pages))
      .catch(() => !controller.signal.aborted && setCount(null));
    return () => controller.abort();
  }, [document]);

  let pages: number[] = [];
  let pageError = "";
  if (count) {
    if (scope === "all")
      pages = Array.from({ length: count }, (_, index) => index + 1);
    else
      try {
        pages = parsePageRanges(value, count);
      } catch (error) {
        pageError = error instanceof Error ? error.message : "Check these pages.";
      }
  }
  const overLimit = pages.length > PAGE_LIMIT;

  return (
    <WorkspaceScreen
      title="PDF to images"
      subtitle="Save pages as JPEG files in your library."
      native
    >
      <DocumentPicker
        title="Choose document"
        value={document}
        onSelect={(selected) => {
          if (task.busy) return;
          setDocument(selected);
          setSaved(undefined);
        }}
      />
      {document && count === undefined && (
        <Label style={{ color: colors.secondary, fontSize: 13 }}>
          Reading pages…
        </Label>
      )}
      {document && count === null && (
        <Label style={{ fontSize: 13 }}>
          Could not read this PDF. It may be damaged or password protected.
          Unlock it and import it again.
        </Label>
      )}
      {!!count && (
        <>
          <SegmentedControl<"all" | "some">
            label="Pages to export"
            value={scope}
            options={[
              { value: "all", title: `All ${count}` },
              { value: "some", title: "Chosen pages" },
            ]}
            onChange={(next) => {
              if (task.busy) return;
              setScope(next);
              setSaved(undefined);
            }}
          />
          {scope === "some" && (
            <Field label="Pages" value={value} onChangeText={setValue} />
          )}
          {pageError ? (
            <Label style={{ fontSize: 13 }}>{pageError}</Label>
          ) : (
            <Label style={{ color: colors.secondary, fontSize: 13 }}>
              {`${pages.length} ${pages.length === 1 ? "image" : "images"} · pages ${formatPages(pages)}`}
            </Label>
          )}
          {overLimit && (
            <Label style={{ fontSize: 13 }}>
              {`This would export ${pages.length} pages. Work in batches of ${PAGE_LIMIT} or fewer.`}
            </Label>
          )}
        </>
      )}
      <Label style={{ fontSize: 13 }}>
        Each page is rendered at up to 1800 pixels on its longest edge and saved
        as a JPEG. The PDF you choose is not modified.
      </Label>
      <TaskStatus task={task} />
      <Button
        title="Save pages as images"
        disabled={
          !document || !count || !pages.length || !!pageError || task.busy || overLimit
        }
        onPress={() =>
          task.run(async (signal, progress) => {
            const base = timestampName("Page", "jpg").replace(/\.jpg$/, "");
            let files = 0;
            let failed = 0;
            try {
              // One page is rendered, copied and released at a time, so a long
              // document never holds many full-size images at once.
              for (let index = 0; index < pages.length; index++) {
                if (signal.aborted) break;
                progress(`Saving image ${index + 1} of ${pages.length}`);
                try {
                  await withRenderedPages(
                    [{ document: document!, pages: [pages[index]] }],
                    signal,
                    () => {},
                    async (uris) => {
                      await importFile(
                        uris[0],
                        sequenceName(base, pages[index], count!, "jpg"),
                      );
                      files++;
                    },
                  );
                } catch {
                  // A single unreadable page must not discard the rest.
                  if (signal.aborted) break;
                  failed++;
                }
              }
            } finally {
              if (files) await refresh();
              if (files || failed) setSaved({ files, failed });
            }
          })
        }
      />
      {saved && (
        <Card style={{ gap: 12 }}>
          <Label style={{ fontWeight: "600" }}>
            {`Saved ${saved.files} ${saved.files === 1 ? "image" : "images"}`}
          </Label>
          {saved.failed > 0 && (
            <Label style={{ fontSize: 13 }}>
              {`${saved.failed} ${saved.failed === 1 ? "page" : "pages"} could not be exported. The rest were saved.`}
            </Label>
          )}
          <Button
            title="Open Documents"
            onPress={() => router.push("/(tabs)/documents")}
          />
        </Card>
      )}
    </WorkspaceScreen>
  );
}
