export declare const AD_FREE_REWARD_MS: number;
export declare const WATERMARK_FREE_MS: number;
export declare const FEATURE_UNLOCK_MS: number;
export declare const WATERMARK_TEXT: string;
export declare const PREMIUM_FEATURES: Readonly<{
  ocr: string;
  merge: string;
  split: string;
  pdfToImages: string;
  compressPdf: string;
  compare: string;
}>;
export type PremiumFeature = keyof typeof PREMIUM_FEATURES;
export type RewardPurpose = "adFree" | "watermark" | PremiumFeature;
export interface Rewards {
  adFreeUntil: number | null;
  watermarkFreeUntil: number | null;
  unlocks: Partial<Record<PremiumFeature, number>>;
}
export declare function emptyRewards(): Rewards;
export declare function normalizeRewards(raw: unknown, now?: number): Rewards;
export declare function grantReward(rewards: Rewards | null | undefined, purpose: RewardPurpose, now?: number): Rewards;
export declare function isWatermarkFree(rewards: Rewards | null | undefined, now?: number): boolean;
export declare function isFeatureUnlocked(rewards: Rewards | null | undefined, feature: PremiumFeature, now?: number): boolean;
export declare function minutesLeft(until: number | null | undefined, now?: number): number;
export declare function describeTimeLeft(until: number | null | undefined, now?: number): string;
export declare function shouldGateFeature(
  state: { feature: string; available: boolean; canRequestAds: boolean; rewards: Rewards | null | undefined },
  now?: number,
): { gate: boolean; reason: string };
export declare function pdfWatermark(rewards: Rewards | null | undefined, now?: number): string | undefined;
