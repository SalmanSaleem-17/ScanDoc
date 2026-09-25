import { useEffect, useState } from "react";
import { Image, Text, View, type ViewStyle } from "react-native";
import { useTheme } from "../../theme/provider";
import { loadAdsModule, type AdsModule } from "./module";
import { adUnits } from "./config";
import { useAds } from "./provider";

type NativeAd = Awaited<ReturnType<AdsModule["NativeAd"]["createForAdRequest"]>>;

/**
 * The one in-feed placement: a native ad drawn in the app's own card style at
 * the end of a tab screen, after the content, so it reads as the last item
 * rather than a strip stuck to the bar. It takes no space until an ad has
 * loaded, is never shown inside a document, the camera or the editor, and is
 * hidden entirely while a rewarded ad-free period runs.
 */
export function NativeAdCard({ style }: { style?: ViewStyle }) {
  const ads = loadAdsModule();
  const { adsEnabled } = useAds();
  const { colors } = useTheme();
  const [ad, setAd] = useState<NativeAd | null>(null);
  useEffect(() => {
    if (!ads || !adsEnabled) return;
    let live = true;
    let loaded: NativeAd | null = null;
    // One request, one retry a little later: native fill is patchier than
    // banners, and a screen that stays open deserves a second look. A card
    // that never loads simply never appears.
    const units = [adUnits().native, __DEV__ ? ads.TestIds.NATIVE_VIDEO : adUnits().native];
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const request = () => {
      ads.NativeAd.createForAdRequest(units[Math.min(attempt, units.length - 1)], {
        requestNonPersonalizedAdsOnly: false,
      })
        .then((result) => {
          if (!live) return result.destroy();
          loaded = result;
          setAd(result);
        })
        .catch((error: unknown) => {
          if (__DEV__) console.warn("[NativeAdCard] load failed:", String(error));
          if (live && attempt < 1) {
            attempt += 1;
            timer = setTimeout(request, 20_000);
          }
        });
    };
    request();
    return () => {
      live = false;
      if (timer) clearTimeout(timer);
      loaded?.destroy();
      setAd(null);
    };
  }, [ads, adsEnabled]);
  if (!ads || !adsEnabled || !ad) return null;
  const { NativeAdView, NativeAsset, NativeAssetType, NativeMediaView } = ads;
  return (
    <NativeAdView
      nativeAd={ad}
      style={[
        {
          marginTop: 24,
          borderRadius: 20,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          padding: 16,
          gap: 12,
        },
        style,
      ]}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        {ad.icon ? (
          <NativeAsset assetType={NativeAssetType.ICON}>
            <Image source={{ uri: ad.icon.url }} style={{ width: 44, height: 44, borderRadius: 10 }} />
          </NativeAsset>
        ) : null}
        <View style={{ flex: 1 }}>
          <NativeAsset assetType={NativeAssetType.HEADLINE}>
            <Text numberOfLines={1} style={{ color: colors.text, fontSize: 15, fontWeight: "700" }}>
              {ad.headline}
            </Text>
          </NativeAsset>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4, backgroundColor: colors.tones.orange.bg }}>
              <Text style={{ color: colors.tones.orange.fg, fontSize: 10, fontWeight: "800" }}>Ad</Text>
            </View>
            {ad.advertiser ? (
              <NativeAsset assetType={NativeAssetType.ADVERTISER}>
                <Text numberOfLines={1} style={{ color: colors.secondary, fontSize: 12 }}>{ad.advertiser}</Text>
              </NativeAsset>
            ) : null}
          </View>
        </View>
      </View>
      {ad.mediaContent ? (
        <NativeMediaView
          resizeMode="cover"
          style={{ width: "100%", aspectRatio: Math.max(1.2, Math.min(2.2, ad.mediaContent.aspectRatio || 1.91)), borderRadius: 12, overflow: "hidden" }}
        />
      ) : null}
      {ad.body ? (
        <NativeAsset assetType={NativeAssetType.BODY}>
          <Text numberOfLines={2} style={{ color: colors.secondary, fontSize: 13, lineHeight: 18 }}>{ad.body}</Text>
        </NativeAsset>
      ) : null}
      <NativeAsset assetType={NativeAssetType.CALL_TO_ACTION}>
        <Text
          style={{
            alignSelf: "flex-start",
            paddingHorizontal: 18,
            paddingVertical: 10,
            borderRadius: 12,
            overflow: "hidden",
            backgroundColor: colors.blue,
            color: "#FFFFFF",
            fontWeight: "700",
            fontSize: 14,
          }}
        >
          {ad.callToAction}
        </Text>
      </NativeAsset>
    </NativeAdView>
  );
}
