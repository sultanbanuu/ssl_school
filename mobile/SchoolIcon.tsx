import React, { memo, useId, useMemo } from "react";
import { Animated, Image, Platform } from "react-native";
import { SvgXml } from "react-native-svg";
import { iconMarkup } from "./assets/icon-markup";
import { useIconPressScale } from "./GlassIcon";

export type SchoolIconName = "home" | "lesson" | "profile" | "profile-gray" | "notification" | "settings" | "achievement" | "speaking" | "vocabulary" | "listening" | "sentence structure";
const selectedIcons = {
  home: "home-purple", lesson: "lesson-purple", profile: "profile-purple",
  "profile-gray": "profile-purple", notification: "notification-purple",
  settings: "settings-purple", achievement: "achivement-purple",
} as const;

// Encode once, not on every gesture frame or parent render.
const sources = Object.fromEntries(Object.entries(iconMarkup).map(([name, xml]) => [name, { uri: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}` }]));

export const SchoolIcon = memo(function SchoolIcon({
  name, selected = false, size = 28, selectionProgress,
}: {
  name: SchoolIconName;
  selected?: boolean;
  size?: number;
  selectionProgress?: Animated.AnimatedInterpolation<number>;
}) {
  const scale = useIconPressScale();
  const active = name in selectedIcons ? selectedIcons[name as keyof typeof selectedIcons] : name;
  const variant = selected ? active : name;
  const instance = useId().replace(/[^a-zA-Z0-9]/g, "");
  const inactiveOpacity = useMemo(() => selectionProgress && Animated.subtract(1, selectionProgress), [selectionProgress]);
  const variants = useMemo(() => [...new Set(selectionProgress ? [name, active] : [variant])].map(key => ({ key,
    // Native SVG definitions share an ID registry; isolate repeated icons.
    xml: Platform.OS === "web" ? "" : iconMarkup[key].replace(/id="([^"]+)"/g, `id="${instance}-${key.replace(/[^a-zA-Z0-9]/g, "")}-$1"`).replace(/url\(#([^)]+)\)/g, `url(#${instance}-${key.replace(/[^a-zA-Z0-9]/g, "")}-$1)`).replace(/href="#([^"]+)"/g, `href="#${instance}-${key.replace(/[^a-zA-Z0-9]/g, "")}-$1"`),
  })), [name, active, variant, selectionProgress, instance]);
  return <Animated.View pointerEvents="none" testID={`school-icon-${variant}`} style={{ width: size, height: size, transform: [{ scale }] }}>
    {variants.map(({key, xml}) => <Animated.View key={key} style={{
      position: "absolute", width: size, height: size,
      opacity: active !== name && selectionProgress
        ? key === active ? selectionProgress : inactiveOpacity
        : key === variant ? 1 : 0,
    }}>
      {Platform.OS === "web"
        ? <Image source={sources[key]} style={{ width: size, height: size }} resizeMode="contain" fadeDuration={0} />
        : <SvgXml xml={xml} width={size} height={size} />}
    </Animated.View>)}
  </Animated.View>;
});
