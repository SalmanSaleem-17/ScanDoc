import { useState } from "react";
import { View } from "react-native";
import { useTheme } from "../../theme/provider";
import { loadAdsModule } from "./module";
import { adUnits } from "./config";
import { useAds } from "./provider";

/**
 * The one banner placement: a standard-height anchored adaptive banner that
 * sits above the tab bar, so it is never inside a document, the camera or
 * the editor. The standard size (about 50 to 60 dp) was chosen over the
 * "large" variant, which took a third of a small screen. It renders nothing
 * until ads are allowed, and collapses rather than leaving a gap when no ad
 * fills.
 */
export function Banner() {
  const ads = loadAdsModule();
  const { adsEnabled } = useAds();
  const { colors } = useTheme();
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  if (!ads || !adsEnabled || failed) return null;
  const { BannerAd, BannerAdSize } = ads;
  // Until an ad has actually loaded the slot takes no space: an empty
  // reserved strip above the tab bar reads as a layout bug, and on a device
  // with no fill it would stay empty.
  return (
    <View
      accessibilityLabel="Advertisement"
      style={{
        alignItems: "center",
        backgroundColor: colors.background,
        height: loaded ? undefined : 0,
        overflow: "hidden",
      }}
    >
      <BannerAd
        unitId={adUnits().banner}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        onAdLoaded={() => {
          setLoaded(true);
          setFailed(false);
        }}
        onAdFailedToLoad={() => setFailed(true)}
      />
    </View>
  );
}
