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
  rasterNotice,
  withRenderedPages,
} from "../src/features/pdf/operations";
import {
  formatPages,
  splitPlan,
  type SplitMode,
} from "../src/features/pdf/pages.mjs";
import { runEngine } from "../src/services/engine";
import { storePdf } from "../src/services/workspace";
import { useDocuments } from "../src/features/documents/provider";
import { useTheme } from "../src/theme/provider";
import { timestampName } from "../src/utils/files.mjs";

export default function Split() {
  const { colors } = useTheme();
  const { refresh } = useDocuments();
  const [document, setDocument] = useState<LocalDocument>();
  const [count, setCount] = useState<number | null>();
  const [mode, setMode] = useState<SplitMode>("extract");
  const [value, setValue] = useState("1-2");
  const [saved, setSaved] = useState<string[]>([]);
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

  // The plan is recomputed from the same pure function the export uses, so the
  // preview can never disagree with what is written.
  let plan: { suffix: string; pages: number[] }[] = [];
  let planError = "";
  if (count) {
    try {
      plan = splitPlan(count, mode, value);
    } catch (error) {
      planError = error instanceof Error ? error.message : "Check these values.";
    }
  }
  const totalPages = plan.reduce((sum, part) => sum + part.pages.length, 0);
  const overLimit = totalPages > PAGE_LIMIT;

  return (
    <WorkspaceScreen
      title="Split PDF"
      subtitle="Extract pages or break a document into parts."
      native
    >
      <DocumentPicker
        title="Choose document"
        value={document}
        onSelect={(selected) => {
          if (task.busy) return;
          setDocument(selected);
          setSaved([]);
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
          <Label style={{ color: colors.secondary, fontSize: 13 }}>
            {count} {count === 1 ? "page" : "pages"}
          </Label>
          <SegmentedControl<SplitMode>
            label="How to split"
            value={mode}
            options={[
              { value: "extract", title: "Extract pages" },
              { value: "every", title: "Every N pages" },
              { value: "single", title: "Each page" },
            ]}
            onChange={(next) => {
              if (task.busy) return;
              setMode(next);
              setValue(next === "every" ? "2" : "1-2");
              setSaved([]);
            }}
          />
          {mode === "extract" && (
            <Field
              label="Pages to keep"
              value={value}
              onChangeText={setValue}
            />
          )}
          {mode === "every" && (
            <Field
              label="Pages per file"
              value={value}
              onChangeText={setValue}
              numeric
            />
          )}
          {planError ? (
            <Label style={{ fontSize: 13 }}>{planError}</Label>
          ) : (
            <Card style={{ gap: 6 }}>
              <Label style={{ fontWeight: "600" }}>
                {plan.length} {plan.length === 1 ? "new file" : "new files"}
              </Label>
              {plan.slice(0, 8).map((part, index) => (
                <Label
                  key={part.suffix + index}
                  style={{ fontSize: 13, color: colors.secondary }}
                >
                  {`Part ${index + 1} · ${formatPages(part.pages)}`}
                </Label>
              ))}
              {plan.length > 8 && (
                <Label style={{ fontSize: 13, color: colors.secondary }}>
                  {`and ${plan.length - 8} more`}
                </Label>
              )}
            </Card>
          )}
          {overLimit && (
            <Label style={{ fontSize: 13 }}>
              {`This would process ${totalPages} pages. Work in batches of ${PAGE_LIMIT} or fewer.`}
            </Label>
          )}
        </>
      )}
      <Label style={{ fontSize: 13 }}>{rasterNotice}</Label>
      <TaskStatus task={task} />
      <Button
        title={plan.length > 1 ? `Create ${plan.length} PDFs` : "Create PDF"}
        disabled={!document || !count || !plan.length || !!planError || task.busy || overLimit}
        onPress={() =>
          task.run(async (signal, progress) => {
            const base = timestampName("Split", "pdf").replace(/\.pdf$/, "");
            const created: string[] = [];
            try {
              for (let index = 0; index < plan.length; index++) {
                if (signal.aborted) break;
                const part = plan[index];
                progress(`Creating file ${index + 1} of ${plan.length}`);
                await withRenderedPages(
                  [{ document: document!, pages: part.pages }],
                  signal,
                  progress,
                  async (uris) => {
                    const output = await runEngine(
                      "pdf",
                      { uris },
                      { signal, progress },
                    );
                    try {
                      const file = await storePdf(
                        output.uri!,
                        `${base}_${part.suffix}.pdf`,
                        uris.length,
                      );
                      created.push(file.name);
                    } finally {
                      output.clean();
                    }
                  },
                );
              }
            } finally {
              // Files already written stay in the library even if a later part
              // fails or the user cancels.
              if (created.length) {
                await refresh();
                setSaved(created);
              }
            }
          })
        }
      />
      {saved.length > 0 && (
        <Card style={{ gap: 12 }}>
          <Label style={{ fontWeight: "600" }}>
            {`Saved ${saved.length} ${saved.length === 1 ? "file" : "files"}`}
          </Label>
          <Label style={{ fontSize: 13, color: colors.secondary }}>
            The original document is unchanged.
          </Label>
          <Button
            title="Open Documents"
            onPress={() => router.push("/(tabs)/documents")}
          />
        </Card>
      )}
    </WorkspaceScreen>
  );
}
