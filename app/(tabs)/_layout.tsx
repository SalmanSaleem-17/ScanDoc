import { Tabs, router } from "expo-router";
import { Platform, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon, Label, type IconName } from "../../src/components/ui";
import { useTheme } from "../../src/theme/provider";
const destinations: { route: string; title: string; icon: IconName; active: IconName }[] = [
  { route: "index", title: "Home", icon: "home-outline", active: "home" },
  { route: "documents", title: "Documents", icon: "document-text-outline", active: "document-text" },
  { route: "tools", title: "Tools", icon: "grid-outline", active: "grid" },
  { route: "settings", title: "Settings", icon: "settings-outline", active: "settings" },
];
// A floating pill with the scan button raised out of its centre. Ads never
// sit here: the one in-feed placement is the native card at the end of each
// tab screen (src/features/ads/NativeAdCard.tsx).
export default function TabLayout() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={({ state, navigation }) => (
        <View
          style={{
            paddingBottom: Math.max(insets.bottom, 10),
            paddingLeft: insets.left,
            paddingRight: insets.right,
            backgroundColor: colors.background,
          }}
        >
          <View
            style={{
              marginHorizontal: 14,
              // Headroom for the scan button, which rises 30 px above the pill.
              marginTop: 34,
              maxWidth: 860,
              width: undefined,
              alignSelf: "stretch",
              borderRadius: 32,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
              flexDirection: "row",
              alignItems: "center",
              minHeight: 68,
              ...Platform.select({
                android: { elevation: isDark ? 0 : 6 },
                default: {
                  shadowColor: colors.shadow,
                  shadowOpacity: isDark ? 0 : 0.12,
                  shadowRadius: 16,
                  shadowOffset: { width: 0, height: 6 },
                },
              }),
            }}
          >
            {destinations.map((item, index) => {
              const selected = state.routes[state.index].name === item.route;
              return (
                <View
                  key={item.route}
                  style={{ flex: index === 1 ? 2 : 1, flexDirection: "row", alignItems: "center" }}
                >
                  <Pressable
                    accessibilityRole="tab"
                    accessibilityState={{ selected }}
                    accessibilityLabel={item.title}
                    onPress={() => navigation.navigate(item.route)}
                    style={{ flex: 1, alignItems: "center", justifyContent: "center", minHeight: 64, gap: 4 }}
                  >
                    <Icon name={selected ? item.active : item.icon} color={selected ? colors.blue : colors.secondary} size={23} />
                    <Label style={{ fontSize: 11, lineHeight: 14, fontWeight: selected ? "700" : "500", color: selected ? colors.blue : colors.secondary }}>
                      {item.title}
                    </Label>
                  </Pressable>
                  {index === 1 && (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Scan document"
                      onPress={() => router.push("/scanner")}
                      style={{ flex: 1, alignItems: "center", justifyContent: "center", minHeight: 64 }}
                    >
                      <View
                        style={{
                          width: 62,
                          height: 62,
                          borderRadius: 31,
                          marginTop: -30,
                          backgroundColor: colors.blue,
                          borderWidth: 5,
                          borderColor: colors.background,
                          alignItems: "center",
                          justifyContent: "center",
                          ...Platform.select({
                            android: { elevation: 8 },
                            default: { shadowColor: colors.blue, shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } },
                          }),
                        }}
                      >
                        <Icon name="scan-outline" color="white" size={28} />
                      </View>
                      <Label style={{ fontSize: 11, lineHeight: 14, fontWeight: "700", color: colors.blue, marginTop: 2 }}>
                        Scan
                      </Label>
                    </Pressable>
                  )}
                </View>
              );
            })}
          </View>
        </View>
      )}
    >
      {destinations.map((item) => (
        <Tabs.Screen key={item.route} name={item.route} options={{ title: item.title }} />
      ))}
    </Tabs>
  );
}
