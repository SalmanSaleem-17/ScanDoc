import test from "node:test";
import assert from "node:assert/strict";
import {
  defaultCorners,
  handlePoint,
  isUsableQuad,
  isValidQuad,
  moveCorner,
  moveEdge,
  moveQuad,
  nearestHandle,
  orderCorners,
  pointInQuad,
  quadPath,
  shortestEdge,
} from "../src/features/crop/geometry.mjs";
import { validCorners } from "../src/features/workflows/logic.mjs";

const full = defaultCorners();
const tilted = [0.1, 0.05, 0.9, 0.12, 0.88, 0.95, 0.08, 0.9];
// Clamping divides normalized coordinates, so compare within float tolerance.
const near = (actual, expected, message) => {
  assert.equal(actual.length, expected.length, message);
  actual.forEach((value, index) =>
    assert.ok(
      Math.abs(value - expected[index]) < 1e-9,
      `${message}: index ${index} was ${value}, expected ${expected[index]}`,
    ),
  );
};

test("the editor's guard agrees with the export-time validator", () => {
  const quads = [
    full,
    tilted,
    [0, 0, 1, 0, 1, 1, 0, 1],
    [0, 0, 1, 1, 1, 0, 0, 1], // bow tie
    [0, 0, 1, 0, 1, 0, 0, 0], // degenerate
    [0, 0, 0, 1, 1, 1, 1, 0], // counter-clockwise
    [-0.1, 0, 1, 0, 1, 1, 0, 1], // outside the image
  ];
  for (const quad of quads)
    assert.equal(
      isValidQuad(quad),
      validCorners(quad),
      `disagreement on ${JSON.stringify(quad)}`,
    );
});

test("crossed, reversed and collapsed quads are refused", () => {
  assert.equal(isValidQuad(full), true);
  assert.equal(isValidQuad([0, 0, 1, 1, 1, 0, 0, 1]), false);
  assert.equal(isValidQuad([0, 0, 0, 1, 1, 1, 1, 0]), false);
  assert.equal(isValidQuad([0, 0, 1, 0, 1, 0, 0, 0]), false);
  assert.equal(isValidQuad([0, 0, 1, 0, 1, 1]), false);
  assert.equal(isValidQuad([0, 0, 1, 0, 1, 1, 0, Number.NaN]), false);
});

test("a quad is unusable once its handles would overlap", () => {
  assert.equal(shortestEdge(full, 1000, 1000), 1000);
  assert.equal(isUsableQuad(full, 1000, 1000), true);
  // Valid in normalized space, but only 24px wide on a small preview.
  const small = [0.5, 0.5, 0.58, 0.5, 0.58, 0.58, 0.5, 0.58];
  assert.equal(isValidQuad(small), true);
  assert.equal(isUsableQuad(small, 300, 300), false);
  assert.equal(isUsableQuad(small, 1000, 1000), true);
});

test("corners stop at the image border instead of leaving it", () => {
  assert.deepEqual(moveCorner(full, 0, -0.5, -0.5), full);
  const moved = moveCorner(full, 0, 0.25, 0.1);
  assert.deepEqual(moved.slice(0, 2), [0.25, 0.1]);
  assert.deepEqual(moved.slice(2), full.slice(2));
});

test("dragging an edge slides both of its corners together", () => {
  const moved = moveEdge(tilted, 0, 0, 0.05);
  assert.ok(Math.abs(moved[1] - (tilted[1] + 0.05)) < 1e-9);
  assert.ok(Math.abs(moved[3] - (tilted[3] + 0.05)) < 1e-9);
  assert.deepEqual(moved.slice(4), tilted.slice(4));
});

test("edge and quad drags clamp so no corner leaves the image", () => {
  const edge = moveEdge(full, 0, 0, -0.5);
  assert.deepEqual(edge, full, "top edge cannot move above the image");
  const whole = moveQuad(full, 0.3, 0.3);
  assert.deepEqual(whole, full, "a full-image quad has nowhere to slide");
  const inner = [0.2, 0.2, 0.8, 0.2, 0.8, 0.8, 0.2, 0.8];
  near(
    moveQuad(inner, 0.5, 0),
    [0.4, 0.2, 1, 0.2, 1, 0.8, 0.4, 0.8],
    "a quad slides only until its leading edge reaches the border",
  );
});

test("moved quads stay valid, so the editor never blocks its own export", () => {
  assert.equal(isValidQuad(moveEdge(tilted, 2, 0, -0.2)), true);
  assert.equal(isValidQuad(moveQuad(tilted, 0.05, 0.02)), true);
  assert.equal(isValidQuad(moveCorner(tilted, 1, -0.1, 0.1)), true);
});

test("handle positions follow corners and edge midpoints", () => {
  assert.deepEqual(handlePoint(full, "corner", 2), [1, 1]);
  assert.deepEqual(handlePoint(full, "edge", 0), [0.5, 0]);
  assert.deepEqual(handlePoint(full, "edge", 3), [0, 0.5]);
});

test("the nearest handle prefers corners, then edges, then the body", () => {
  const size = 1000;
  assert.deepEqual(nearestHandle(full, 5, 5, size, size, 46), {
    kind: "corner",
    index: 0,
  });
  assert.deepEqual(nearestHandle(full, 500, 8, size, size, 46), {
    kind: "edge",
    index: 0,
  });
  assert.deepEqual(nearestHandle(full, 500, 500, size, size, 46), {
    kind: "quad",
    index: -1,
  });
  const inner = [0.4, 0.4, 0.6, 0.4, 0.6, 0.6, 0.4, 0.6];
  assert.equal(nearestHandle(inner, 10, 10, size, size, 46).kind, "none");
});

test("points are tested against the quad, not its bounding box", () => {
  const diamond = [0.5, 0, 1, 0.5, 0.5, 1, 0, 0.5];
  assert.equal(pointInQuad(diamond, 0.5, 0.5), true);
  assert.equal(pointInQuad(diamond, 0.05, 0.05), false);
  assert.equal(pointInQuad(full, 0.99, 0.99), true);
});

test("detected corners are reordered into TL, TR, BR, BL", () => {
  const rotated = [1, 0, 1, 1, 0, 1, 0, 0]; // starts at TR
  assert.deepEqual(orderCorners(rotated), [0, 0, 1, 0, 1, 1, 0, 1]);
  assert.equal(isValidQuad(orderCorners(rotated)), true);
  const reversed = [0, 0, 0, 1, 1, 1, 1, 0]; // counter-clockwise
  assert.equal(isValidQuad(reversed), false);
  assert.equal(isValidQuad(orderCorners(reversed)), true);
});

test("the drawn path closes and is offset into the container", () => {
  const path = quadPath(full, 10, 20, 100, 200);
  assert.equal(path, "M10.00 20.00 L110.00 20.00 L110.00 220.00 L10.00 220.00 Z");
});
