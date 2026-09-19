export type Progress = { completed: number; total: number; label: string };
export type BatchResult<T> = { index: number; value?: T; error?: string };
// Sequential native/file-based work bounds peak memory and preserves per-file failures.
export async function runBatch<T, R>(
  inputs: T[],
  process: (input: T) => Promise<R>,
  signal: AbortSignal,
  onProgress: (progress: Progress) => void,
): Promise<BatchResult<R>[]> {
  const results: BatchResult<R>[] = [];
  for (let index = 0; index < inputs.length; index++) {
    if (signal.aborted) break;
    onProgress({
      completed: index,
      total: inputs.length,
      label: `Processing file ${index + 1} of ${inputs.length}`,
    });
    try {
      results.push({ index, value: await process(inputs[index]) });
    } catch {
      results.push({
        index,
        error:
          "Could not process this file. Choose another file and try again.",
      });
    }
    onProgress({
      completed: index + 1,
      total: inputs.length,
      label: `Processed ${index + 1} of ${inputs.length}`,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return results;
}
