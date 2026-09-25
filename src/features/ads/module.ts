import { TurboModuleRegistry } from "react-native";

// Loads the Google Mobile Ads module only where its native side exists. Expo Go
// has no such module, and every consumer treats a null module as "no ads on
// this host", which keeps Expo Go usable for development while builds show
// ads.
//
// The native side is checked through the registry before anything is
// required. The library asks for its module with getEnforcing at import time,
// and an error thrown while Metro is loading a module is not returned to the
// caller: Metro reports it through ErrorUtils (a red error box in Expo Go,
// and in a release build the global handler) and the require evaluates to
// undefined. A try/catch around the require therefore never ran, the result
// was never cached, and the error was raised again on every render.
export type AdsModule = typeof import("react-native-google-mobile-ads");

const NATIVE_MODULE = "RNGoogleMobileAdsModule";

let loaded: AdsModule | null | undefined;

function nativeSidePresent() {
  try {
    return TurboModuleRegistry.get(NATIVE_MODULE) != null;
  } catch {
    return false;
  }
}

export function loadAdsModule(): AdsModule | null {
  if (loaded !== undefined) return loaded;
  if (!nativeSidePresent()) {
    loaded = null;
    return loaded;
  }
  try {
    loaded = (require("react-native-google-mobile-ads") as AdsModule) ?? null;
  } catch {
    loaded = null;
  }
  return loaded;
}
