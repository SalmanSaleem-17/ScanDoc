export function parsePageRanges(input: string, pageCount: number): number[];
export function formatPages(pages: number[]): string;
export type SplitMode = "extract" | "every" | "single";
export function splitPlan(
  pageCount: number,
  mode: SplitMode,
  value: string,
): { suffix: string; pages: number[] }[];
