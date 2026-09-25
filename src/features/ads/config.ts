import { loadAdsModule } from "./module";

export const POLICY_URL = "https://salmansaleem.dev/privacy/scandoc";

// AdMob units for ScanDoc (app ca-app-pub-5067154930063661~4141451131).
// Native and rewarded-interstitial units exist in the console but are not used:
// native ads need bespoke layouts, and a second rewarded format adds nothing
// the ad-free hour does not already offer.
const PRODUCTION = {
  banner: "ca-app-pub-5067154930063661/7087178672",
  interstitial: "ca-app-pub-5067154930063661/5742307417",
  rewarded: "ca-app-pub-5067154930063661/6759875612",
  appOpen: "ca-app-pub-5067154930063661/7578133268",
};

/**
 * Development builds must never request real ads: clicks and impressions on
 * them count as invalid traffic against the account. Google's published test
 * units are used whenever __DEV__ is set, which covers Expo Go, the
 * development client and any debug build.
 */
export function adUnits() {
  const ads = loadAdsModule();
  if (__DEV__ && ads)
    return {
      banner: ads.TestIds.ADAPTIVE_BANNER,
      interstitial: ads.TestIds.INTERSTITIAL,
      rewarded: ads.TestIds.REWARDED,
      appOpen: ads.TestIds.APP_OPEN,
    };
  return PRODUCTION;
}
