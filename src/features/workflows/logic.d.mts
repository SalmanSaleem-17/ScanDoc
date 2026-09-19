export function suggestName(text: string, extension?: string, date?: Date): string;
export function parseAmount(value: string): number;
export function receiptSuggestion(text: string): { merchant: string; amount: string; date: string };
export function csvCell(value: unknown): string;
export function receiptCsv(rows: { merchant: string; date: string; currency: string; cents: number; name: string }[]): string;
export function changedLines(first: string, second: string): { removed: string[]; added: string[] };
export function validCorners(points: number[]): boolean;
