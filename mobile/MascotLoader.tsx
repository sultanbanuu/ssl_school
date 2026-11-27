import React, { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Platform, StyleSheet, Text, View } from "react-native";

const mascot = require("./assets/brand/mascot.png");
const native = Platform.OS !== "web";
const HOP_MS = 1500;
const DOT_MS = 420;

const SEEN_KEY = "ssl-loader-seen";

type Props = {
  /** Word shown under the mascot. Dots are animated after it. */
  label?: string;
  /** "large" is the full-screen entry loader. "small" marks in-page loading, which shows nothing. */
  size?: "large" | "small";
  accessibilityLabel?: string;
};

let seenThisLaunch = false;
/** True only for the first visit in this browser tab (web) or app launch (native). Marks it seen. */
export function isFirstEntry() {
  if (seenThisLaunch) return false;
  seenThisLaunch = true;
  if (Platform.OS !== "web") return true;
  try {
    if (globalThis.sessionStorage?.getItem(SEEN_KEY)) return false;
    globalThis.sessionStorage?.setItem(SEEN_KEY, "1");
  } catch {}
  return true;
}

/** Fades and slides its content in when it mounts. Give it a `key` per screen to animate screen changes. */
export function ScreenFade({ children, style, duration = 280 }: { children: React.ReactNode; style?: React.ComponentProps<typeof View>["style"]; duration?: number }) {
  const reduce = useReduceMotion();
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduce) { progress.setValue(1); return; }
    const anim = Animated.timing(progress, { toValue: 1, duration, easing: Easing.out(Easing.cubic), useNativeDriver: native });
    anim.start();
    return () => anim.stop();
  }, [reduce, progress, duration]);
  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [8, 0] });
  return <Animated.View style={[{ opacity: progress, transform: [{ translateY }] }, style]}>{children}</Animated.View>;
}

function useReduceMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled?.().then(v => alive && setReduce(v)).catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.("reduceMotionChanged", setReduce);
    return () => { alive = false; sub?.remove?.(); };
  }, []);
  return reduce;
}

/**
 * The mascot is only for entering the site (size "large"). In-page loading between screens shows
 * nothing; the content fades in with ScreenFade once it arrives.
 */
export default function MascotLoader(props: Props) {
  if (props.size !== "large") return null;
  return <LoaderBody {...props} />;
}

function LoaderBody({ label = "Loading", size = "small", accessibilityLabel }: Props) {
  const reduce = useReduceMotion();
  const hop = useRef(new Animated.Value(0)).current;
  const dots = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;

  useEffect(() => {
    if (reduce) { hop.setValue(0); dots.forEach(d => d.setValue(0)); return; }
    const hopLoop = Animated.loop(
      Animated.timing(hop, { toValue: 1, duration: HOP_MS, easing: Easing.linear, useNativeDriver: native }),
    );
    const dotLoop = Animated.loop(
      Animated.stagger(DOT_MS / 3, dots.map(d =>
        Animated.sequence([
          Animated.timing(d, { toValue: 1, duration: DOT_MS / 2, easing: Easing.out(Easing.quad), useNativeDriver: native }),
          Animated.timing(d, { toValue: 0, duration: DOT_MS / 2, easing: Easing.in(Easing.quad), useNativeDriver: native }),
        ]),
      ).concat(Animated.delay(DOT_MS))),
    );
    hopLoop.start();
    dotLoop.start();
    return () => { hopLoop.stop(); dotLoop.stop(); };
  }, [reduce, hop, dots]);

  const big = size === "large";
  const h = big ? 132 : 72;
  const w = h * (362 / 500);
  const lift = big ? 14 : 8;

  // Gentle float: eases off the ground, hangs at the top, eases back down onto a tiny cushion.
  const soft = Easing.inOut(Easing.sin);
  const translateY = hop.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -lift, 0], easing: soft });
  const scaleY = hop.interpolate({ inputRange: [0, 0.12, 0.5, 0.88, 1], outputRange: [0.98, 1.01, 1, 1.01, 0.98], easing: soft });
  const scaleX = hop.interpolate({ inputRange: [0, 0.12, 0.5, 0.88, 1], outputRange: [1.02, 0.995, 1, 0.995, 1.02], easing: soft });
  const rotate = hop.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: ["0deg", "-2deg", "0deg", "2deg", "0deg"], easing: soft });
  const shadowScale = hop.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0.8, 1], easing: soft });
  const shadowOpacity = hop.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.4, 0.24, 0.4], easing: soft });

  return (
    <View
      style={[s.wrap, big && s.wrapLarge]}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ busy: true }}
    >
      <View style={{ height: h + lift, width: w * 1.6, alignItems: "center", justifyContent: "flex-end" }}>
        <Animated.View
          style={[s.shadow, { width: w * 0.9, height: big ? 12 : 7, opacity: shadowOpacity, transform: [{ scaleX: shadowScale }] }]}
        />
        <Animated.Image
          source={mascot}
          resizeMode="contain"
          style={{ width: w, height: h, marginBottom: big ? 4 : 2, transform: [{ translateY }, { rotate }, { scaleX }, { scaleY }] }}
        />
      </View>
      <View style={s.labelRow} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <Text style={[s.label, big && s.labelLarge]}>{label}</Text>
        {dots.map((d, i) => (
          <Animated.View
            key={i}
            style={[
              s.dot,
              big && s.dotLarge,
              { backgroundColor: DOT_COLORS[i], transform: [{ translateY: d.interpolate({ inputRange: [0, 1], outputRange: [0, big ? -7 : -5] }) }] },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const DOT_COLORS = ["#a49dff", "#f39a7b", "#f5c84c"];

const s = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 12 },
  wrapLarge: { gap: 18 },
  shadow: { position: "absolute", bottom: 0, borderRadius: 999, backgroundColor: "#000" },
  labelRow: { flexDirection: "row", alignItems: "flex-end", gap: 4 },
  label: { color: "#f5f5f3", fontSize: 14, fontWeight: "700", letterSpacing: 0.4, marginRight: 2 },
  labelLarge: { fontSize: 18, letterSpacing: 0.6 },
  dot: { width: 5, height: 5, borderRadius: 3, marginBottom: 4 },
  dotLarge: { width: 7, height: 7, borderRadius: 4, marginBottom: 5 },
});
