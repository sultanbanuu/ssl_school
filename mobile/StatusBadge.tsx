import React from "react";
import { StyleSheet, Text, View } from "react-native";

// Shared status colors keep lessons and billing visually consistent.
const tones = {
  violet: { backgroundColor: "#8178ff", color: "#18162e", symbol: "◷" },
  mint: { backgroundColor: "#c6d9cf", color: "#203c30", symbol: "↻" },
  green: { backgroundColor: "#2e945b", color: "#ffffff", symbol: "✓" },
  yellow: { backgroundColor: "#f5d36c", color: "#3d3010", symbol: "◷" },
  coral: { backgroundColor: "#fa8276", color: "#401c18", symbol: "×" },
};
export function StatusBadge({ label, tone = "violet" }: { label: string; tone?: keyof typeof tones }) {
  const { backgroundColor, color, symbol } = tones[tone];
  return <View accessibilityLabel={label} style={[styles.pill, { backgroundColor }]}>
    <Text aria-hidden style={[styles.symbol, { color }]}>{symbol}</Text>
    <Text style={[styles.label, { color }]}>{label}</Text>
  </View>;
}
export function LessonBadge({ lesson }: { lesson: { status: string; rescheduledAt?: string | null; rescheduleRequests?: { status: string }[] } }) {
  if (lesson.status === "cancelled") return <StatusBadge label="Cancelled" tone="coral" />;
  if (lesson.status === "completed") return <StatusBadge label="Completed" tone="green" />;
  if (lesson.rescheduleRequests?.[0]?.status === "pending") return <StatusBadge label="Reschedule pending" tone="yellow" />;
  if (lesson.rescheduledAt) return <StatusBadge label="Rescheduled" tone="mint" />;
  return <StatusBadge label="Confirmed" />;
}
const styles = StyleSheet.create({
  pill: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 20, paddingVertical: 6, paddingHorizontal: 11, borderWidth: 1, borderColor: "#ffffff20" },
  label: { fontSize: 11, fontWeight: "700", lineHeight: 16 },
  symbol: { fontSize: 14, fontWeight: "600", lineHeight: 16 },
});
