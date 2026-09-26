import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_DEPTH,
  childrenOf,
  cleanName,
  depthOf,
  directDocuments,
  isLockedPath,
  isWithin,
  joinPath,
  nameOf,
  parentOf,
  renamePath,
  segments,
  validateNewFolder,
} from "../src/services/folderPaths.mjs";

test("names are cleaned and separators cannot be smuggled in", () => {
  assert.equal(cleanName("  Math   101 "), "Math 101");
  assert.equal(cleanName("a/b\\c"), "a b c");
  assert.equal(cleanName("x".repeat(60)).length, 40);
  assert.deepEqual(segments("/Study//Math/"), ["Study", "Math"]);
  assert.equal(joinPath("Study", " Math "), "Study/Math");
  assert.equal(joinPath("", "Land"), "Land");
  assert.equal(parentOf("Study/Math/Algebra"), "Study/Math");
  assert.equal(parentOf("Land"), "");
  assert.equal(nameOf("Study/Math"), "Math");
  assert.equal(depthOf("a/b/c"), 3);
});

test("containment is case-insensitive and a folder contains itself", () => {
  assert.equal(isWithin("Study/Math", "study"), true);
  assert.equal(isWithin("Study", "Study"), true);
  assert.equal(isWithin("Studying", "Study"), false);
  assert.equal(isWithin("Land", "Study"), false);
  assert.equal(isWithin("Study", ""), false);
});

test("a locked ancestor locks everything below it", () => {
  const locked = new Set(["Personal"]);
  assert.equal(isLockedPath("Personal", locked), true);
  assert.equal(isLockedPath("Personal/Bank", locked), true);
  assert.equal(isLockedPath("Study/Personal", locked), false);
  assert.equal(isLockedPath("", locked), false);
});

test("new folders are validated for name, depth and duplicates", () => {
  const existing = ["Study", "Study/Math"];
  assert.deepEqual(validateNewFolder("Study", "Science", existing), { ok: true, path: "Study/Science" });
  assert.equal(validateNewFolder("Study", "math", existing).ok, false);
  assert.equal(validateNewFolder("Study", "   ", existing).ok, false);
  assert.equal(validateNewFolder("a/b/c/d", "e", []).ok, false, `deeper than ${MAX_DEPTH}`);
  assert.deepEqual(validateNewFolder("", "Land", existing), { ok: true, path: "Land" });
});

test("children carry direct and nested counts and include empty folders", () => {
  const folders = ["Study", "Study/Math", "Study/Science", "Land", "Personal"];
  const docs = ["Study/Math", "Study/Math", "Study", "Land", "Study/Science/Bio"];
  const top = childrenOf("", folders, docs);
  assert.deepEqual(top.map((c) => [c.name, c.direct, c.total]), [
    ["Land", 1, 1],
    ["Personal", 0, 0],
    ["Study", 1, 4],
  ]);
  const study = childrenOf("Study", folders, docs);
  assert.deepEqual(study.map((c) => [c.path, c.direct, c.total]), [
    ["Study/Math", 2, 2],
    ["Study/Science", 0, 1],
  ]);
  assert.deepEqual(directDocuments("Study/Math", [["a", "Study/Math"], ["b", "Study/Math/Algebra"], ["c", "study/math"]]), ["a", "c"]);
});

test("renaming a folder moves everything below it", () => {
  assert.equal(renamePath("Study/Math/Algebra", "Study/Math", "Study/Maths"), "Study/Maths/Algebra");
  assert.equal(renamePath("Study/Math", "Study/Math", "Archive/Math"), "Archive/Math");
  assert.equal(renamePath("Land", "Study", "X"), "Land");
});
