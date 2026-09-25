import Svg, {
  Circle,
  Defs,
  G,
  LinearGradient,
  Path,
  Rect,
  Stop,
} from "react-native-svg";
import { useTheme } from "../theme/provider";

// Small vector illustrations drawn in the app's own colours, so they follow
// the theme and add nothing to the bundle. Both are decorative: the text
// beside them carries the meaning, so they are hidden from screen readers.

/** A phone scanning a page, with frame corners and a light sweep. */
export function ScanArt({ width = 190, height = 170 }: { width?: number; height?: number }) {
  const { colors, isDark } = useTheme();
  const phone = isDark ? "#0B1B36" : "#1E3A6E";
  const phoneEdge = isDark ? "#27446F" : "#3B5C94";
  const page = isDark ? "#E8EEF8" : "#FFFFFF";
  const line = isDark ? "#A9BBD8" : "#B9C7DE";
  const corner = isDark ? "#FFFFFF" : "#FFFFFF";
  return (
    <Svg
      width={width}
      height={height}
      viewBox="0 0 190 170"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    >
      <Defs>
        <LinearGradient id="sweep" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={colors.blue} stopOpacity="0" />
          <Stop offset="0.5" stopColor="#7FD4FF" stopOpacity="0.95" />
          <Stop offset="1" stopColor={colors.blue} stopOpacity="0" />
        </LinearGradient>
        <LinearGradient id="glow" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#7FD4FF" stopOpacity="0.35" />
          <Stop offset="1" stopColor="#7FD4FF" stopOpacity="0" />
        </LinearGradient>
      </Defs>
      {/* phone, tilted */}
      <G rotation={-14} origin="105, 92">
        <Rect x="58" y="14" width="96" height="156" rx="16" fill={phone} stroke={phoneEdge} strokeWidth="2" />
        <Rect x="66" y="24" width="80" height="136" rx="10" fill={isDark ? "#101F3F" : "#26467F"} />
        <Rect x="94" y="17" width="24" height="3" rx="1.5" fill={phoneEdge} />
      </G>
      {/* page lifted off the phone */}
      <G rotation={-8} origin="98, 86">
        <Rect x="58" y="30" width="80" height="106" rx="6" fill={page} />
        <Rect x="70" y="46" width="52" height="5" rx="2.5" fill={line} />
        <Rect x="70" y="58" width="56" height="5" rx="2.5" fill={line} />
        <Rect x="70" y="70" width="44" height="5" rx="2.5" fill={line} />
        <Rect x="70" y="82" width="54" height="5" rx="2.5" fill={line} />
        <Rect x="70" y="94" width="38" height="5" rx="2.5" fill={line} />
        <Rect x="70" y="106" width="50" height="5" rx="2.5" fill={line} />
        <Circle cx="63" cy="35" r="3" fill={colors.blue} />
        <Circle cx="133" cy="35" r="3" fill={colors.blue} />
        <Circle cx="63" cy="131" r="3" fill={colors.blue} />
        <Circle cx="133" cy="131" r="3" fill={colors.blue} />
      </G>
      {/* light sweep */}
      <Rect x="20" y="86" width="160" height="26" fill="url(#glow)" />
      <Rect x="14" y="84" width="172" height="4" rx="2" fill="url(#sweep)" />
      {/* frame corners */}
      <Path d="M22 34 v-14 h14" stroke={corner} strokeWidth="5" strokeLinecap="round" fill="none" />
      <Path d="M168 34 v-14 h-14" stroke={corner} strokeWidth="5" strokeLinecap="round" fill="none" />
      <Path d="M22 140 v14 h14" stroke={corner} strokeWidth="5" strokeLinecap="round" fill="none" />
      <Path d="M168 140 v14 h-14" stroke={corner} strokeWidth="5" strokeLinecap="round" fill="none" />
    </Svg>
  );
}

/** An open folder with pages, for empty lists. */
export function FolderArt({ size = 132 }: { size?: number }) {
  const { colors, isDark } = useTheme();
  const back = isDark ? "#1B3B75" : "#BBD3F5";
  const front = isDark ? "#2A5CB0" : "#D8E6FA";
  const page = isDark ? "#E8EEF8" : "#FFFFFF";
  const line = isDark ? "#8FA6C9" : "#C3D0E4";
  return (
    <Svg
      width={size}
      height={size * 0.8}
      viewBox="0 0 132 106"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    >
      <Path d="M14 30 h34 l10 10 h58 a8 8 0 0 1 8 8 v48 a8 8 0 0 1 -8 8 H14 a8 8 0 0 1 -8 -8 V38 a8 8 0 0 1 8 -8z" fill={back} />
      <G rotation={-10} origin="70, 60">
        <Rect x="44" y="22" width="52" height="64" rx="5" fill={page} />
        <Rect x="52" y="34" width="34" height="4" rx="2" fill={line} />
        <Rect x="52" y="44" width="30" height="4" rx="2" fill={line} />
        <Rect x="52" y="54" width="36" height="4" rx="2" fill={line} />
      </G>
      <Path d="M6 56 h116 a6 6 0 0 1 6 6 l-8 36 a8 8 0 0 1 -8 6 H14 a8 8 0 0 1 -8 -8z" fill={front} />
      <Path d="M112 16 l6 -8 M120 30 l10 -2 M104 10 l1 -9" stroke={colors.blue} strokeWidth="3" strokeLinecap="round" />
    </Svg>
  );
}
