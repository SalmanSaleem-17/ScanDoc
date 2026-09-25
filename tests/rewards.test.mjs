import test from "node:test";
import assert from "node:assert/strict";
import {
  AD_FREE_REWARD_MS,
  FEATURE_UNLOCK_MS,
  PREMIUM_FEATURES,
  WATERMARK_FREE_MS,
  WATERMARK_TEXT,
  describeTimeLeft,
  emptyRewards,
  grantReward,
  isFeatureUnlocked,
  isWatermarkFree,
  minutesLeft,
  normalizeRewards,
  pdfWatermark,
  shouldGateFeature,
} from "../src/features/ads/rewards.mjs";

const NOW = 1_800_000_000_000;
const MIN = 60_000;
const HOUR = 60 * MIN;

test("rewards are 15 minutes ad-free, 24 hours watermark-free, 24 hours per feature", () => {
  assert.equal(AD_FREE_REWARD_MS, 15 * MIN);
  assert.equal(WATERMARK_FREE_MS, 24 * HOUR);
  assert.equal(FEATURE_UNLOCK_MS, 24 * HOUR);
  assert.deepEqual(Object.keys(PREMIUM_FEATURES), ["ocr", "merge", "split", "pdfToImages", "compressPdf", "compare"]);
});

test("stored rewards are normalised: junk ignored, expired dropped, unknown features dropped", () => {
  assert.deepEqual(normalizeRewards(null, NOW), emptyRewards());
  assert.deepEqual(normalizeRewards("nonsense", NOW), emptyRewards());
  const raw = {
    adFreeUntil: NOW - 1,
    watermarkFreeUntil: NOW + HOUR,
    unlocks: { ocr: NOW + 5 * MIN, merge: NOW - 5 * MIN, bogus: NOW + HOUR, split: "soon" },
  };
  assert.deepEqual(normalizeRewards(raw, NOW), {
    adFreeUntil: null,
    watermarkFreeUntil: NOW + HOUR,
    unlocks: { ocr: NOW + 5 * MIN },
  });
});

test("ad-free stacks; watermark and feature unlocks extend from the later expiry", () => {
  let r = grantReward(null, "adFree", NOW);
  assert.equal(r.adFreeUntil, NOW + 15 * MIN);
  r = grantReward(r, "adFree", NOW + 5 * MIN);
  assert.equal(r.adFreeUntil, NOW + 30 * MIN, "a second video adds to what is left");
  r = grantReward(r, "watermark", NOW);
  assert.equal(r.watermarkFreeUntil, NOW + 24 * HOUR);
  r = grantReward(r, "watermark", NOW + HOUR);
  assert.equal(r.watermarkFreeUntil, NOW + 48 * HOUR);
  r = grantReward(r, "merge", NOW);
  assert.equal(r.unlocks.merge, NOW + 24 * HOUR);
  assert.equal(isFeatureUnlocked(r, "merge", NOW + 23 * HOUR), true);
  assert.equal(isFeatureUnlocked(r, "merge", NOW + 25 * HOUR), false);
  assert.equal(isFeatureUnlocked(r, "split", NOW), false);
  assert.throws(() => grantReward(r, "unknown", NOW), /Unknown reward/);
});

test("the watermark disappears only while the reward is active", () => {
  assert.equal(pdfWatermark(null, NOW), WATERMARK_TEXT);
  const r = grantReward(null, "watermark", NOW);
  assert.equal(isWatermarkFree(r, NOW + 1), true);
  assert.equal(pdfWatermark(r, NOW + 1), undefined);
  assert.equal(pdfWatermark(r, NOW + 24 * HOUR), WATERMARK_TEXT);
});

test("time left is described in whole minutes and hours", () => {
  assert.equal(minutesLeft(NOW + 14 * MIN + 1, NOW), 15);
  assert.equal(minutesLeft(NOW - 1, NOW), 0);
  assert.equal(describeTimeLeft(NOW + 45 * MIN, NOW), "45 min");
  assert.equal(describeTimeLeft(NOW + 23 * HOUR + 40 * MIN, NOW), "23 h 40 min");
  assert.equal(describeTimeLeft(NOW + 2 * HOUR, NOW), "2 h");
  assert.equal(describeTimeLeft(null, NOW), "");
});

test("a premium tool is gated only when a video can actually be shown", () => {
  const base = { feature: "ocr", available: true, canRequestAds: true, rewards: emptyRewards() };
  assert.deepEqual(shouldGateFeature(base, NOW), { gate: true, reason: "locked" });
  assert.equal(shouldGateFeature({ ...base, available: false }, NOW).reason, "no-ads-module");
  assert.equal(shouldGateFeature({ ...base, canRequestAds: false }, NOW).reason, "no-consent");
  assert.equal(shouldGateFeature({ ...base, feature: "receipts" }, NOW).reason, "not-premium");
  assert.equal(
    shouldGateFeature({ ...base, rewards: grantReward(null, "ocr", NOW) }, NOW).reason,
    "unlocked",
  );
});
