import type { LocalDocument } from "../../types/document";
import { documentUri } from "../../services/storage";
import { runEngine } from "../../services/engine";

// The native PDF writer streams one JPEG at a time and is bounded to 300 pages.
export const PAGE_LIMIT = 300;

export type Selection = { document: LocalDocument; pages?: number[] };

export async function pageCountOf(
  document: LocalDocument,
  signal: AbortSignal,
) {
  if (document.kind === "image") return 1;
  const info = await runEngine(
    "pdfInfo",
    { uri: documentUri(document) },
    { signal },
  );
  try {
    return info.pages ?? 0;
  } finally {
    info.clean();
  }
}

// Renders only the requested pages to temporary files and hands their URIs to
// `work`. Pages are rendered one at a time so peak memory does not grow with
// document length, and every temporary file is removed even when `work` throws.
export async function withRenderedPages<T>(
  selections: Selection[],
  signal: AbortSignal,
  progress: (message: string) => void,
  work: (uris: string[]) => Promise<T>,
): Promise<T> {
  const plan: { uri: string; page: number | null }[] = [];
  for (const selection of selections) {
    if (signal.aborted) throw new Error("Cancelled");
    const uri = documentUri(selection.document);
    if (selection.document.kind === "image") {
      plan.push({ uri, page: null });
      continue;
    }
    const count = await pageCountOf(selection.document, signal);
    if (count < 1)
      throw new Error("Could not read the pages in this PDF.");
    const pages = selection.pages ?? Array.from({ length: count }, (_, i) => i + 1);
    for (const page of pages) {
      if (page < 1 || page > count)
        throw new Error(`This document has ${count} pages.`);
      plan.push({ uri, page: page - 1 });
    }
  }
  if (!plan.length) throw new Error("Choose at least one page.");
  if (plan.length > PAGE_LIMIT)
    throw new Error(
      `This would process ${plan.length} pages. Work in batches of ${PAGE_LIMIT} or fewer.`,
    );
  const cleanups: (() => void)[] = [];
  const uris: string[] = [];
  try {
    for (let index = 0; index < plan.length; index++) {
      if (signal.aborted) throw new Error("Cancelled");
      const step = plan[index];
      if (step.page === null) {
        uris.push(step.uri);
        continue;
      }
      progress(`Preparing page ${index + 1} of ${plan.length}`);
      const image = await runEngine(
        "render",
        { uri: step.uri, page: step.page },
        { signal },
      );
      cleanups.push(image.clean);
      uris.push(image.uri!);
    }
    return await work(uris);
  } finally {
    cleanups.forEach((clean) => clean());
  }
}

// Every PDF this app writes is image-only: pages are rasterised and re-encoded.
// Screens show this wording so the trade-off is never a surprise after export.
export const rasterNotice =
  "Pages are re-rendered as images. Selectable text, links, forms, signatures and accessibility tags are not preserved. Your original files stay untouched.";
