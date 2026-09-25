import { useEffect, useState } from "react";
import { File } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { hasEngine, runEngine } from "../../services/engine";
import { thumbsDir } from "../../services/database";
import { documentUri } from "../../services/storage";
import type { LocalDocument } from "../../types/document";

// First-page previews for PDFs, so the library shows what a document looks
// like instead of a generic icon. Rendering is serialised through one queue:
// a list can mount dozens of cards at once, and the engine should draw one
// page at a time rather than compete with whatever the user is doing. Each
// preview is downscaled before it is kept, so the cache stays small and
// decoding stays cheap. It lives in the cache directory and is simply drawn
// again if the OS clears it. Two sizes exist: "card" for list rows and "page"
// for the document screen, where a card-sized image would be visibly soft.
export type PreviewSize = "card" | "grid" | "page";
const WIDTHS: Record<PreviewSize, number> = { card: 320, grid: 640, page: 1200 };
const known = new Map<string, string>();
let queue: Promise<unknown> = Promise.resolve();

// Every cache file for a document starts with its id and a dot, which is how
// deleteDocumentForever finds them all.
function previewFile(id: string, size: PreviewSize, page: number) {
  const name =
    size === "card"
      ? `${id}.jpg`
      : size === "grid"
        ? `${id}.g${page}.jpg`
        : page === 0
          ? `${id}.page.jpg`
          : `${id}.p${page}.jpg`;
  return new File(thumbsDir, name);
}

async function renderPreview(
  document: LocalDocument,
  size: PreviewSize,
  index: number,
) {
  const target = previewFile(document.id, size, index);
  if (target.exists) return target.uri;
  const page = await runEngine("render", {
    uri: documentUri(document),
    page: index,
  });
  try {
    if (!page.uri) throw new Error("No preview produced.");
    const context = ImageManipulator.manipulate(page.uri);
    context.resize({ width: WIDTHS[size] });
    const image = await context.renderAsync();
    try {
      const saved = await image.saveAsync({
        format: SaveFormat.JPEG,
        compress: size === "card" ? 0.82 : 0.88,
      });
      thumbsDir.create({ idempotent: true, intermediates: true });
      await new File(saved.uri).move(target);
    } finally {
      image.release();
      context.release();
    }
    return target.uri;
  } finally {
    page.clean();
  }
}

/** Drops in-memory previews after a document's file changed (pages added). */
export function forgetPreviews(id: string) {
  for (const key of [...known.keys()])
    if (key.startsWith(`${id}:`)) known.delete(key);
}

/**
 * The image to show for a document: the file itself for images, a cached
 * first-page render for PDFs, or undefined while none is available yet (or
 * ever, when the native engine is absent). Failures fall back to the icon.
 */
export function usePreview(
  document: LocalDocument,
  size: PreviewSize = "card",
  page = 0,
) {
  const key = `${document.id}:${size}:${page}`;
  const [uri, setUri] = useState<string | undefined>(() =>
    document.kind === "image" ? documentUri(document) : known.get(key),
  );
  useEffect(() => {
    if (document.kind === "image") {
      setUri(documentUri(document));
      return;
    }
    const cached = known.get(key);
    if (cached) {
      setUri(cached);
      return;
    }
    if (!hasEngine) return;
    let active = true;
    queue = queue
      .then(() => renderPreview(document, size, page))
      .then(
        (result) => {
          known.set(key, result);
          if (active) setUri(result);
        },
        () => {},
      );
    return () => {
      active = false;
    };
  }, [document.id, document.kind, document.path, key, size, page]);
  return uri;
}
