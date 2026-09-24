// A crop quad is eight normalized numbers in [0,1]: TL, TR, BR, BL.
// The editor runs these for every touch frame, so they are marked as worklets
// and stay allocation-light. In Node the directive is an inert string, which is
// what lets the same code be unit tested.

export function defaultCorners() {
  "worklet";
  return [0, 0, 1, 0, 1, 1, 0, 1];
}

function clamp01(value) {
  "worklet";
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

// Deliberately mirrors validCorners() in features/workflows/logic.mjs. The
// editor must never let the user build a quad that the export step rejects, so
// a test asserts the two agree.
export function isValidQuad(points) {
  "worklet";
  if (points.length !== 8) return false;
  for (let i = 0; i < 8; i++) {
    const value = points[i];
    if (!Number.isFinite(value) || value < 0 || value > 1) return false;
  }
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = i * 2;
    const b = ((i + 1) % 4) * 2;
    const c = ((i + 2) % 4) * 2;
    const cross =
      (points[b] - points[a]) * (points[c + 1] - points[b + 1]) -
      (points[b + 1] - points[a + 1]) * (points[c] - points[b]);
    if (Math.abs(cross) < 0.005) return false;
    const current = cross > 0 ? 1 : -1;
    if (sign && current !== sign) return false;
    sign = current;
  }
  return sign > 0;
}

export function shortestEdge(points, width, height) {
  "worklet";
  let shortest = Infinity;
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    const dx = (points[j * 2] - points[i * 2]) * width;
    const dy = (points[j * 2 + 1] - points[i * 2 + 1]) * height;
    const length = Math.sqrt(dx * dx + dy * dy);
    if (length < shortest) shortest = length;
  }
  return shortest;
}

// A quad is only accepted while dragging if it is valid AND still large enough
// that its handles do not sit on top of each other.
export function isUsableQuad(points, width, height) {
  "worklet";
  return isValidQuad(points) && shortestEdge(points, width, height) >= 44;
}

export function moveCorner(points, index, dx, dy) {
  "worklet";
  const next = points.slice();
  next[index * 2] = clamp01(points[index * 2] + dx);
  next[index * 2 + 1] = clamp01(points[index * 2 + 1] + dy);
  return next;
}

// Dragging an edge slides both of its corners together. The delta is clamped
// first so the edge stops at the image border instead of deforming.
export function moveEdge(points, edge, dx, dy) {
  "worklet";
  const ends = [edge, (edge + 1) % 4];
  let mx = dx;
  let my = dy;
  for (let i = 0; i < 2; i++) {
    const x = points[ends[i] * 2];
    const y = points[ends[i] * 2 + 1];
    if (mx < -x) mx = -x;
    if (mx > 1 - x) mx = 1 - x;
    if (my < -y) my = -y;
    if (my > 1 - y) my = 1 - y;
  }
  const next = points.slice();
  for (let i = 0; i < 2; i++) {
    next[ends[i] * 2] = clamp01(points[ends[i] * 2] + mx);
    next[ends[i] * 2 + 1] = clamp01(points[ends[i] * 2 + 1] + my);
  }
  return next;
}

export function moveQuad(points, dx, dy) {
  "worklet";
  let mx = dx;
  let my = dy;
  for (let i = 0; i < 4; i++) {
    const x = points[i * 2];
    const y = points[i * 2 + 1];
    if (mx < -x) mx = -x;
    if (mx > 1 - x) mx = 1 - x;
    if (my < -y) my = -y;
    if (my > 1 - y) my = 1 - y;
  }
  const next = points.slice();
  for (let i = 0; i < 4; i++) {
    next[i * 2] = clamp01(points[i * 2] + mx);
    next[i * 2 + 1] = clamp01(points[i * 2 + 1] + my);
  }
  return next;
}

export function handlePoint(points, kind, index) {
  "worklet";
  if (kind === "corner") return [points[index * 2], points[index * 2 + 1]];
  const j = (index + 1) % 4;
  return [
    (points[index * 2] + points[j * 2]) / 2,
    (points[index * 2 + 1] + points[j * 2 + 1]) / 2,
  ];
}

export function pointInQuad(points, x, y) {
  "worklet";
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = i * 2;
    const b = ((i + 1) % 4) * 2;
    const cross =
      (points[b] - points[a]) * (y - points[a + 1]) -
      (points[b + 1] - points[a + 1]) * (x - points[a]);
    const current = cross > 0 ? 1 : cross < 0 ? -1 : 0;
    if (current === 0) continue;
    if (sign && current !== sign) return false;
    sign = current;
  }
  return true;
}

// Corners win over edges, and edges over the body, so the most precise handle
// under a fingertip is the one that responds. `reach` is a forgiving radius in
// display pixels rather than the size of the drawn handle.
export function nearestHandle(points, x, y, width, height, reach) {
  "worklet";
  let best = -1;
  let bestDistance = reach;
  for (let i = 0; i < 4; i++) {
    const dx = points[i * 2] * width - x;
    const dy = points[i * 2 + 1] * height - y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = i;
    }
  }
  if (best >= 0) return { kind: "corner", index: best };
  for (let i = 0; i < 4; i++) {
    const point = handlePoint(points, "edge", i);
    const dx = point[0] * width - x;
    const dy = point[1] * height - y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = i;
    }
  }
  if (best >= 0) return { kind: "edge", index: best };
  if (width > 0 && height > 0 && pointInQuad(points, x / width, y / height))
    return { kind: "quad", index: -1 };
  return { kind: "none", index: -1 };
}

export function quadPath(points, offsetX, offsetY, width, height) {
  "worklet";
  let path = "";
  for (let i = 0; i < 4; i++) {
    const x = offsetX + points[i * 2] * width;
    const y = offsetY + points[i * 2 + 1] * height;
    path += `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)} `;
  }
  return `${path}Z`;
}

// Automatic detection can return corners in any rotation. Sorting by angle
// around the centroid puts them back into TL, TR, BR, BL winding. Runs once on
// the JS thread after a detection, not during dragging.
export function orderCorners(points) {
  if (points.length !== 8) return points;
  const list = [];
  for (let i = 0; i < 4; i++) list.push([points[i * 2], points[i * 2 + 1]]);
  const cx = (list[0][0] + list[1][0] + list[2][0] + list[3][0]) / 4;
  const cy = (list[0][1] + list[1][1] + list[2][1] + list[3][1]) / 4;
  // Screen coordinates put y downwards, so ascending angle runs clockwise.
  list.sort(
    (a, b) => Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx),
  );
  let startIndex = 0;
  let bestScore = Infinity;
  for (let i = 0; i < 4; i++) {
    const score = list[i][0] + list[i][1];
    if (score < bestScore) {
      bestScore = score;
      startIndex = i;
    }
  }
  const ordered = [];
  for (let i = 0; i < 4; i++) {
    const point = list[(startIndex + i) % 4];
    ordered.push(point[0], point[1]);
  }
  return ordered;
}
