// When ads may appear, kept free of native modules so the rules that decide
// what users experience are pinned by tests rather than by reading the code.
//
// The rules are deliberately conservative for a tool people open to get a
// page scanned and leave: full-screen ads only at natural breaks, never over
// the camera or the editor, never in the first moments of a session, and a
// rewarded video buys 15 ad-free minutes that stack if watched again.

// The rewarded video's ad-free period; the other rewards live in rewards.mjs.
export const AD_FREE_REWARD_MS = 15 * 60 * 1000;
export const INTERSTITIAL_WARMUP_MS = 90 * 1000;
export const INTERSTITIAL_MIN_INTERVAL_MS = 3 * 60 * 1000;
export const INTERSTITIAL_MAX_PER_SESSION = 6;
export const APP_OPEN_MIN_BACKGROUND_MS = 3 * 60 * 1000;
export const APP_OPEN_MIN_INTERVAL_MS = 15 * 60 * 1000;
export const FULLSCREEN_BLOCKED_ROUTES = ["/scanner", "/page-editor"];

/** True while a rewarded ad-free period is running. */
export function isAdFree(adFreeUntil, now = Date.now()) {
  return typeof adFreeUntil === "number" && adFreeUntil > now;
}

/** A new reward extends an unexpired period rather than replacing it. */
export function extendAdFree(adFreeUntil, now = Date.now(), reward = AD_FREE_REWARD_MS) {
  const base = isAdFree(adFreeUntil, now) ? adFreeUntil : now;
  return base + reward;
}

/** Whole minutes of ad-free time left, never below zero. */
export function adFreeMinutesLeft(adFreeUntil, now = Date.now()) {
  if (!isAdFree(adFreeUntil, now)) return 0;
  return Math.ceil((adFreeUntil - now) / 60000);
}

/** Screens where a full-screen ad would interrupt the user's own task. */
export function routeBlocksFullScreenAds(pathname) {
  if (typeof pathname !== "string") return false;
  return FULLSCREEN_BLOCKED_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

/**
 * Whether an interstitial may be shown right now, with the reason it may not.
 * `state` is what the provider tracks: consent, the ad-free timer, when the
 * session started, when a full-screen ad last showed, how many have shown this
 * session, and the current route.
 */
export function shouldShowInterstitial(state, now = Date.now()) {
  if (!state.canRequestAds) return { show: false, reason: "no-consent" };
  if (isAdFree(state.adFreeUntil, now)) return { show: false, reason: "ad-free" };
  if (routeBlocksFullScreenAds(state.pathname)) return { show: false, reason: "blocked-route" };
  if (now - state.sessionStartedAt < INTERSTITIAL_WARMUP_MS) return { show: false, reason: "warm-up" };
  if (state.shownThisSession >= INTERSTITIAL_MAX_PER_SESSION) return { show: false, reason: "session-cap" };
  if (state.lastFullScreenAt && now - state.lastFullScreenAt < INTERSTITIAL_MIN_INTERVAL_MS)
    return { show: false, reason: "too-soon" };
  return { show: true, reason: "ok" };
}

/**
 * Whether an app-open ad may be shown on return to the foreground. Never on a
 * cold start (the user has not asked for anything yet), only after a real
 * absence, and never twice in quick succession with any other full-screen ad.
 */
export function shouldShowAppOpen(state, now = Date.now()) {
  if (!state.canRequestAds) return { show: false, reason: "no-consent" };
  if (isAdFree(state.adFreeUntil, now)) return { show: false, reason: "ad-free" };
  if (state.coldStart) return { show: false, reason: "cold-start" };
  // Back from a picker, share sheet or Settings page the app opened itself:
  // the person never left the app in any meaningful sense.
  if (state.inSystemFlow) return { show: false, reason: "system-flow" };
  if (routeBlocksFullScreenAds(state.pathname)) return { show: false, reason: "blocked-route" };
  if (!state.backgroundedAt || now - state.backgroundedAt < APP_OPEN_MIN_BACKGROUND_MS)
    return { show: false, reason: "short-absence" };
  if (state.lastFullScreenAt && now - state.lastFullScreenAt < APP_OPEN_MIN_INTERVAL_MS)
    return { show: false, reason: "too-soon" };
  return { show: true, reason: "ok" };
}
