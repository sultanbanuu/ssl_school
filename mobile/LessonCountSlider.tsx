import React, { useState } from "react";
import { View } from "react-native";

type Props = { label: string; value: number; max: number; onChange: (value: number) => void };

export function LessonCountSlider({ label, value, max, onChange }: Props) {
  const [width, setWidth] = useState(0);
  const progress = (value - 1) / (max - 1);
  const update = (next: number) => onChange(Math.max(1, Math.min(max, next)));
  const slide = (x: number) => {
    if (width > 0) update(1 + Math.round((x / width) * (max - 1)));
  };

  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ min: 1, max, now: value }}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={({ nativeEvent }) =>
        update(value + (nativeEvent.actionName === "increment" ? 1 : -1))
      }
      onLayout={({ nativeEvent }) => setWidth(nativeEvent.layout.width)}
      onStartShouldSetResponder={() => true}
      onResponderGrant={({ nativeEvent }) => slide(nativeEvent.locationX)}
      onResponderMove={({ nativeEvent }) => slide(nativeEvent.locationX)}
      style={{ height: 44, marginHorizontal: 12, justifyContent: "center" }}
    >
      <View pointerEvents="none" style={{ height: 6, borderRadius: 3, backgroundColor: "#4b544e" }}>
        <View style={{ width: width * progress, height: 6, borderRadius: 3, backgroundColor: "#bce6d1" }} />
        <View style={{ position: "absolute", left: width * progress - 11, top: -8, height: 22, width: 22, borderRadius: 11, backgroundColor: "#bce6d1" }} />
      </View>
    </View>
  );
}
