import {
  requireOptionalNativeModule,
  type EventSubscription,
} from "expo-modules-core";
import { Directory, Paths } from "expo-file-system";
import * as Crypto from "expo-crypto";

interface NativeEngine {
  process(operation: string, payload: string, id: string): Promise<string>;
  cancel(id: string): void;
  addListener(
    event: "progress",
    listener: (event: { id: string; completed: number; total: number }) => void,
  ): EventSubscription;
}
const engine = requireOptionalNativeModule<NativeEngine>("ScanDocEngine");
export const hasEngine = !!engine;
export const engineRequirement =
  "This tool needs the ScanDoc Android development build. Expo Go does not contain its offline OCR and document-processing engine.";
export type EngineResult = {
  uri?: string;
  uris?: string[];
  text?: string;
  confidence?: number;
  issues?: string[];
  pages?: number;
  size?: number;
  targetMet?: boolean;
  maxEdge?: number;
  quality?: number;
  changedPercent?: number;
};
export async function runEngine(
  operation: string,
  payload: object,
  options: { signal?: AbortSignal; progress?: (text: string) => void } = {},
) {
  if (!engine) throw new Error(engineRequirement);
  if (options.signal?.aborted) throw new Error("Operation cancelled.");
  const id = Crypto.randomUUID();
  const cancel = () => engine.cancel(id);
  options.signal?.addEventListener("abort", cancel);
  const subscription = engine.addListener("progress", (event) => {
    if (event.id === id)
      options.progress?.(`Processing ${event.completed} of ${event.total}`);
  });
  const clean = () => {
    try {
      const dir = new Directory(Paths.cache, "ScanDocEngine", id);
      if (dir.exists) dir.delete();
    } catch {}
  };
  try {
    const result = JSON.parse(
      await engine.process(operation, JSON.stringify(payload), id),
    ) as EngineResult;
    if (options.signal?.aborted) {
      clean();
      throw new Error("Operation cancelled.");
    }
    return { ...result, clean };
  } catch (error) {
    clean();
    throw error;
  } finally {
    subscription.remove();
    options.signal?.removeEventListener("abort", cancel);
  }
}
