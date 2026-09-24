import test from "node:test";
import assert from "node:assert/strict";
import {
  formatPages,
  parsePageRanges,
  splitPlan,
} from "../src/features/pdf/pages.mjs";

test("page ranges merge, sort and de-duplicate", () => {
  assert.deepEqual(parsePageRanges("1-5, 8, 10-14", 20), [
    1, 2, 3, 4, 5, 8, 10, 11, 12, 13, 14,
  ]);
  assert.deepEqual(parsePageRanges("3,1,2,2", 3), [1, 2, 3]);
  assert.deepEqual(parsePageRanges(" 7 ", 7), [7]);
  assert.deepEqual(parsePageRanges("2–4", 4), [2, 3, 4]);
});

test("page ranges reject selections a document cannot satisfy", () => {
  assert.throws(() => parsePageRanges("1-5", 3), /has 3 pages/);
  assert.throws(() => parsePageRanges("0", 3), /start at 1/);
  assert.throws(() => parsePageRanges("5-2", 9), /ends before it starts/);
  assert.throws(() => parsePageRanges("", 3), /Enter pages/);
  assert.throws(() => parsePageRanges("1;2", 3), /not a page or range/);
  assert.throws(() => parsePageRanges("last", 3), /not a page or range/);
  assert.throws(() => parsePageRanges("1", 0), /no pages/);
});

test("selected pages are summarised as collapsed ranges", () => {
  assert.equal(formatPages([1, 2, 3, 5, 7, 8]), "1–3, 5, 7–8");
  assert.equal(formatPages([4]), "4");
  assert.equal(formatPages([]), "");
});

test("every-N split covers all pages exactly once", () => {
  const plan = splitPlan(7, "every", "3");
  assert.deepEqual(
    plan.map((part) => part.pages),
    [
      [1, 2, 3],
      [4, 5, 6],
      [7],
    ],
  );
  assert.deepEqual(
    plan.flatMap((part) => part.pages),
    [1, 2, 3, 4, 5, 6, 7],
  );
});

test("individual split produces one file per page", () => {
  const plan = splitPlan(3, "single", "");
  assert.equal(plan.length, 3);
  assert.deepEqual(plan[2], { suffix: "3", pages: [3] });
});

test("extract split keeps only the requested pages", () => {
  assert.deepEqual(splitPlan(10, "extract", "2-3, 9"), [
    { suffix: "2–3_9", pages: [2, 3, 9] },
  ]);
});

test("split rejects settings that cannot produce a real split", () => {
  assert.throws(() => splitPlan(5, "every", "5"), /fewer than 5/);
  assert.throws(() => splitPlan(5, "every", "0"), /at least 1/);
  assert.throws(() => splitPlan(5, "every", "2.5"), /whole number/);
  assert.throws(() => splitPlan(0, "single", ""), /no pages/);
});
