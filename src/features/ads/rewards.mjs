// What a rewarded video buys, kept free of native modules so the rules are
// pinned by tests. One rewarded unit serves three purposes:
//
//  - "adFree":    no ads at all for the next 15 minutes (stacks if repeated);
//  - "watermark": PDFs created in the next 4 hours carry no watermark;
//  - a feature:   one premium tool is unlocked for 4 hours.
//
// The three are independent: a person who is ad-free can still watch a video
// for the watermark or a tool (rewarded videos are never counted as "ads"
// that the ad-free period removes), and each reward runs on its own clock.
//
// Tools are never blocked by an ad that cannot be shown: when the module is
// absent (Expo Go) or consent forbids ad requests, every tool is open (see
// shouldGateFeature). The watermark is the one thing that stays regardless,
// since it costs the person nothing but a line of small text.

export const AD_FREE_REWARD_MS = 15 * 60 * 1000;
export const WATERMARK_FREE_MS = 4 * 60 * 60 * 1000;
export const FEATURE_UNLOCK_MS = 4 * 60 * 60 * 1000;
export const WATERMARK_TEXT = "Scanned with ScanDoc";

/** Tools that other scanner apps sell; here a short video unlocks them for a day. */
export const PREMIUM_FEATURES = Object.freeze({
  ocr: "Read Text (OCR)",
  merge: "Merge PDFs",
  split: "Split PDF",
  pdfToImages: "PDF to Images",
  compressPdf: "Compress PDF",
  compare: "Compare documents",
});

export function emptyRewards() {
  return { adFreeUntil: null, watermarkFreeUntil: null, unlocks: {} };
}

function future(value, now) {
  return typeof value === "number" && Number.isFinite(value) && value > now ? value : null;
}

/**
 * Turns whatever was stored into a valid rewards record: unknown shapes are
 * ignored and anything already expired is dropped, so callers never see a
 * timestamp in the past.
 */
export function normalizeRewards(raw, now = Date.now()) {
  const result = emptyRewards();
  if (!raw || typeof raw !== "object") return result;
  result.adFreeUntil = future(raw.adFreeUntil, now);
  result.watermarkFreeUntil = future(raw.watermarkFreeUntil, now);
  if (raw.unlocks && typeof raw.unlocks === "object")
    for (const feature of Object.keys(PREMIUM_FEATURES)) {
      const until = future(raw.unlocks[feature], now);
      if (until) result.unlocks[feature] = until;
    }
  return result;
}

function extend(current, now, duration) {
  const base = future(current, now) ?? now;
  return base + duration;
}

/**
 * Applies a reward. Ad-free time stacks (watching twice gives 30 minutes);
 * the watermark and feature unlocks are a fresh 4 hours from the later of
 * now and the current expiry, so watching early never shortens what was left.
 */
export function grantReward(rewards, purpose, now = Date.now()) {
  const next = normalizeRewards(rewards, now);
  if (purpose === "adFree") next.adFreeUntil = extend(next.adFreeUntil, now, AD_FREE_REWARD_MS);
  else if (purpose === "watermark")
    next.watermarkFreeUntil = extend(next.watermarkFreeUntil, now, WATERMARK_FREE_MS);
  else if (purpose in PREMIUM_FEATURES)
    next.unlocks[purpose] = extend(next.unlocks[purpose], now, FEATURE_UNLOCK_MS);
  else throw new Error(`Unknown reward: ${String(purpose)}`);
  return next;
}

export function isWatermarkFree(rewards, now = Date.now()) {
  return !!future(rewards?.watermarkFreeUntil, now);
}

export function isFeatureUnlocked(rewards, feature, now = Date.now()) {
  return !!future(rewards?.unlocks?.[feature], now);
}

/** Whole minutes until a timestamp, never below zero. */
export function minutesLeft(until, now = Date.now()) {
  const value = future(until, now);
  return value ? Math.ceil((value - now) / 60000) : 0;
}

/** "23 h 40 min", "45 min" or "" when nothing is left. */
export function describeTimeLeft(until, now = Date.now()) {
  const minutes = minutesLeft(until, now);
  if (!minutes) return "";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} min`;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

/**
 * Whether a premium tool should show its unlock gate. A gate exists only when
 * a video can be shown: the module is present, consent allows ad requests,
 * and the feature is not already unlocked. Otherwise the tool is simply open,
 * so nobody is ever locked out by an ad that cannot appear.
 */
export function shouldGateFeature(state, now = Date.now()) {
  if (!(state.feature in PREMIUM_FEATURES)) return { gate: false, reason: "not-premium" };
  if (!state.available) return { gate: false, reason: "no-ads-module" };
  if (!state.canRequestAds) return { gate: false, reason: "no-consent" };
  if (isFeatureUnlocked(state.rewards, state.feature, now)) return { gate: false, reason: "unlocked" };
  return { gate: true, reason: "locked" };
}

/** The text stamped on new PDFs, or undefined while a reward is active. */
export function pdfWatermark(rewards, now = Date.now()) {
  return isWatermarkFree(rewards, now) ? undefined : WATERMARK_TEXT;
}
