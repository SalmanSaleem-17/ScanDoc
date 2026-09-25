import { useEffect } from "react";
import { Platform, StatusBar as NativeStatusBar, View } from "react-native";
import { NavigationBar } from "expo-navigation-bar";
import * as SystemUI from "expo-system-ui";
import { Stack } from "expo-router";
import { StatusBar, setStatusBarStyle } from "expo-status-bar";
import { SafeAreaProvider, initialWindowMetrics } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { ThemeProvider, useTheme } from "../src/theme/provider";
import { DocumentsProvider } from "../src/features/documents/provider";
import { AdsProvider } from "../src/features/ads/provider";
export { ErrorBoundary } from "expo-router";
function Navigation() {
  const { isDark, colors } = useTheme();
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(colors.background).catch(() => {});
  }, [colors.background]);
  useEffect(() => {
    // The <StatusBar> below declares the icon style, but on Android the
    // activity can be handed over with the opposite style already applied,
    // so it is asserted imperatively as well whenever the theme is known.
    setStatusBarStyle(isDark ? "light" : "dark", true);
  }, [isDark]);
  useEffect(() => {
    // Every screen paints its own background behind the status bar, so the
    // bar itself must be transparent. Built apps get that from the platform's
    // mandatory edge-to-edge window, and React Native ignores these calls
    // there (a native log line, nothing user-visible). Expo Go lays the app
    // out behind the bar too, but leaves the bar's own background opaque
    // black, which on a light page shows as a black strip across the top;
    // measured on a device, the top inset there is the full bar height, so
    // only the colour is wrong. Making it translucent and transparent lets
    // the page show through exactly as it does in a build.
    if (Platform.OS !== "android") return;
    NativeStatusBar.setTranslucent(true);
    NativeStatusBar.setBackgroundColor("transparent", false);
  }, []);
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar hidden={false} style={isDark ? "light" : "dark"} />
      <NavigationBar hidden={false} style={isDark ? "light" : "dark"} />
      <AdsProvider>
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
      </AdsProvider>
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
