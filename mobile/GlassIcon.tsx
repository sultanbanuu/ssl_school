import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Platform, Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

const PressContext = createContext<Animated.Value | null>(null);
export function useReducedMotion() {
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (mounted) setReduced(value); });
    const listener = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    return () => { mounted = false; listener.remove(); };
  }, []);
  return reduced;
}

// Share the enclosing button's press with its icons; no nested touch targets.
export function GlassPressable({ children, onPressIn, onPressOut, ...props }: React.ComponentProps<typeof Pressable>) {
  const progress = useRef(new Animated.Value(0)).current;
  const reduced = useReducedMotion();
  const animate = (toValue: number) => {
    progress.stopAnimation();
    if (reduced) progress.setValue(0);
    else Animated.spring(progress, { toValue, stiffness: 300, damping: 16, useNativeDriver: Platform.OS !== "web" }).start();
  };
  useEffect(() => { if (reduced) { progress.stopAnimation(); progress.setValue(0); } return () => progress.stopAnimation(); }, [reduced, progress]);
  return <PressContext.Provider value={progress}><Pressable {...props} onPressIn={event => { animate(1); onPressIn?.(event); }} onPressOut={event => { animate(0); onPressOut?.(event); }}>{children}</Pressable></PressContext.Provider>;
}

export function GlassIcon({ size = 24, ...props }: React.ComponentProps<typeof Ionicons>) {
  const inherited = useContext(PressContext);
  const idle = useRef(new Animated.Value(0)).current;
  const entrance = useRef(new Animated.Value(1)).current;
  const reduced = useReducedMotion();
  useEffect(() => {
    entrance.stopAnimation();
    if (reduced) entrance.setValue(1);
    else {
      entrance.setValue(0.9);
      Animated.spring(entrance, { toValue: 1, damping: 14, stiffness: 180, useNativeDriver: Platform.OS !== "web" }).start();
    }
    return () => entrance.stopAnimation();
  }, [reduced, entrance]);
  const progress = reduced ? idle : inherited ?? idle;
  return <Animated.View pointerEvents="none" style={{ transform: [{ scale: Animated.multiply(entrance, progress.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] })) }, { rotate: progress.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "-5deg"] }) }] }}>
    <View style={{ width: size + 10, height: size + 10, alignItems: "center", justifyContent: "center" }}>
      <Ionicons {...props} size={size} />
    </View>
  </Animated.View>;
}
