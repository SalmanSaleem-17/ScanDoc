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
// preview is downscaled to card size before it is kept, so the cache stays
// small and decoding stays cheap. It lives in the cache directory and is
// simply drawn again if the OS clears it.
const PREVIEW_WIDTH = 320;
const known = new Map<string, string>();
let queue: Promise<unknown> = Promise.resolve();

function previewFile(id: string) {
  return new File(thumbsDir, `${id}.jpg`);
}

async function renderPreview(document: LocalDocument) {
  const target = previewFile(document.id);
  if (target.exists) return target.uri;
  const page = await runEngine("render", {
    uri: documentUri(document),
    page: 0,
  });
  try {
    if (!page.uri) throw new Error("No preview produced.");
    const context = ImageManipulator.manipulate(page.uri);
    context.resize({ width: PREVIEW_WIDTH });
    const image = await context.renderAsync();
    try {
      const saved = await image.saveAsync({
        format: SaveFormat.JPEG,
        compress: 0.82,
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

/**
 * The image to show for a document: the file itself for images, a cached
 * first-page render for PDFs, or undefined while none is available yet (or
 * ever, when the native engine is absent). Failures fall back to the icon.
 */
export function usePreview(document: LocalDocument) {
  const [uri, setUri] = useState<string | undefined>(() =>
    document.kind === "image" ? documentUri(document) : known.get(document.id),
  );
  useEffect(() => {
    if (document.kind === "image") {
      setUri(documentUri(document));
      return;
    }
    const cached = known.get(document.id);
    if (cached) {
      setUri(cached);
      return;
    }
    if (!hasEngine) return;
    let active = true;
    queue = queue
      .then(() => renderPreview(document))
      .then(
        (result) => {
          known.set(document.id, result);
          if (active) setUri(result);
        },
        () => {},
      );
    return () => {
      active = false;
    };
  }, [document.id, document.kind, document.path]);
  return uri;
}
