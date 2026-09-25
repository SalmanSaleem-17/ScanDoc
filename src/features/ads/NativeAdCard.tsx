import { useEffect, useState } from "react";
import { Image, InteractionManager, Text, View, type ViewStyle } from "react-native";
import { useTheme } from "../../theme/provider";
import { loadAdsModule, type AdsModule } from "./module";
import { adUnits } from "./config";
import { useAds } from "./provider";

type NativeAd = Awaited<ReturnType<AdsModule["NativeAd"]["createForAdRequest"]>>;

// One native ad is shared by every card on screen. The tab screens all stay
// mounted once visited, so without sharing each would issue its own request
// and the SDK would parse four responses at once on the main thread; with it
// there is one request, refreshed only after it has been shown for a while.
// The request is also deferred until the first screen has painted and the
// JS thread is idle, so it never competes with start-up.
const REFRESH_AFTER_MS = 3 * 60 * 1000;
const FIRST_REQUEST_DELAY_MS = 4000;
const RETRY_DELAY_MS = 20_000;
let shared: { ad: NativeAd; loadedAt: number } | null = null;
let pending: Promise<NativeAd | null> | null = null;

function loadShared(ads: AdsModule, attempt = 0): Promise<NativeAd | null> {
  if (shared && Date.now() - shared.loadedAt < REFRESH_AFTER_MS) return Promise.resolve(shared.ad);
  if (pending) return pending;
  const unit = attempt === 0 || !__DEV__ ? adUnits().native : ads.TestIds.NATIVE_VIDEO;
  pending = ads.NativeAd.createForAdRequest(unit, { requestNonPersonalizedAdsOnly: false })
    .then((ad) => {
      shared?.ad.destroy();
      shared = { ad, loadedAt: Date.now() };
      return ad;
    })
    .catch((error: unknown) => {
      if (__DEV__) console.warn("[NativeAdCard] load failed:", String(error));
      if (attempt < 1)
        return new Promise<NativeAd | null>((resolve) =>
          setTimeout(() => {
            pending = null;
            resolve(loadShared(ads, attempt + 1));
          }, RETRY_DELAY_MS),
        );
      return null;
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}

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
    let timer: ReturnType<typeof setTimeout> | undefined;
    const handle = InteractionManager.runAfterInteractions(() => {
      timer = setTimeout(() => {
        void loadShared(ads).then((result) => {
          if (live) setAd(result);
        });
      }, FIRST_REQUEST_DELAY_MS);
    });
    return () => {
      live = false;
      handle.cancel();
      if (timer) clearTimeout(timer);
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
