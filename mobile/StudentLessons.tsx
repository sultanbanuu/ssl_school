import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { schoolRequest, SessionExpiredError } from "./auth-client";

type StudentLesson = {
  id: string; date: string; endDate?: string; startTime: string; endTime: string | null; allDay?: boolean;
  status: string; enrollment: { course: { name: string } };
  teacher: { profile: { firstName: string | null; lastName: string | null } };
};
const dateLabel = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const statusColors: Record<string, { backgroundColor: string; color: string }> = {
  scheduled: { backgroundColor: "#e4eee5", color: "#285c40" },
  completed: { backgroundColor: "#e7edf8", color: "#3c5a91" },
  cancelled: { backgroundColor: "#f9e8e4", color: "#9e4937" },
  rescheduled: { backgroundColor: "#faf0da", color: "#876327" },
};

// Both native and web students read the same scoped records edited by staff.
export function StudentLessons({ onFailure }: { onFailure: (error: unknown) => void }) {
  const [lessons, setLessons] = useState<StudentLesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const onFailureRef = useRef(onFailure);
  onFailureRef.current = onFailure;
  const refresh = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    let disposed = false, pending = false;
    async function load() {
      if (disposed || pending || AppState.currentState === "background" || AppState.currentState === "inactive") return;
      pending = true;
      try {
        const all: StudentLesson[] = [];
        for (let offset = 0; ; offset += 100) {
          const page = await schoolRequest<StudentLesson[]>(`/lessons?limit=100&offset=${offset}`);
          if (disposed) return;
          all.push(...page);
          if (page.length < 100) break;
        }
        setLessons([...new Map(all.map(row => [row.id, row])).values()]); setError("");
      } catch (e) {
        if (!disposed) {
          setError(e instanceof Error ? e.message : "Unable to refresh lessons. Please try again.");
          if (e instanceof SessionExpiredError) onFailureRef.current(e);
        }
      } finally { pending = false; if (!disposed) setLoading(false); }
    }
    refresh.current = load;
    void load();
    const timer = setInterval(() => void load(), 15000);
    const sub = AppState.addEventListener("change", state => { if (state === "active") void load(); });
    const focus = () => { void load(); };
    if (Platform.OS === "web") window.addEventListener("focus", focus);
    return () => { disposed = true; clearInterval(timer); sub.remove(); if (Platform.OS === "web") window.removeEventListener("focus", focus); };
  }, []);
  return <View style={s.container}>
    <Text style={s.eyebrow}>YOUR LEARNING</Text>
    <View style={s.heading}><Text accessibilityRole="header" style={s.title}>Your lessons</Text><Pressable accessibilityRole="button" accessibilityLabel="Refresh lessons" onPress={() => void refresh.current()} style={s.refresh}><Text style={s.link}>Refresh</Text></Pressable></View>
    <Text style={s.subtitle}>Your lesson details, kept up to date by your school. All times in Asia/Baku.</Text>
    {loading && <ActivityIndicator accessibilityLabel="Loading lessons" color="#245d48" />}
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error} Your last loaded lessons are shown below.</Text>}
    {!loading && !error && !lessons.length && <View style={s.card}><Text style={s.course}>No lessons available yet</Text><Text style={s.subtitle}>Scheduled lessons will appear here after an admin approves your payment for the course.</Text></View>}
    {lessons.map(lesson => {
      const teacher = [lesson.teacher.profile.firstName, lesson.teacher.profile.lastName].filter(Boolean).join(" ") || "Teacher to be confirmed";
      const status = statusColors[lesson.status] || statusColors.scheduled;
      return <View key={lesson.id} testID={`student-lesson-${lesson.id}`} style={s.card}>
        <View style={s.heading}><Text style={s.course}>{lesson.enrollment.course.name}</Text><View style={[s.badge, { backgroundColor: status.backgroundColor }]}><Text style={[s.status, { color: status.color }]}>{lesson.status.charAt(0).toUpperCase() + lesson.status.slice(1)}</Text></View></View>
        <Text style={s.teacher}>Teacher: {teacher}</Text>
        <View style={s.details}><Text style={s.label}>DATE</Text><Text style={s.value}>{dateLabel(lesson.date)}{lesson.endDate && lesson.endDate !== lesson.date ? ` – ${dateLabel(lesson.endDate)}` : ""}</Text></View>
        <View style={s.details}><Text style={s.label}>TIME</Text><Text style={s.value}>{lesson.allDay ? "All day" : `${lesson.startTime} – ${lesson.endTime || "End unspecified"}`}</Text></View>
      </View>;
    })}
    <Text style={s.footnote}>Updates automatically every 15 seconds while this screen is active.</Text>
  </View>;
}
const s = StyleSheet.create({
  container: { gap: 14 }, eyebrow: { color: "#748178", fontSize: 10, fontWeight: "700", letterSpacing: 2 },
  heading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 },
  title: { fontSize: 30, fontWeight: "700", color: "#203d33" }, subtitle: { color: "#748077", lineHeight: 21, fontSize: 14 },
  refresh: { padding: 8 }, link: { color: "#245d48", fontWeight: "600" },
  card: { padding: 20, borderRadius: 16, borderWidth: 1, borderColor: "#dfe7de", backgroundColor: "#fff", gap: 12 },
  course: { fontSize: 18, fontWeight: "600", color: "#203d33", flexShrink: 1 }, teacher: { color: "#4c6355", fontSize: 14 },
  badge: { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 }, status: { fontSize: 12, fontWeight: "600" },
  details: { gap: 3 }, label: { color: "#839087", fontSize: 10, letterSpacing: 1, fontWeight: "600" }, value: { color: "#304b3c", fontSize: 14 },
  error: { color: "#a03d2b", padding: 12, backgroundColor: "#fbe9e6", borderRadius: 8 }, footnote: { color: "#839087", fontSize: 11 },
});
