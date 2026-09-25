import test from "node:test";
import assert from "node:assert/strict";
import {
  AD_FREE_REWARD_MS,
  APP_OPEN_MIN_BACKGROUND_MS,
  APP_OPEN_MIN_INTERVAL_MS,
  INTERSTITIAL_MAX_PER_SESSION,
  INTERSTITIAL_MIN_INTERVAL_MS,
  INTERSTITIAL_WARMUP_MS,
  adFreeMinutesLeft,
  extendAdFree,
  isAdFree,
  routeBlocksFullScreenAds,
  shouldShowAppOpen,
  shouldShowInterstitial,
} from "../src/features/ads/policy.mjs";

const NOW = 1_800_000_000_000;
const MIN = 60_000;

test("ad-free rewards stack and count down in whole minutes", () => {
  assert.equal(isAdFree(null, NOW), false);
  assert.equal(isAdFree(NOW - 1, NOW), false);
  assert.equal(isAdFree(NOW + 1, NOW), true);
  assert.equal(extendAdFree(null, NOW), NOW + AD_FREE_REWARD_MS);
  assert.equal(extendAdFree(NOW - 5 * MIN, NOW), NOW + AD_FREE_REWARD_MS, "an expired period does not carry over");
  assert.equal(extendAdFree(NOW + 10 * MIN, NOW), NOW + 10 * MIN + AD_FREE_REWARD_MS, "an active period is extended");
  assert.equal(adFreeMinutesLeft(NOW + 59 * MIN + 1, NOW), 60);
  assert.equal(adFreeMinutesLeft(NOW - 1, NOW), 0);
});

test("full-screen ads are blocked on the camera and editor routes only", () => {
  assert.equal(routeBlocksFullScreenAds("/scanner"), true);
  assert.equal(routeBlocksFullScreenAds("/page-editor"), true);
  assert.equal(routeBlocksFullScreenAds("/page-editor/anything"), true);
  assert.equal(routeBlocksFullScreenAds("/scanner-settings"), false, "prefix must match a whole segment");
  assert.equal(routeBlocksFullScreenAds("/"), false);
  assert.equal(routeBlocksFullScreenAds(null), false);
});

const openSession = {
  canRequestAds: true,
  adFreeUntil: null,
  sessionStartedAt: NOW - 10 * MIN,
  lastFullScreenAt: null,
  shownThisSession: 0,
  pathname: "/ocr",
};

test("interstitials wait for consent, the warm-up, the interval and the session cap", () => {
  assert.deepEqual(shouldShowInterstitial(openSession, NOW), { show: true, reason: "ok" });
  assert.equal(shouldShowInterstitial({ ...openSession, canRequestAds: false }, NOW).reason, "no-consent");
  assert.equal(shouldShowInterstitial({ ...openSession, adFreeUntil: NOW + 1 }, NOW).reason, "ad-free");
  assert.equal(shouldShowInterstitial({ ...openSession, pathname: "/scanner" }, NOW).reason, "blocked-route");
  assert.equal(
    shouldShowInterstitial({ ...openSession, sessionStartedAt: NOW - INTERSTITIAL_WARMUP_MS + 1 }, NOW).reason,
    "warm-up",
  );
  assert.equal(
    shouldShowInterstitial({ ...openSession, sessionStartedAt: NOW - INTERSTITIAL_WARMUP_MS }, NOW).show,
    true,
    "the warm-up ends exactly at its boundary",
  );
  assert.equal(
    shouldShowInterstitial({ ...openSession, lastFullScreenAt: NOW - INTERSTITIAL_MIN_INTERVAL_MS + 1 }, NOW).reason,
    "too-soon",
  );
  assert.equal(
    shouldShowInterstitial({ ...openSession, lastFullScreenAt: NOW - INTERSTITIAL_MIN_INTERVAL_MS }, NOW).show,
    true,
  );
  assert.equal(
    shouldShowInterstitial({ ...openSession, shownThisSession: INTERSTITIAL_MAX_PER_SESSION }, NOW).reason,
    "session-cap",
  );
});

test("app-open ads never fire on a cold start or a short absence", () => {
  const returning = {
    canRequestAds: true,
    adFreeUntil: null,
    coldStart: false,
    backgroundedAt: NOW - APP_OPEN_MIN_BACKGROUND_MS,
    lastFullScreenAt: null,
    pathname: "/",
  };
  assert.deepEqual(shouldShowAppOpen(returning, NOW), { show: true, reason: "ok" });
  assert.equal(shouldShowAppOpen({ ...returning, coldStart: true }, NOW).reason, "cold-start");
  assert.equal(shouldShowAppOpen({ ...returning, backgroundedAt: NOW - APP_OPEN_MIN_BACKGROUND_MS + 1 }, NOW).reason, "short-absence");
  assert.equal(shouldShowAppOpen({ ...returning, backgroundedAt: null }, NOW).reason, "short-absence");
  assert.equal(shouldShowAppOpen({ ...returning, pathname: "/scanner" }, NOW).reason, "blocked-route");
  assert.equal(shouldShowAppOpen({ ...returning, inSystemFlow: true }, NOW).reason, "system-flow");
  assert.equal(shouldShowAppOpen({ ...returning, adFreeUntil: NOW + 1 }, NOW).reason, "ad-free");
  assert.equal(shouldShowAppOpen({ ...returning, canRequestAds: false }, NOW).reason, "no-consent");
  assert.equal(
    shouldShowAppOpen({ ...returning, lastFullScreenAt: NOW - APP_OPEN_MIN_INTERVAL_MS + 1 }, NOW).reason,
    "too-soon",
  );
});
