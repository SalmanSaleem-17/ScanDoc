import { Tabs, router } from "expo-router";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon, Label, type IconName } from "../../src/components/ui";
import { useTheme } from "../../src/theme/provider";
const destinations: { route: string; title: string; icon: IconName }[] = [
  { route: "index", title: "Home", icon: "grid-outline" },
  { route: "documents", title: "Documents", icon: "documents-outline" },
  { route: "tools", title: "Tools", icon: "apps-outline" },
  { route: "settings", title: "Settings", icon: "settings-outline" },
];
export default function TabLayout() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={({ state, navigation }) => (
        <View
          style={{
            paddingBottom: insets.bottom,
            paddingLeft: insets.left,
            paddingRight: insets.right,
            backgroundColor: colors.surface,
            borderTopWidth: 1,
            borderColor: colors.border,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              minHeight: 76,
              maxWidth: 860,
              width: "100%",
              alignSelf: "center",
            }}
          >
            {destinations.map((item, index) => (
              <View
                key={item.route}
                style={{
                  flex: index === 1 ? 2 : 1,
                  flexDirection: "row",
                  alignItems: "center",
                }}
              >
                <Pressable
                  accessibilityRole="tab"
                  accessibilityState={{
                    selected: state.routes[state.index].name === item.route,
                  }}
                  accessibilityLabel={item.title}
                  onPress={() => navigation.navigate(item.route)}
                  style={{
                    flex: 1,
                    alignItems: "center",
                    justifyContent: "center",
                    minHeight: 64,
                    gap: 5,
                  }}
                >
                  <Icon
                    name={item.icon}
                    color={
                      state.routes[state.index].name === item.route
                        ? colors.blue
                        : colors.secondary
                    }
                  />
                  <Label
                    style={{
                      fontSize: 10,
                      lineHeight: 15,
                      color:
                        state.routes[state.index].name === item.route
                          ? colors.blue
                          : colors.secondary,
                    }}
                  >
                    {item.title}
                  </Label>
                </Pressable>
                {index === 1 && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Scan document"
                    onPress={() => router.push("/scanner")}
                    style={{ flex: 1, alignItems: "center", gap: 4 }}
                  >
                    <View
                      style={{
                        width: 52,
                        height: 48,
                        backgroundColor: "#075FE4",
                        borderRadius: 16,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Icon name="scan-outline" color="white" size={28} />
                    </View>
                    <Label
                      style={{
                        fontSize: 10,
                        lineHeight: 15,
                        color: colors.blue,
                      }}
                    >
                      Scan
                    </Label>
                  </Pressable>
                )}
              </View>
            ))}
          </View>
        </View>
      )}
    >
      {destinations.map((item) => (
        <Tabs.Screen
          key={item.route}
          name={item.route}
          options={{ title: item.title }}
        />
      ))}
    </Tabs>
  );
}
