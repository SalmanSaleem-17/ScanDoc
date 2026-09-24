import { useEffect } from "react";
import { View } from "react-native";
import { NavigationBar } from "expo-navigation-bar";
import * as SystemUI from "expo-system-ui";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, initialWindowMetrics } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { ThemeProvider, useTheme } from "../src/theme/provider";
import { DocumentsProvider } from "../src/features/documents/provider";
export { ErrorBoundary } from "expo-router";
function Navigation() {
  const { isDark, colors } = useTheme();
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(colors.background).catch(() => {});
  }, [colors.background]);
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar hidden={false} style={isDark ? "light" : "dark"} />
      <NavigationBar hidden={false} style={isDark ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          animation: "slide_from_right",
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="scanner"
          options={{ presentation: "fullScreenModal" }}
        />
      </Stack>
    </View>
  );
}
export default function Layout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <ThemeProvider>
          <DocumentsProvider>
            <Navigation />
          </DocumentsProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
