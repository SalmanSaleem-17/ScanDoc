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
import {
  adFreeMinutesLeft,
  extendAdFree,
  isAdFree,
  shouldShowAppOpen,
  shouldShowInterstitial,
} from "./policy.mjs";

// Ads are consent-first and never in the way. The SDK is initialised only
// after Google's consent flow (UMP) says ads may be requested, so a user who
// declines never has the advertising SDK started at all and loses nothing.
// Full-screen ads follow the rules in policy.mjs: never over the camera or the
// editor, never in the first moments of a session, spaced apart, and switched
// off entirely for an hour after a rewarded video. Every operation is a no-op
// when the native module is absent (Expo Go).

const AD_FREE_KEY = "ads.adFreeUntil";

type RewardOutcome = "rewarded" | "dismissed" | "unavailable";
type Ads = {
  /** The native module exists on this host (false in Expo Go). */
  available: boolean;
  /** Consent has been gathered and ads may be requested. */
  canRequestAds: boolean;
  /** Ads should currently be shown: available, consented and not ad-free. */
  adsEnabled: boolean;
  /** Whole minutes of rewarded ad-free time remaining. */
  adFreeMinutes: number;
  /** The region requires a way to change consent later. */
  privacyOptionsRequired: boolean;
  /** Shows an interstitial if policy allows and one is loaded. */
  showInterstitial: () => Promise<boolean>;
  /** Plays a rewarded video; on reward, grants an ad-free hour. */
  watchRewardedForAdFree: () => Promise<RewardOutcome>;
  /** Reopens the consent form so the user can change their choice. */
  openPrivacyOptions: () => Promise<void>;
};

const Context = createContext<Ads>({
  available: false,
  canRequestAds: false,
  adsEnabled: false,
  adFreeMinutes: 0,
  privacyOptionsRequired: false,
  showInterstitial: async () => false,
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
  const [adFreeUntil, setAdFreeUntil] = useState<number | null>(null);
  const [, setTick] = useState(0);
  const canRequestRef = useRef(false);
  const adFreeRef = useRef<number | null>(null);
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

  const prepareInterstitial = useCallback(() => {
    if (!ads) return;
    const ad = ads.InterstitialAd.createForAdRequest(adUnits().interstitial);
    ad.load();
    interstitial.current = ad;
  }, [ads]);
  const prepareRewarded = useCallback(() => {
    if (!ads) return;
    const ad = ads.RewardedAd.createForAdRequest(adUnits().rewarded);
    ad.load();
    rewarded.current = ad;
  }, [ads]);
  const prepareAppOpen = useCallback(() => {
    if (!ads) return;
    const ad = ads.AppOpenAd.createForAdRequest(adUnits().appOpen);
    ad.load();
    appOpen.current = ad;
  }, [ads]);

  const grantAdFree = useCallback(() => {
    const next = extendAdFree(adFreeRef.current, Date.now());
    adFreeRef.current = next;
    setAdFreeUntil(next);
    void AsyncStorage.setItem(AD_FREE_KEY, String(next)).catch(() => {});
  }, []);

  // Restore the ad-free timer, then gather consent and start the SDK only if
  // ads may be requested.
  useEffect(() => {
    AsyncStorage.getItem(AD_FREE_KEY)
      .then((value) => {
        const until = Number(value);
        if (Number.isFinite(until) && until > Date.now()) {
          adFreeRef.current = until;
          setAdFreeUntil(until);
        }
      })
      .catch(() => {});
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
        prepareInterstitial();
        prepareRewarded();
        prepareAppOpen();
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [ads, prepareInterstitial, prepareRewarded, prepareAppOpen]);

  // Re-render every half minute while ad-free so the banner returns on time.
  useEffect(() => {
    if (!isAdFree(adFreeUntil)) return;
    const timer = setInterval(() => setTick((value) => value + 1), 30_000);
    return () => clearInterval(timer);
  }, [adFreeUntil]);

  const showInterstitial = useCallback(async () => {
    if (!ads) return false;
    const now = Date.now();
    const decision = shouldShowInterstitial(
      {
        canRequestAds: canRequestRef.current,
        adFreeUntil: adFreeRef.current,
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

  const watchRewardedForAdFree = useCallback(async (): Promise<RewardOutcome> => {
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
        if (earned) grantAdFree();
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
  }, [ads, grantAdFree, prepareRewarded]);

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
  // start, and never over the camera or editor (see policy.mjs).
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "background" || state === "inactive") {
        session.current.backgroundedAt = Date.now();
        session.current.coldStart = false;
        return;
      }
      if (state !== "active") return;
      const now = Date.now();
      const decision = shouldShowAppOpen(
        {
          canRequestAds: canRequestRef.current,
          adFreeUntil: adFreeRef.current,
          coldStart: session.current.coldStart,
          backgroundedAt: session.current.backgroundedAt,
          lastFullScreenAt: session.current.lastFullScreenAt,
          pathname: pathRef.current,
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

  const adFree = isAdFree(adFreeUntil);
  const value = useMemo<Ads>(
    () => ({
      available: !!ads,
      canRequestAds,
      adsEnabled: !!ads && canRequestAds && !adFree,
      adFreeMinutes: adFreeMinutesLeft(adFreeUntil),
      privacyOptionsRequired,
      showInterstitial,
      watchRewardedForAdFree,
      openPrivacyOptions,
    }),
    [
      ads,
      canRequestAds,
      adFree,
      adFreeUntil,
      privacyOptionsRequired,
      showInterstitial,
      watchRewardedForAdFree,
      openPrivacyOptions,
    ],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export const useAds = () => useContext(Context);
