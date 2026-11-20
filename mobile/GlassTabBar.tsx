import { SchoolIcon } from "./SchoolIcon";
import React, { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, PanResponder, Platform, StyleSheet, View } from "react-native";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { GlassPressable, useReducedMotion } from "./GlassIcon";

const tabs = ["Today", "Lesson", "Profile"] as const;
type Tab = (typeof tabs)[number];
const inset = 7;
const dragThreshold = 8;
const isWeb = Platform.OS === "web";
const labelColor = "#eeeef5";
const selectedLabelColor = "#b5afff";

export function GlassTabBar({ activeTab, onSelect }: {
  activeTab: string | null;
  onSelect: (tab: Tab) => void;
}) {
  const container = useRef<React.ComponentRef<typeof View>>(null);
  const bounds = useRef({ x: 0, y: 0, width: 0, height: 0 });
  const dragging = useRef(false);
  const suppressPointerClick = useRef(false);
  const touchStart = useRef<{ id: number; tab: Tab; x: number; y: number } | null>(null);
  const [preview, setPreview] = useState<number | null>(null);
  const [width, setWidth] = useState(0);
  const reducedMotion = useReducedMotion();
  const activeIndex = tabs.findIndex(tab => tab === activeTab);
  const [position] = useState(() => new Animated.Value(Math.max(0, activeIndex)));
  const tabWidth = Math.max(0, (width - inset * 2) / tabs.length);
  const translateX = useMemo(() => position.interpolate({
    inputRange: [0, 1],
    outputRange: [0, tabWidth],
  }), [position, tabWidth]);
  // The same value drives the highlight, icon tint, and label color during
  // both a slide and a drag, including when a new tap interrupts the slide.
  const tabMotion = useMemo(() => tabs.map((_, index) => {
    const tint = position.interpolate({
      inputRange: [index - 1, index, index + 1],
      outputRange: [0, 1, 0],
      extrapolate: "clamp",
    });
    return { tint, color: tint.interpolate({ inputRange: [0, 1], outputRange: [labelColor, selectedLabelColor] }) };
  }), [position]);
  const isPreviewing = preview !== null;

  useLayoutEffect(() => {
    if (isPreviewing || activeIndex < 0) return;
    if (reducedMotion) {
      position.setValue(activeIndex);
      return;
    }
    const slide = Animated.timing(position, {
      toValue: activeIndex,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: !isWeb,
      isInteraction: false,
    });
    // Let the browser finish the screen switch before starting the slide clock.
    const frame = isWeb ? requestAnimationFrame(() => slide.start()) : undefined;
    if (!isWeb) slide.start();
    return () => {
      if (frame !== undefined) cancelAnimationFrame(frame);
      slide.stop();
    };
  }, [activeIndex, isPreviewing, position, reducedMotion]);

  const actions = useRef({ move: (_x: number) => {}, end: (_x: number, _y: number) => {} });
  const measure = () => container.current?.measureInWindow((x, y, width, height) => {
    bounds.current = { x, y, width, height };
  });
  const positionAt = (x: number) => Math.max(0, Math.min(tabs.length - 1,
    (x - bounds.current.x - inset) / ((bounds.current.width - inset * 2) / tabs.length) - 0.5));
  actions.current = {
    move: x => {
      if (bounds.current.width <= inset * 2) return;
      const next = positionAt(x);
      const index = Math.round(next);
      position.setValue(reducedMotion ? index : next);
      setPreview(index);
    },
    end: (x, y) => {
      const b = bounds.current;
      dragging.current = false;
      setPreview(null);
      if (b.width > inset * 2 && x >= b.x - 24 && x <= b.x + b.width + 24 && y >= b.y - 36 && y <= b.y + b.height + 36) onSelect(tabs[Math.round(positionAt(x))]!);
    },
  };
  const [pan] = useState(() => PanResponder.create({
    onStartShouldSetPanResponderCapture: () => false,
    onMoveShouldSetPanResponderCapture: (_event, gesture) =>
      Math.abs(gesture.dx) > dragThreshold && Math.abs(gesture.dx) > Math.abs(gesture.dy),
    onPanResponderGrant: event => {
      dragging.current = true;
      suppressPointerClick.current = true;
      actions.current.move(event.nativeEvent.pageX);
    },
    onPanResponderMove: event => actions.current.move(event.nativeEvent.pageX),
    onPanResponderRelease: event => actions.current.end(event.nativeEvent.pageX, event.nativeEvent.pageY),
    onPanResponderTerminate: () => { dragging.current = false; setPreview(null); },
    onPanResponderTerminationRequest: () => true,
  }));
  const nativeGlass = Platform.OS === "ios" && isLiquidGlassAvailable();
  const selectedIndex = preview ?? activeIndex;
  // Ignore the click from a drag without blocking a new press during settling.
  return <View ref={container} {...pan.panHandlers}
    onClickCapture={undefined}
    onPointerDown={isWeb ? () => { suppressPointerClick.current = false; } : undefined}
    onLayout={event => { setWidth(event.nativeEvent.layout.width); measure(); }} onTouchStart={measure}
    style={[s.container, Platform.OS === "web" && ({ touchAction: "pan-y" } as any)]}>
    <GlassView isInteractive={false} glassEffectStyle="regular" colorScheme="dark"
      style={[s.glass, !nativeGlass && s.fallback, Platform.OS === "web" && ({ backdropFilter: "blur(28px) saturate(180%)", WebkitBackdropFilter: "blur(28px) saturate(180%)", userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none" } as any)]}>
      {tabWidth > 0 && <Animated.View testID="glass-selection" pointerEvents="none"
        style={[s.selection, { width: tabWidth, opacity: selectedIndex < 0 ? 0 : 1, transform: [{ translateX }] }]} />}
      {tabs.map((tab, index) => <GlassPressable key={tab} accessibilityRole="tab" accessibilityLabel={tab}
        aria-selected={activeTab === tab} completePressFeedback onPressIn={measure}
        onKeyDownCapture={isWeb ? event => {
          const { key, repeat } = event.nativeEvent;
          if (key !== "Enter" && key !== " ") return;
          event.preventDefault();
          event.stopPropagation();
          if (!repeat) onSelect(tab);
        } : undefined}
        onPointerDown={isWeb ? ({ nativeEvent: event }) => {
          if (event.pointerType === "touch" && event.isPrimary) {
            touchStart.current = { id: event.pointerId, tab, x: event.pageX, y: event.pageY };
          }
        } : undefined}
        onPointerCancel={isWeb ? ({ nativeEvent: event }) => {
          if (touchStart.current?.id === event.pointerId) touchStart.current = null;
        } : undefined}
        onPointerUp={isWeb ? ({ nativeEvent: event }) => {
          const start = touchStart.current;
          if (event.pointerType !== "touch" || start?.id !== event.pointerId) return;
          touchStart.current = null;
          // A browser can omit the compatibility click after a touch swipe.
          // Activate a valid tap on release and ignore any duplicate click.
          suppressPointerClick.current = true;
          if (!dragging.current && start.tab === tab &&
            Math.hypot(event.pageX - start.x, event.pageY - start.y) <= dragThreshold) onSelect(tab);
        } : undefined}
        onPress={event => {
          const pointerClick = isWeb && "detail" in event.nativeEvent && event.nativeEvent.detail !== 0;
          if (!dragging.current && !(pointerClick && suppressPointerClick.current)) onSelect(tab);
        }} style={s.tab}>
        <SchoolIcon name={tab === "Today" ? "home" : tab === "Lesson" ? "lesson" : "profile"} selected={selectedIndex === index}
          selectionProgress={selectedIndex < 0 ? undefined : tabMotion[index]!.tint} size={30} />
        <Animated.Text style={[s.label, selectedIndex >= 0 && { color: tabMotion[index]!.color }]}>{tab}</Animated.Text>
      </GlassPressable>)}
    </GlassView>
  </View>;
}

const s = StyleSheet.create({
  container: { width: "100%", maxWidth: 560 },
  glass: {
    flexDirection: "row",
    borderRadius: 42,
    padding: 6,
    borderWidth: 1,
    borderColor: "#ffffff28",
    overflow: "hidden",
    boxShadow: "0 8px 32px #00000055",
  },
  fallback: { backgroundColor: "rgba(28, 28, 28, 0.92)" },
  selection: {
    position: "absolute",
    top: inset - 1,
    bottom: inset - 1,
    left: inset - 1,
    borderRadius: 34,
    backgroundColor: "#8178ff24",
    borderWidth: 1,
    borderColor: "#ffffff30",
    overflow: "hidden",
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    minHeight: 63,
    borderRadius: 34,
  },
  label: { fontSize: 11, fontWeight: "600", color: labelColor },
});
