import React, { createContext, useContext, useEffect, useState } from "react";
import { useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
const light = {
  background: "#F6F8FC",
  surface: "#FFFFFF",
  text: "#101828",
  secondary: "#667085",
  border: "#E4E7EC",
  blue: "#075FE4",
  tint: "#EAF2FF",
  navy: "#061A40",
  success: "#087F50",
};
const dark: typeof light = {
  background: "#07111F",
  surface: "#101C2E",
  text: "#F2F5FA",
  secondary: "#A4B2C7",
  border: "#26364C",
  blue: "#70B3FF",
  tint: "#142D4D",
  navy: "#061A40",
  success: "#56DCA0",
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
