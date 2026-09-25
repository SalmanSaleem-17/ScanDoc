import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Button, Card, IconButton, Label } from "../src/components/ui";
import {
  DocumentPicker,
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
import { runEngine } from "../src/services/engine";
import { storePdf } from "../src/services/workspace";
import { useDocuments } from "../src/features/documents/provider";
import { useTheme } from "../src/theme/provider";
import { useAds } from "../src/features/ads/provider";
import { formatBytes, timestampName } from "../src/utils/files.mjs";

type Entry = { key: string; document: LocalDocument };

export default function Merge() {
  const { colors } = useTheme();
  const { documents, refresh } = useDocuments();
  // Opened from a selection in Documents: those files are the starting list,
  // in the order they were selected. Anything since trashed is skipped.
  const { ids } = useLocalSearchParams<{ ids?: string }>();
  const [entries, setEntries] = useState<Entry[]>(() =>
    (ids ? ids.split(",") : [])
      .map((id) => documents.find((d) => d.id === id && !d.trashedAt))
      .filter((d): d is LocalDocument => !!d)
      .map((document, index) => ({ key: `${document.id}-${index}`, document })),
  );
  const [counts, setCounts] = useState<Record<string, number | null>>({});
  const [result, setResult] = useState<{
    id: string;
    size: number;
    pages: number;
  }>();
  const requested = useRef(new Set<string>());
  const nextKey = useRef(entries.length);
  const task = useTask();
  const ads = useAds();

  // Page counts come from the PDF itself: the library row may not have one, and
  // a count is never guessed. Unreadable files are reported, not defaulted.
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      for (const entry of entries) {
        const id = entry.document.id;
        if (requested.current.has(id)) continue;
        requested.current.add(id);
        try {
          const count = await pageCountOf(entry.document, controller.signal);
          if (!controller.signal.aborted)
            setCounts((current) => ({ ...current, [id]: count }));
        } catch {
          if (!controller.signal.aborted)
            setCounts((current) => ({ ...current, [id]: null }));
        }
      }
    })();
    return () => controller.abort();
  }, [entries]);

  const total = entries.reduce(
    (sum, entry) => sum + (counts[entry.document.id] || 0),
    0,
  );
  const pending = entries.filter(
    (entry) => counts[entry.document.id] === undefined,
  ).length;
  const unreadable = entries.some(
    (entry) => counts[entry.document.id] === null,
  );

  function move(index: number, delta: number) {
    setEntries((current) => {
      const next = [...current];
      const target = index + delta;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  return (
    <WorkspaceScreen
      title="Merge PDFs"
      subtitle="Combine documents into one file, in your order."
      native
      premium="merge"
    >
      <DocumentPicker
        title="Add a document"
        onSelect={(document) => {
          if (task.busy) return;
          setResult(undefined);
          setEntries((current) => [
            ...current,
            { key: `${document.id}-${nextKey.current++}`, document },
          ]);
        }}
      />
      {entries.map((entry, index) => (
        <Card key={entry.key} style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
          <Label style={{ color: colors.secondary, minWidth: 22 }}>
            {index + 1}
          </Label>
          <View style={{ flex: 1 }}>
            <Label numberOfLines={2} style={{ fontWeight: "600" }}>
              {entry.document.name}
            </Label>
            <Label style={{ fontSize: 12, color: colors.secondary }}>
              {counts[entry.document.id] === undefined
                ? "Counting pages…"
                : counts[entry.document.id] === null
                  ? "Page count unavailable"
                  : `${counts[entry.document.id]} ${counts[entry.document.id] === 1 ? "page" : "pages"}`}
              {" · "}
              {formatBytes(entry.document.size)}
            </Label>
          </View>
          <IconButton
            name="arrow-up-outline"
            label={`Move ${entry.document.name} up`}
            onPress={() => !task.busy && move(index, -1)}
          />
          <IconButton
            name="arrow-down-outline"
            label={`Move ${entry.document.name} down`}
            onPress={() => !task.busy && move(index, 1)}
          />
          <IconButton
            name="trash-outline"
            label={`Remove ${entry.document.name}`}
            onPress={() =>
              !task.busy &&
              setEntries((current) =>
                current.filter((item) => item.key !== entry.key),
              )
            }
          />
        </Card>
      ))}
      {entries.length > 0 && (
        <Label style={{ color: colors.secondary, fontSize: 13 }}>
          {total} {total === 1 ? "page" : "pages"} from {entries.length}{" "}
          {entries.length === 1 ? "document" : "documents"}
          {pending > 0 ? `, plus ${pending} still being read` : ""}.
        </Label>
      )}
      {unreadable && (
        <Label style={{ color: colors.secondary, fontSize: 13 }}>
          One document could not be read. Remove it, or unlock it and import it
          again, before merging.
        </Label>
      )}
      {total > PAGE_LIMIT && (
        <Label style={{ color: colors.secondary, fontSize: 13 }}>
          Merging is limited to {PAGE_LIMIT} pages. Remove a document or merge
          in batches.
        </Label>
      )}
      <Label style={{ fontSize: 13 }}>{rasterNotice}</Label>
      <TaskStatus task={task} />
      <Button
        title="Merge into one PDF"
        disabled={
          entries.length < 2 ||
          task.busy ||
          unreadable ||
          pending > 0 ||
          total > PAGE_LIMIT
        }
        onPress={() =>
          task.run(async (signal, progress) => {
            await withRenderedPages(
              entries.map((entry) => ({ document: entry.document })),
              signal,
              progress,
              async (uris) => {
                const output = await runEngine(
                  "pdf",
                  { uris, watermark: ads.pdfWatermark },
                  { signal, progress },
                );
                try {
                  const saved = await storePdf(
                    output.uri!,
                    timestampName("Merged", "pdf"),
                    uris.length,
                  );
                  await refresh();
                  setResult({
                    id: saved.id,
                    size: saved.size,
                    pages: uris.length,
                  });
                } finally {
                  output.clean();
                }
              },
            );
          })
        }
      />
      {result && (
        <Card style={{ gap: 12 }}>
          <Label style={{ fontWeight: "600" }}>
            Merged {result.pages} {result.pages === 1 ? "page" : "pages"} ·{" "}
            {formatBytes(result.size)}
          </Label>
          <Label style={{ fontSize: 13, color: colors.secondary }}>
            The documents you merged are unchanged in your library.
          </Label>
          <Button
            title="Open / share result"
            onPress={() =>
              router.push({
                pathname: "/document/[id]",
                params: { id: result.id },
              })
            }
          />
        </Card>
      )}
    </WorkspaceScreen>
  );
}
