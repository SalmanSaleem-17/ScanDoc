export declare const AD_FREE_REWARD_MS: number;
export declare const INTERSTITIAL_WARMUP_MS: number;
export declare const INTERSTITIAL_MIN_INTERVAL_MS: number;
export declare const INTERSTITIAL_MAX_PER_SESSION: number;
export declare const APP_OPEN_MIN_BACKGROUND_MS: number;
export declare const APP_OPEN_MIN_INTERVAL_MS: number;
export declare const FULLSCREEN_BLOCKED_ROUTES: string[];

export interface Decision {
  show: boolean;
  reason: string;
}
export interface InterstitialState {
  canRequestAds: boolean;
  adFreeUntil: number | null;
  sessionStartedAt: number;
  lastFullScreenAt: number | null;
  shownThisSession: number;
  pathname: string | null;
}
export interface AppOpenState {
  canRequestAds: boolean;
  adFreeUntil: number | null;
  coldStart: boolean;
  backgroundedAt: number | null;
  lastFullScreenAt: number | null;
  pathname: string | null;
  /** The app is returning from system UI it opened itself (pickers, share sheet, Settings). */
  inSystemFlow?: boolean;
}

export declare function isAdFree(adFreeUntil: number | null | undefined, now?: number): boolean;
export declare function extendAdFree(adFreeUntil: number | null | undefined, now?: number, reward?: number): number;
export declare function adFreeMinutesLeft(adFreeUntil: number | null | undefined, now?: number): number;
export declare function routeBlocksFullScreenAds(pathname: string | null | undefined): boolean;
export declare function shouldShowInterstitial(state: InterstitialState, now?: number): Decision;
export declare function shouldShowAppOpen(state: AppOpenState, now?: number): Decision;
