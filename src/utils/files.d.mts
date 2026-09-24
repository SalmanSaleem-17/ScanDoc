export function cleanName(value: string): string;
export function formatBytes(bytes: number): string;
export function fileKind(name: string): 'pdf' | 'image';
export function matchesHeader(name: string, bytes: Uint8Array): boolean;
export function timestampName(prefix: string, extension: string, date?: Date): string;
export function sequenceName(base: string, index: number, total: number, extension: string): string;
