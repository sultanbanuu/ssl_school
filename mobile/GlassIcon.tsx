import { BackIcon } from "./CourseIcon";
import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Platform, Pressable, View } from "react-native";
import { Ionicons } from "./Ionicons";

const PressScaleContext = createContext<Animated.Value | null>(null);

export function useIconPressScale() {
  return useContext(PressScaleContext) ?? 1;
}
export function useReducedMotion() {
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (mounted) setReduced(value); });
    const listener = AccessibilityInfo.addEventListener("reduceMotionChanged", value => setReduced(value));
    return () => { mounted = false; listener.remove(); };
  }, []);
  return reduced;
}

// Share the enclosing button's press with its icons; no nested touch targets.
export function GlassPressable({
  children, onPressIn, onPressOut, completePressFeedback = false, ...props
}: React.ComponentProps<typeof Pressable> & { completePressFeedback?: boolean }) {
  const [scale] = useState(() => new Animated.Value(1));
  const reduced = useReducedMotion();
  const pressingIn = useRef(false);
  const released = useRef(false);
  const animate = (pressed: boolean) =>
    Animated.timing(scale, {
      toValue: pressed ? 0.9 : 1,
      duration: pressed ? 85 : 150,
      easing: Easing.out(Easing.quad),
      useNativeDriver: Platform.OS !== "web",
      isInteraction: false,
    });
  useEffect(() => {
    if (reduced) scale.setValue(1);
    return () => { pressingIn.current = false; scale.stopAnimation(); };
  }, [reduced, scale]);
  return <PressScaleContext.Provider value={scale}>
    <Pressable {...props} onPressIn={event => {
      if (!reduced) {
        released.current = false;
        pressingIn.current = true;
        animate(true).start(({ finished }) => {
          if (!finished) return;
          pressingIn.current = false;
          if (released.current) animate(false).start();
        });
      }
      onPressIn?.(event);
    }} onPressOut={event => {
      // Keep feedback visible on a quick click without holding up navigation.
      released.current = true;
      if (!reduced && (!completePressFeedback || !pressingIn.current)) animate(false).start();
      onPressOut?.(event);
    }}>{children}</Pressable>
  </PressScaleContext.Provider>;
}

export function GlassIcon({ size = 24, ...props }: React.ComponentProps<typeof Ionicons>) {
  const scale = useIconPressScale();
  return <Animated.View pointerEvents="none" style={{ transform: [{ scale }] }}>
    <View style={{ width: size + 10, height: size + 10, alignItems: "center", justifyContent: "center" }}>
      {props.name === "chevron-back" || props.name === "arrow-back" || props.name === "arrow-back-outline" ? <BackIcon size={size + 4} /> : <Ionicons {...props} size={size} />}
    </View>
  </Animated.View>;
}
