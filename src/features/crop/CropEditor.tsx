import { useCallback, useEffect, useMemo, useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import * as Haptics from "expo-haptics";
import {
  handlePoint,
  isUsableQuad,
  moveCorner,
  moveEdge,
  moveQuad,
  nearestHandle,
  quadPath,
} from "./geometry.mjs";

const AnimatedPath = Animated.createAnimatedComponent(Path);
// Room for a handle sitting exactly on the image border to stay fully visible
// and reachable without being clipped by the container.
const PAD = 26;
const LOUPE = 116;
const ZOOM = 2.6;
// Forgiving grab radius: larger than the drawn handle so fingertips land.
const REACH = 46;
// activeId: -1 idle, 0-3 a corner, 10-13 an edge, 20 the whole quad.
const EDGE_BASE = 10;
const QUAD_ID = 20;

function Handle({
  points,
  activeId,
  kind,
  index,
  imageWidth,
  imageHeight,
  offsetX,
  offsetY,
}: {
  points: SharedValue<number[]>;
  activeId: SharedValue<number>;
  kind: "corner" | "edge";
  index: number;
  imageWidth: number;
  imageHeight: number;
  offsetX: number;
  offsetY: number;
}) {
  const size = kind === "corner" ? 30 : 22;
  const id = kind === "corner" ? index : EDGE_BASE + index;
  const style = useAnimatedStyle(() => {
    const point = handlePoint(points.value, kind, index);
    return {
      left: offsetX + point[0] * imageWidth - size / 2,
      top: offsetY + point[1] * imageHeight - size / 2,
      transform: [
        { scale: withTiming(activeId.value === id ? 1.35 : 1, { duration: 120 }) },
      ],
    };
  });
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: "#FFFFFF",
          borderWidth: kind === "corner" ? 3 : 2,
          borderColor: "#075FE4",
        },
        style,
      ]}
    />
  );
}

export function CropEditor({
  uri,
  ratio,
  corners,
  onChange,
  disabled = false,
}: {
  uri: string;
  ratio: number;
  corners: number[];
  onChange: (corners: number[]) => void;
  disabled?: boolean;
}) {
  const [area, setArea] = useState({ width: 0, height: 0 });
  const points = useSharedValue(corners);
  const origin = useSharedValue(corners);
  const activeId = useSharedValue(-1);
  const focus = useSharedValue([0.5, 0.5]);
  const loupe = useSharedValue(0);

  // Auto-detect, reset and rotate all change corners from the JS side.
  useEffect(() => {
    points.value = corners;
  }, [corners, points]);

  const safeRatio = Number.isFinite(ratio) && ratio > 0 ? ratio : 0.75;
  const { imageWidth, imageHeight, offsetX, offsetY } = useMemo(() => {
    const availableWidth = Math.max(1, area.width - PAD * 2);
    const availableHeight = Math.max(1, area.height - PAD * 2);
    const width =
      availableWidth / availableHeight > safeRatio
        ? availableHeight * safeRatio
        : availableWidth;
    const height = width / safeRatio;
    return {
      imageWidth: width,
      imageHeight: height,
      offsetX: (area.width - width) / 2,
      offsetY: (area.height - height) / 2,
    };
  }, [area.width, area.height, safeRatio]);

  const commit = useCallback(
    (next: number[]) => onChange([...next]),
    [onChange],
  );
  const buzz = useCallback(() => {
    void Haptics.selectionAsync().catch(() => {});
  }, []);

  const ready = imageWidth > 1 && area.width > 1;

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(!disabled && ready)
        .minDistance(0)
        .onBegin((event) => {
          const hit = nearestHandle(
            points.value,
            event.x - offsetX,
            event.y - offsetY,
            imageWidth,
            imageHeight,
            REACH,
          );
          if (hit.kind === "none") {
            activeId.value = -1;
            return;
          }
          activeId.value =
            hit.kind === "corner"
              ? hit.index
              : hit.kind === "edge"
                ? EDGE_BASE + hit.index
                : QUAD_ID;
          origin.value = points.value;
          if (hit.kind !== "quad") {
            focus.value = handlePoint(points.value, hit.kind, hit.index);
            loupe.value = withTiming(1, { duration: 140 });
          }
          runOnJS(buzz)();
        })
        .onUpdate((event) => {
          const id = activeId.value;
          if (id < 0) return;
          const dx = event.translationX / imageWidth;
          const dy = event.translationY / imageHeight;
          const next =
            id < EDGE_BASE
              ? moveCorner(origin.value, id, dx, dy)
              : id < QUAD_ID
                ? moveEdge(origin.value, id - EDGE_BASE, dx, dy)
                : moveQuad(origin.value, dx, dy);
          // Refusing the frame keeps the last good quad on screen, so the crop
          // can never be dragged into a shape the export step would reject.
          if (!isUsableQuad(next, imageWidth, imageHeight)) return;
          points.value = next;
          if (id < QUAD_ID)
            focus.value = handlePoint(
              next,
              id < EDGE_BASE ? "corner" : "edge",
              id < EDGE_BASE ? id : id - EDGE_BASE,
            );
        })
        .onFinalize(() => {
          if (activeId.value >= 0) runOnJS(commit)(points.value);
          activeId.value = -1;
          loupe.value = withTiming(0, { duration: 160 });
        }),
    [
      disabled,
      ready,
      imageWidth,
      imageHeight,
      offsetX,
      offsetY,
      commit,
      buzz,
      activeId,
      focus,
      loupe,
      origin,
      points,
    ],
  );

  // Even-odd fill: the outer rectangle minus the quad, so only the discarded
  // area is dimmed and the kept area stays at full brightness.
  const dimProps = useAnimatedProps(() => ({
    d: `M0 0 H${area.width} V${area.height} H0 Z ${quadPath(points.value, offsetX, offsetY, imageWidth, imageHeight)}`,
  }));
  const outlineProps = useAnimatedProps(() => ({
    d: quadPath(points.value, offsetX, offsetY, imageWidth, imageHeight),
  }));

  // The loupe sits out of the way of the finger: it moves aside only when the
  // dragged point would be underneath it.
  const loupeBox = useAnimatedStyle(() => {
    const point = focus.value;
    const x = offsetX + point[0] * imageWidth;
    const y = offsetY + point[1] * imageHeight;
    const collides = x < LOUPE + 40 && y < LOUPE + 40;
    return {
      opacity: loupe.value,
      left: collides ? area.width - LOUPE - 14 : 14,
    };
  });
  const loupeImage = useAnimatedStyle(() => {
    const point = focus.value;
    return {
      transform: [
        { translateX: LOUPE / 2 - point[0] * imageWidth * ZOOM },
        { translateY: LOUPE / 2 - point[1] * imageHeight * ZOOM },
      ],
    };
  });

  return (
    <View
      style={{ flex: 1 }}
      onLayout={(event) =>
        setArea({
          width: event.nativeEvent.layout.width,
          height: event.nativeEvent.layout.height,
        })
      }
    >
      {ready && (
        <GestureDetector gesture={pan}>
          <View
            style={StyleSheet.absoluteFill}
            accessible
            accessibilityLabel="Crop area. Drag the corner or edge handles to fit the page, or drag inside the frame to move it. Use Fine adjust below for precise changes."
          >
            <Image
              source={{ uri }}
              resizeMode="stretch"
              style={{
                position: "absolute",
                left: offsetX,
                top: offsetY,
                width: imageWidth,
                height: imageHeight,
              }}
            />
            <Svg
              width={area.width}
              height={area.height}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            >
              <AnimatedPath
                animatedProps={dimProps}
                fill="rgba(4,14,30,0.62)"
                fillRule="evenodd"
              />
              <AnimatedPath
                animatedProps={outlineProps}
                fill="none"
                stroke="#17D7FF"
                strokeWidth={2}
              />
            </Svg>
            {[0, 1, 2, 3].map((index) => (
              <Handle
                key={`edge-${index}`}
                kind="edge"
                index={index}
                points={points}
                activeId={activeId}
                imageWidth={imageWidth}
                imageHeight={imageHeight}
                offsetX={offsetX}
                offsetY={offsetY}
              />
            ))}
            {[0, 1, 2, 3].map((index) => (
              <Handle
                key={`corner-${index}`}
                kind="corner"
                index={index}
                points={points}
                activeId={activeId}
                imageWidth={imageWidth}
                imageHeight={imageHeight}
                offsetX={offsetX}
                offsetY={offsetY}
              />
            ))}
            <Animated.View
              pointerEvents="none"
              style={[
                {
                  position: "absolute",
                  top: 14,
                  width: LOUPE,
                  height: LOUPE,
                  borderRadius: LOUPE / 2,
                  borderWidth: 3,
                  borderColor: "#FFFFFF",
                  backgroundColor: "#061A40",
                  overflow: "hidden",
                },
                loupeBox,
              ]}
            >
              <Animated.Image
                source={{ uri }}
                resizeMode="stretch"
                style={[
                  {
                    position: "absolute",
                    width: imageWidth * ZOOM,
                    height: imageHeight * ZOOM,
                  },
                  loupeImage,
                ]}
              />
              <View
                style={{
                  position: "absolute",
                  left: LOUPE / 2 - 0.5,
                  width: 1,
                  height: LOUPE,
                  backgroundColor: "rgba(23,215,255,0.95)",
                }}
              />
              <View
                style={{
                  position: "absolute",
                  top: LOUPE / 2 - 0.5,
                  height: 1,
                  width: LOUPE,
                  backgroundColor: "rgba(23,215,255,0.95)",
                }}
              />
            </Animated.View>
          </View>
        </GestureDetector>
      )}
    </View>
  );
}
