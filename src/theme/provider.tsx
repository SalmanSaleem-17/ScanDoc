import React, { createContext, useContext, useEffect, useState } from "react";
import { useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Tinted squares behind tool icons. Each tone is a soft background and a
// saturated foreground that reads on it, in both themes.
export type Tone =
  | "blue"
  | "green"
  | "red"
  | "purple"
  | "orange"
  | "violet"
  | "cyan"
  | "emerald";
type TonePair = { bg: string; fg: string };
type Tones = Record<Tone, TonePair>;

const light = {
  background: "#F3F6FB",
  surface: "#FFFFFF",
  text: "#0F172A",
  secondary: "#64748B",
  border: "#E4EAF3",
  blue: "#1A6DFF",
  tint: "#E8F0FF",
  navy: "#061A40",
  success: "#0E9F6E",
  danger: "#DC2626",
  dangerTint: "#FEE9E9",
  /** Hero card gradient, top-left to bottom-right. */
  hero: ["#DDEBFF", "#BFD9FF"] as [string, string],
  heroText: "#0F172A",
  heroMuted: "#3B5580",
  shadow: "#0F2A5A",
  tones: {
    blue: { bg: "#E3EEFF", fg: "#1A6DFF" },
    green: { bg: "#E0F7EE", fg: "#10B981" },
    red: { bg: "#FDE8E8", fg: "#EF4444" },
    purple: { bg: "#EEE8FF", fg: "#7C3AED" },
    orange: { bg: "#FFF1DB", fg: "#F59E0B" },
    violet: { bg: "#EFE6FF", fg: "#8B5CF6" },
    cyan: { bg: "#DDF6FB", fg: "#06B6D4" },
    emerald: { bg: "#E4F6EA", fg: "#16A34A" },
  } as Tones,
};
const dark: typeof light = {
  background: "#070D1A",
  surface: "#0F182A",
  text: "#F1F5FB",
  secondary: "#93A2BC",
  border: "#1B2A44",
  blue: "#4A8DFF",
  tint: "#132648",
  navy: "#061A40",
  success: "#34D399",
  danger: "#F87171",
  dangerTint: "#3A1A1F",
  hero: ["#0F2A55", "#0A1C3A"],
  heroText: "#F1F5FB",
  heroMuted: "#A9BBD8",
  shadow: "#000000",
  tones: {
    blue: { bg: "#0F2445", fg: "#4A8DFF" },
    green: { bg: "#0C2A22", fg: "#34D399" },
    red: { bg: "#331519", fg: "#F87171" },
    purple: { bg: "#1E1636", fg: "#A78BFA" },
    orange: { bg: "#2C1F0F", fg: "#FBBF24" },
    violet: { bg: "#211A3A", fg: "#B394FF" },
    cyan: { bg: "#0C2A33", fg: "#22D3EE" },
    emerald: { bg: "#0E2A1C", fg: "#4ADE80" },
  },
};
type Mode = "system" | "light" | "dark";
const Context = createContext({
  colors: light,
  isDark: false,
  mode: "system" as Mode,
  setMode: (_: Mode) => {},
});
export function ThemeProvider({ children }: React.PropsWithChildren) {
  const system = useColorScheme();
  const [mode, update] = useState<Mode>("system");
  useEffect(() => {
    AsyncStorage.getItem("theme")
      .then((value) => {
        if (value === "system" || value === "light" || value === "dark")
          update(value);
      })
      .catch(() => {});
  }, []);
  const isDark = mode === "dark" || (mode === "system" && system === "dark");
  return (
    <Context.Provider
      value={{
        colors: isDark ? dark : light,
        isDark,
        mode,
        setMode: (value) => {
          update(value);
          void AsyncStorage.setItem("theme", value).catch(() => {});
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
export const useTheme = () => useContext(Context);
