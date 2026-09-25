import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { usePathname } from "expo-router";
import { loadAdsModule, type AdsModule } from "./module";
import { adUnits } from "./config";
import { endSystemFlow, inSystemFlow } from "./systemFlow";
import {
  isAdFree,
  shouldShowAppOpen,
  shouldShowInterstitial,
} from "./policy.mjs";
import {
  emptyRewards,
  grantReward,
  isFeatureUnlocked,
  isWatermarkFree,
  minutesLeft,
  normalizeRewards,
  pdfWatermark,
  shouldGateFeature,
  type PremiumFeature,
  type RewardPurpose,
  type Rewards,
} from "./rewards.mjs";

// Ads are consent-first and never in the way. The SDK is initialised only
// after Google's consent flow (UMP) says ads may be requested, so a user who
// declines never has the advertising SDK started at all and loses nothing.
// Full-screen ads follow the rules in policy.mjs: never over the camera or the
// editor, never in the first moments of a session, spaced apart, and switched
// off entirely while a rewarded ad-free period runs. What a rewarded video
// buys (ad-free time, no watermark, a day of a premium tool) is decided in
// rewards.mjs. Every operation is a no-op when the native module is absent
// (Expo Go).

const REWARDS_KEY = "rewards.v1";
const LEGACY_AD_FREE_KEY = "ads.adFreeUntil";

export type RewardOutcome = "rewarded" | "dismissed" | "unavailable";
type Ads = {
  /** The native module exists on this host (false in Expo Go). */
  available: boolean;
  /** Consent has been gathered and ads may be requested. */
  canRequestAds: boolean;
  /** Ads should currently be shown: available, consented and not ad-free. */
  adsEnabled: boolean;
  /** Whole minutes of rewarded ad-free time remaining. */
  adFreeMinutes: number;
  /** Everything a rewarded video has bought so far. */
  rewards: Rewards;
  /** A rewarded video is loaded and can be played right now. */
  rewardedReady: boolean;
  /** No watermark on new PDFs while this is true. */
  watermarkFree: boolean;
  /** The text to stamp on a new PDF, or undefined while watermark-free. */
  pdfWatermark: string | undefined;
  /** Whether a premium tool should show its unlock gate right now. */
  gateFor: (feature: PremiumFeature) => boolean;
  isUnlocked: (feature: PremiumFeature) => boolean;
  /** The region requires a way to change consent later. */
  privacyOptionsRequired: boolean;
  /** Shows an interstitial if policy allows and one is loaded. */
  showInterstitial: () => Promise<boolean>;
  /** Plays a rewarded video and, on reward, grants the purpose. */
  watchRewarded: (purpose: RewardPurpose) => Promise<RewardOutcome>;
  /** Plays a rewarded video; on reward, grants 15 ad-free minutes. */
  watchRewardedForAdFree: () => Promise<RewardOutcome>;
  /** Reopens the consent form so the user can change their choice. */
  openPrivacyOptions: () => Promise<void>;
};

const Context = createContext<Ads>({
  available: false,
  canRequestAds: false,
  adsEnabled: false,
  adFreeMinutes: 0,
  rewards: emptyRewards(),
  rewardedReady: false,
  watermarkFree: false,
  pdfWatermark: pdfWatermark(null),
  gateFor: () => false,
  isUnlocked: () => false,
  privacyOptionsRequired: false,
  showInterstitial: async () => false,
  watchRewarded: async () => "unavailable",
  watchRewardedForAdFree: async () => "unavailable",
  openPrivacyOptions: async () => {},
});

type Interstitial = ReturnType<AdsModule["InterstitialAd"]["createForAdRequest"]>;
type Rewarded = ReturnType<AdsModule["RewardedAd"]["createForAdRequest"]>;
type AppOpen = ReturnType<AdsModule["AppOpenAd"]["createForAdRequest"]>;

export function AdsProvider({ children }: React.PropsWithChildren) {
  const ads = useMemo(loadAdsModule, []);
  const pathname = usePathname();
  const pathRef = useRef(pathname);
  pathRef.current = pathname;

  const [canRequestAds, setCanRequestAds] = useState(false);
  const [privacyOptionsRequired, setPrivacyOptionsRequired] = useState(false);
  const [rewards, setRewards] = useState<Rewards>(emptyRewards);
  const [rewardedReady, setRewardedReady] = useState(false);
  const [, setTick] = useState(0);
  const canRequestRef = useRef(false);
  const rewardsRef = useRef<Rewards>(emptyRewards());
  const session = useRef({
    startedAt: Date.now(),
    lastFullScreenAt: null as number | null,
    shown: 0,
    backgroundedAt: null as number | null,
    coldStart: true,
  });
  const interstitial = useRef<Interstitial | null>(null);
  const rewarded = useRef<Rewarded | null>(null);
  const appOpen = useRef<AppOpen | null>(null);

  const commitRewards = useCallback((next: Rewards) => {
    rewardsRef.current = next;
    setRewards(next);
    void AsyncStorage.setItem(REWARDS_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  const prepareInterstitial = useCallback(() => {
    if (!ads) return;
    const ad = ads.InterstitialAd.createForAdRequest(adUnits().interstitial);
    ad.load();
    interstitial.current = ad;
  }, [ads]);
  const prepareRewarded = useCallback(() => {
    if (!ads) return;
    const ad = ads.RewardedAd.createForAdRequest(adUnits().rewarded);
    setRewardedReady(false);
    const off = ad.addAdEventListener(ads.RewardedAdEventType.LOADED, () => {
      off();
      setRewardedReady(true);
    });
    ad.load();
    rewarded.current = ad;
  }, [ads]);
  const prepareAppOpen = useCallback(() => {
    if (!ads) return;
    const ad = ads.AppOpenAd.createForAdRequest(adUnits().appOpen);
    ad.load();
    appOpen.current = ad;
  }, [ads]);

  // Restore rewards (and the older ad-free key from before rewards existed),
  // then gather consent and start the SDK only if ads may be requested.
  useEffect(() => {
    void (async () => {
      let restored = emptyRewards();
      try {
        const stored = await AsyncStorage.getItem(REWARDS_KEY);
        if (stored) restored = normalizeRewards(JSON.parse(stored));
        else {
          const legacy = Number(await AsyncStorage.getItem(LEGACY_AD_FREE_KEY));
          if (Number.isFinite(legacy) && legacy > Date.now())
            restored = normalizeRewards({ adFreeUntil: legacy });
        }
      } catch {}
      rewardsRef.current = restored;
      setRewards(restored);
    })();
    if (!ads) return;
    let cancelled = false;
    (async () => {
      try {
        await ads.AdsConsent.gatherConsent();
      } catch {
        // A failed consent request (offline, or a form that cannot load) is
        // treated as "cannot request ads" below rather than as permission.
      }
      try {
        const info = await ads.AdsConsent.getConsentInfo();
        if (cancelled) return;
        setPrivacyOptionsRequired(
          info.privacyOptionsRequirementStatus ===
            ads.AdsConsentPrivacyOptionsRequirementStatus.REQUIRED,
        );
        if (!info.canRequestAds) return;
        await ads.default().setRequestConfiguration({
          maxAdContentRating: ads.MaxAdContentRating.G,
          tagForChildDirectedTreatment: false,
          tagForUnderAgeOfConsent: false,
        });
        await ads.default().initialize();
        if (cancelled) return;
        canRequestRef.current = true;
        setCanRequestAds(true);
        // Each loaded ad holds a WebView (tens of MB). The interstitial and
        // the rewarded video are prepared now because either can be wanted
        // within a minute; the app-open ad is only ever shown on a return
        // from the background, so it is prepared the first time the app
        // goes there rather than kept warm from launch.
        prepareInterstitial();
        prepareRewarded();
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [ads, prepareInterstitial, prepareRewarded, prepareAppOpen]);

  // Re-render every half minute while any reward is running so countdowns
  // and gates change on time.
  const anyReward =
    isAdFree(rewards.adFreeUntil) ||
    isWatermarkFree(rewards) ||
    Object.keys(rewards.unlocks).length > 0;
  useEffect(() => {
    if (!anyReward) return;
    const timer = setInterval(() => {
      setTick((value) => value + 1);
      const normalized = normalizeRewards(rewardsRef.current);
      if (JSON.stringify(normalized) !== JSON.stringify(rewardsRef.current)) commitRewards(normalized);
    }, 30_000);
    return () => clearInterval(timer);
  }, [anyReward, commitRewards]);

  const showInterstitial = useCallback(async () => {
    if (!ads) return false;
    const now = Date.now();
    const decision = shouldShowInterstitial(
      {
        canRequestAds: canRequestRef.current,
        adFreeUntil: rewardsRef.current.adFreeUntil,
        sessionStartedAt: session.current.startedAt,
        lastFullScreenAt: session.current.lastFullScreenAt,
        shownThisSession: session.current.shown,
        pathname: pathRef.current,
      },
      now,
    );
    const ad = interstitial.current;
    if (!decision.show || !ad || !ad.loaded) {
      if (canRequestRef.current && ad && !ad.loaded) ad.load();
      return false;
    }
    return new Promise<boolean>((resolve) => {
      const offClosed = ad.addAdEventListener(ads.AdEventType.CLOSED, () => {
        offClosed();
        offError();
        prepareInterstitial();
        resolve(true);
      });
      const offError = ad.addAdEventListener(ads.AdEventType.ERROR, () => {
        offClosed();
        offError();
        prepareInterstitial();
        resolve(false);
      });
      session.current.lastFullScreenAt = now;
      session.current.shown += 1;
      try {
        ad.show();
      } catch {
        offClosed();
        offError();
        prepareInterstitial();
        resolve(false);
      }
    });
  }, [ads, prepareInterstitial]);

  const watchRewarded = useCallback(
    async (purpose: RewardPurpose): Promise<RewardOutcome> => {
      if (!ads || !canRequestRef.current) return "unavailable";
      const ad = rewarded.current;
      if (!ad || !ad.loaded) {
        prepareRewarded();
        return "unavailable";
      }
      return new Promise<RewardOutcome>((resolve) => {
        let earned = false;
        const cleanup = () => {
          offReward();
          offClosed();
          offError();
        };
        const offReward = ad.addAdEventListener(
          ads.RewardedAdEventType.EARNED_REWARD,
          () => {
            earned = true;
          },
        );
        const offClosed = ad.addAdEventListener(ads.AdEventType.CLOSED, () => {
          cleanup();
          if (earned) commitRewards(grantReward(rewardsRef.current, purpose));
          prepareRewarded();
          resolve(earned ? "rewarded" : "dismissed");
        });
        const offError = ad.addAdEventListener(ads.AdEventType.ERROR, () => {
          cleanup();
          prepareRewarded();
          resolve("dismissed");
        });
        session.current.lastFullScreenAt = Date.now();
        try {
          ad.show();
        } catch {
          cleanup();
          prepareRewarded();
          resolve("dismissed");
        }
      });
    },
    [ads, commitRewards, prepareRewarded],
  );

  const openPrivacyOptions = useCallback(async () => {
    if (!ads) return;
    try {
      await ads.AdsConsent.showPrivacyOptionsForm();
      const info = await ads.AdsConsent.getConsentInfo();
      canRequestRef.current = info.canRequestAds;
      setCanRequestAds(info.canRequestAds);
    } catch {}
  }, [ads]);

  // App-open ads: only on a return from a real absence, never on a cold
  // start, never after system UI the app opened itself, and never over the
  // camera or editor (see policy.mjs).
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "background" || state === "inactive") {
        session.current.backgroundedAt = Date.now();
        session.current.coldStart = false;
        if (ads && canRequestRef.current && !appOpen.current) prepareAppOpen();
        return;
      }
      if (state !== "active") return;
      const now = Date.now();
      const systemFlow = inSystemFlow(now);
      endSystemFlow();
      const decision = shouldShowAppOpen(
        {
          canRequestAds: canRequestRef.current,
          adFreeUntil: rewardsRef.current.adFreeUntil,
          coldStart: session.current.coldStart,
          backgroundedAt: session.current.backgroundedAt,
          lastFullScreenAt: session.current.lastFullScreenAt,
          pathname: pathRef.current,
          inSystemFlow: systemFlow,
        },
        now,
      );
      session.current.coldStart = false;
      const ad = appOpen.current;
      if (!ads || !decision.show || !ad || !ad.loaded) {
        if (ads && ad && !ad.loaded && canRequestRef.current) ad.load();
        return;
      }
      session.current.lastFullScreenAt = now;
      const off = ad.addAdEventListener(ads.AdEventType.CLOSED, () => {
        off();
        prepareAppOpen();
      });
      try {
        ad.show();
      } catch {
        off();
        prepareAppOpen();
      }
    });
    return () => subscription.remove();
  }, [ads, prepareAppOpen]);

  const adFree = isAdFree(rewards.adFreeUntil);
  const value = useMemo<Ads>(
    () => ({
      available: !!ads,
      canRequestAds,
      adsEnabled: !!ads && canRequestAds && !adFree,
      adFreeMinutes: minutesLeft(rewards.adFreeUntil),
      rewards,
      rewardedReady,
      watermarkFree: isWatermarkFree(rewards),
      pdfWatermark: pdfWatermark(rewards),
      gateFor: (feature) =>
        shouldGateFeature({ feature, available: !!ads, canRequestAds, rewards }).gate,
      isUnlocked: (feature) => isFeatureUnlocked(rewards, feature),
      privacyOptionsRequired,
      showInterstitial,
      watchRewarded,
      watchRewardedForAdFree: () => watchRewarded("adFree"),
      openPrivacyOptions,
    }),
    [
      ads,
      canRequestAds,
      adFree,
      rewards,
      rewardedReady,
      privacyOptionsRequired,
      showInterstitial,
      watchRewarded,
      openPrivacyOptions,
    ],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export const useAds = () => useContext(Context);
