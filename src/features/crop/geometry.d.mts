export type HandleKind = "corner" | "edge" | "quad" | "none";
export function defaultCorners(): number[];
export function isValidQuad(points: number[]): boolean;
export function shortestEdge(
  points: number[],
  width: number,
  height: number,
): number;
export function isUsableQuad(
  points: number[],
  width: number,
  height: number,
): boolean;
export function moveCorner(
  points: number[],
  index: number,
  dx: number,
  dy: number,
): number[];
export function moveEdge(
  points: number[],
  edge: number,
  dx: number,
  dy: number,
): number[];
export function moveQuad(points: number[], dx: number, dy: number): number[];
export function handlePoint(
  points: number[],
  kind: "corner" | "edge",
  index: number,
): number[];
export function pointInQuad(points: number[], x: number, y: number): boolean;
export function nearestHandle(
  points: number[],
  x: number,
  y: number,
  width: number,
  height: number,
  reach: number,
): { kind: HandleKind; index: number };
export function quadPath(
  points: number[],
  offsetX: number,
  offsetY: number,
  width: number,
  height: number,
): string;
export function orderCorners(points: number[]): number[];
