import type { LocalDocument } from "../../types/document";
import { documentUri } from "../../services/storage";
import { runEngine } from "../../services/engine";
import { saveText } from "../../services/workspace";

export async function withDocumentPages<T>(
  document: LocalDocument,
  signal: AbortSignal,
  progress: (message: string) => void,
  work: (uris: string[]) => Promise<T>,
): Promise<T> {
  if (document.kind === "image") return work([documentUri(document)]);
  const info = await runEngine(
    "pdfInfo",
    { uri: documentUri(document) },
    { signal },
  );
  const count = info.pages!;
  info.clean();
  if (count > 300)
    throw new Error("Split documents longer than 300 pages before processing.");
  const cleanups: (() => void)[] = [];
  const uris: string[] = [];
  try {
    for (let page = 0; page < count; page++) {
      if (signal.aborted) throw new Error("Cancelled");
      progress(`Preparing page ${page + 1} of ${count}`);
      const image = await runEngine(
        "render",
        { uri: documentUri(document), page },
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
export type OcrLayout = "auto" | "block" | "column" | "line" | "sparse";
export type OcrOptions = {
  layout?: OcrLayout;
  preprocess?: boolean;
  deskew?: boolean;
  autoRotate?: boolean;
};
export async function recognizeDocument(
  document: LocalDocument,
  signal: AbortSignal,
  progress: (message: string) => void,
  options: OcrOptions = {},
) {
  return withDocumentPages(document, signal, progress, async (uris) => {
    const texts: string[] = [];
    let confidence = 0;
    let rotated = 0;
    for (let index = 0; index < uris.length; index++) {
      progress(`Reading page ${index + 1} of ${uris.length} · English OCR`);
      const result = await runEngine(
        "ocr",
        { uri: uris[index], ...options },
        { signal },
      );
      try {
        texts.push(result.text || "");
        confidence += result.confidence || 0;
        if (result.rotation) rotated++;
      } finally {
        result.clean();
      }
    }
    if (signal.aborted) throw new Error("Cancelled");
    const text = texts.join("\n\n");
    await saveText(document.id, text);
    return {
      text,
      confidence: confidence / Math.max(1, uris.length),
      rotated,
      pages: uris.length,
    };
  });
}
