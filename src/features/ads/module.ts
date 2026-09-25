// Loads the Google Mobile Ads module only where its native side exists. Expo Go
// has no such module and the library throws at import time, so the require is
// guarded and every consumer treats a null module as "no ads on this host".
// That keeps Expo Go usable for development while release builds show ads.
export type AdsModule = typeof import("react-native-google-mobile-ads");

let loaded: AdsModule | null | undefined;

export function loadAdsModule(): AdsModule | null {
  if (loaded !== undefined) return loaded;
  try {
    loaded = require("react-native-google-mobile-ads") as AdsModule;
  } catch {
    loaded = null;
  }
  return loaded;
}
