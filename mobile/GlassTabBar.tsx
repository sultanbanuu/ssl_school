import React, { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, PanResponder, Platform, StyleSheet, Text, View } from "react-native";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { GlassIcon as Ionicons, GlassPressable as Pressable } from "./GlassIcon";

const tabs = ["Today", "Lesson", "Profile"] as const;
type Tab = typeof tabs[number];
const icons = { Today: "home-outline", Lesson: "play-circle-outline", Practice: "game-controller-outline", Profile: "person-outline" } as const;
const nativeDriver = Platform.OS !== "web";

export function GlassTabBar({ activeTab, onSelect }: { activeTab: string | null; onSelect: (tab: Tab) => void }) {
  const [width, setWidth] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(true);
  const position = useRef(new Animated.Value(0)).current;
  const stretch = useRef(new Animated.Value(1)).current;
  const press = useRef(new Animated.Value(0)).current;
  const previousWidth = useRef(0);
  const container = useRef<React.ComponentRef<typeof View>>(null);
  const bounds = useRef({ x: 0, y: 0, height: 77 });
  const dragging = useRef(false);
  const hovered = useRef(-1);
  const [preview, setPreview] = useState<number | null>(null);
  const index = tabs.findIndex(tab => tab === activeTab);
  const tabWidth = Math.max(0, (width - 14) / tabs.length);
  const nativeGlass = Platform.OS === "ios" && isLiquidGlassAvailable();
  const visibleIndex = preview ?? index;
  const touch = useRef({ x: 0, y: 0 });

  function track(x: number) {
    if (!tabWidth) return;
    const local = Math.max(0, Math.min(tabWidth * tabs.length - 1, x - bounds.current.x - 7));
    hovered.current = Math.floor(local / tabWidth);
    setPreview(hovered.current);
    position.stopAnimation();
    position.setValue(reduceMotion ? hovered.current * tabWidth : Math.max(0, Math.min((tabs.length - 1) * tabWidth, local - tabWidth / 2)));
    stretch.stopAnimation();
    stretch.setValue(reduceMotion ? 1 : 1.1);
  }
  function finish(commit: boolean) {
    dragging.current = false;
    const target = commit && hovered.current >= 0 ? hovered.current : index;
    setPreview(null);
    respondToPress(false);
    if (target >= 0) {
      if (reduceMotion) { position.setValue(target * tabWidth); stretch.setValue(1); }
      else Animated.parallel([
        Animated.spring(position, { toValue: target * tabWidth, damping: 19, stiffness: 210, useNativeDriver: nativeDriver }),
        Animated.spring(stretch, { toValue: 1, damping: 13, stiffness: 240, useNativeDriver: nativeDriver }),
      ]).start();
      if (commit) onSelect(tabs[target]!);
    }
  }
  // Keep the responder alive across preview renders. Recreating it resets the
  // gesture's touch history while the finger is still down.
  const gestureActions = useRef({
    start: (_x: number, _y: number) => {},
    move: (_x: number, _y: number) => {},
    end: (_x: number, _y: number) => {},
    cancel: () => {},
  });
  gestureActions.current = {
    start: (x, y) => {
      dragging.current = true;
      touch.current = { x, y };
      respondToPress(true);
      container.current?.measureInWindow((left, top, _width, height) => {
        bounds.current = { x: left, y: top, height };
        if (dragging.current) track(touch.current.x);
      });
    },
    move: (x, y) => { touch.current = { x, y }; track(x); },
    end: (x, y) => {
      track(x);
      finish(y >= bounds.current.y - 36 && y <= bounds.current.y + bounds.current.height + 36 && x >= bounds.current.x - 24 && x <= bounds.current.x + width + 24);
    },
    cancel: () => finish(false),
  };
  const pan = useRef(PanResponder.create({
    // Own the touch from the start, before child Pressables/native glass can
    // claim a long press. Keyboard and screen-reader activation still use onPress.
    onStartShouldSetPanResponderCapture: () => true,
    onMoveShouldSetPanResponderCapture: () => true,
    onPanResponderGrant: event => gestureActions.current.start(event.nativeEvent.pageX, event.nativeEvent.pageY),
    onPanResponderMove: event => gestureActions.current.move(event.nativeEvent.pageX, event.nativeEvent.pageY),
    onPanResponderRelease: event => gestureActions.current.end(event.nativeEvent.pageX, event.nativeEvent.pageY),
    onPanResponderTerminate: () => gestureActions.current.cancel(),
    onPanResponderTerminationRequest: () => false,
  })).current;

  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (alive) setReduceMotion(value); });
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => { alive = false; subscription.remove(); };
  }, []);

  useEffect(() => {
    position.stopAnimation();
    stretch.stopAnimation();
    if (index < 0 || !width) return;
    const destination = index * tabWidth;
    // Snap initial layout / rotation; spring only between user selections.
    if (reduceMotion || previousWidth.current !== width) {
      position.setValue(destination);
      stretch.setValue(1);
    } else {
      Animated.parallel([
        Animated.spring(position, { toValue: destination, damping: 19, stiffness: 210, mass: 0.85, useNativeDriver: nativeDriver }),
        Animated.sequence([
          Animated.timing(stretch, { toValue: 1.12, duration: 110, useNativeDriver: nativeDriver }),
          Animated.spring(stretch, { toValue: 1, damping: 13, stiffness: 240, useNativeDriver: nativeDriver }),
        ]),
      ]).start();
    }
    previousWidth.current = width;
    return () => { position.stopAnimation(); stretch.stopAnimation(); };
  }, [index, width, tabWidth, reduceMotion, position, stretch]);

  useEffect(() => {
    if (reduceMotion) { press.stopAnimation(); press.setValue(0); }
    return () => press.stopAnimation();
  }, [reduceMotion, press]);

  function respondToPress(down: boolean) {
    if (reduceMotion) return;
    Animated.spring(press, { toValue: down ? 1 : 0, damping: 15, stiffness: 280, useNativeDriver: nativeDriver }).start();
  }

  return <Animated.View ref={container} {...pan.panHandlers} onTouchStart={() => container.current?.measureInWindow((x, y, _width, height) => { bounds.current = { x, y, height }; })} style={[s.container, Platform.OS === "web" && ({ touchAction: "none" } as any), { transform: [{ scale: press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.985] }) }] }]}>
    <GlassView isInteractive={false} glassEffectStyle="regular" colorScheme="dark" onLayout={event => setWidth(event.nativeEvent.layout.width)} style={[s.glass, !nativeGlass && s.fallback, Platform.OS === "web" && ({ backdropFilter: "blur(28px) saturate(180%)", WebkitBackdropFilter: "blur(28px) saturate(180%)", userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none" } as any)]}>
      {width > 0 && visibleIndex >= 0 && <Animated.View testID="glass-selection" pointerEvents="none" style={[s.selection, { width: tabWidth, transform: [{ translateX: position }, { scaleX: stretch }, { scaleY: press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.94] }) }] }]}>
      </Animated.View>}
      {tabs.map((tab, tabIndex) => <Pressable key={tab} accessibilityRole="tab" accessibilityLabel={tab} accessibilityState={{ selected: activeTab === tab }} onPress={() => { if (dragging.current) finish(true); else onSelect(tab); }} onPressIn={() => { container.current?.measureInWindow((x, y, _width, height) => { bounds.current = { x, y, height }; }); respondToPress(true); }} onPressOut={() => { if (!dragging.current) respondToPress(false); }} style={s.tab}>
        <Ionicons name={visibleIndex === tabIndex && tab === "Today" ? "home" : icons[tab]} size={25} color={visibleIndex === tabIndex ? "#b5afff" : "#eeeef5"} />
        <Text style={[s.label, visibleIndex === tabIndex && s.selectedLabel]}>{tab}</Text>
      </Pressable>)}
    </GlassView>
  </Animated.View>;
}

const s = StyleSheet.create({
  container: { width: "100%", maxWidth: 560 },
  glass: { flexDirection: "row", borderRadius: 42, padding: 6, borderWidth: 1, borderColor: "#ffffff28", overflow: "hidden", boxShadow: "0 8px 32px #00000055" },
  fallback: { backgroundColor: "rgba(28, 28, 28, 0.92)" },
  selection: { position: "absolute", top: 6, bottom: 6, left: 6, borderRadius: 34, backgroundColor: "#8178ff24", borderWidth: 1, borderColor: "#ffffff30", overflow: "hidden" },
  tab: { flex: 1, alignItems: "center", justifyContent: "center", gap: 4, minHeight: 63, borderRadius: 34 },
  label: { fontSize: 11, fontWeight: "600", color: "#eeeef5" },
  selectedLabel: { color: "#b5afff" },
});

