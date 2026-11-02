import React, { useRef, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { LessonRescheduleControls } from "./LessonRescheduleControls";
import { GlassIcon, GlassPressable as Pressable } from "./GlassIcon";

export type StudentLesson = {
  id: string; date: string; endDate?: string; startTime: string;
  endTime: string | null; allDay?: boolean; status: string; rescheduledAt?: string | null; rescheduleRequests?: { status: string }[];
  enrollment: { course: { name: string } };
  teacher: { profile: { firstName: string | null; lastName: string | null } };
};
const sections = ["Lessons", "Lesson details", "Manage lessons"] as const;
type Section = typeof sections[number];
const teacherName = (lesson: StudentLesson) => [lesson.teacher.profile.firstName, lesson.teacher.profile.lastName].filter(Boolean).join(" ") || "Your teacher";
const civil = (value: string) => new Date(`${value}T12:00:00Z`);
const dateLabel = (lesson: StudentLesson) => civil(lesson.date).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "long", timeZone: "UTC" }) + (lesson.endDate && lesson.endDate !== lesson.date ? ` – ${civil(lesson.endDate).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" })}` : "");
const timeLabel = (lesson: StudentLesson) => lesson.allDay ? "All day" : `${lesson.startTime}–${lesson.endTime || "End unspecified"}`;
function duration(lesson: StudentLesson) {
  if (lesson.allDay) return "All-day lesson";
  if (!lesson.endTime) return "Duration to be confirmed";
  const minutes = (Date.parse(`${lesson.endDate || lesson.date}T${lesson.endTime}:00+04:00`) - Date.parse(`${lesson.date}T${lesson.startTime}:00+04:00`)) / 60000;
  return minutes > 0 ? `${minutes} minutes` : "Duration to be confirmed";
}
function Status({ lesson }: { lesson: StudentLesson }) {
  return <View style={[s.badge, lesson.status === "cancelled" && s.cancelled]}><Text style={[s.badgeText, lesson.status === "cancelled" && { color: "#f2b9b9" }]}>{lesson.status === "scheduled" ? (lesson.rescheduleRequests?.[0]?.status === "pending" ? "Reschedule pending" : lesson.rescheduledAt ? "Rescheduled" : "Confirmed") : lesson.status.charAt(0).toUpperCase() + lesson.status.slice(1)}</Text></View>;
}

export function StudentLessonViews({ lessons, loading, error, refresh }: { lessons: StudentLesson[]; loading: boolean; error: string; refresh: () => void }) {
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const [section, setSection] = useState<Section>("Lessons");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = lessons.find(lesson => lesson.id === selectedId);
  const ordered = [...lessons].sort((a, b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`));
  const upcoming = (lesson: StudentLesson) => lesson.status === "scheduled" && Date.parse(`${lesson.endDate || lesson.date}T${lesson.allDay ? "23:59" : lesson.endTime || lesson.startTime}:00+04:00`) >= Date.now();
  const next = ordered.filter(upcoming);
  const previous = ordered.filter(lesson => !upcoming(lesson)).reverse();
  const changeSection = (nextSection: Section) => { setSection(nextSection); scroll.current?.scrollTo({ y: 0, animated: false }); };
  function cards(rows: StudentLesson[]) {
    return rows.map((lesson, index) => {
      const month = civil(lesson.date).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
      const showMonth = index === 0 || lesson.date.slice(0, 7) !== rows[index - 1]!.date.slice(0, 7);
      return <View key={lesson.id} style={s.cardGroup}>
        {showMonth && <Text style={s.month}>{month.toUpperCase()}</Text>}
        <Pressable accessibilityRole="button" accessibilityLabel={`View lesson: ${lesson.enrollment.course.name}, ${dateLabel(lesson)}, ${timeLabel(lesson)}`} testID={`student-lesson-${lesson.id}`} onPress={() => { setSelectedId(lesson.id); changeSection("Lesson details"); }} style={[s.card, lesson.id === next[0]?.id && s.nextCard]}>
          <View style={s.row}><Text style={s.muted}>{dateLabel(lesson)}</Text><Status lesson={lesson} /></View>
          <Text style={s.time}>{timeLabel(lesson)}</Text>
          <Text style={s.course}>{lesson.enrollment.course.name}</Text>
          <Text style={s.muted}>{duration(lesson)} · Baku time</Text>
          <View style={s.teacherRow}><View style={s.initial}><Text style={s.accent}>{teacherName(lesson).charAt(0)}</Text></View><Text style={[s.muted, { flex: 1 }]}>Teacher: {teacherName(lesson)}</Text><GlassIcon name="chevron-forward" size={18} color="#d7b6f6" /></View>
        </Pressable>
      </View>;
    });
  }
  return <ScrollView ref={scroll} contentContainerStyle={s.container}>
    <View style={s.sections}>{sections.map(item => <Pressable key={item} accessibilityRole="tab" accessibilityState={{ selected: section === item, disabled: item !== "Lessons" && !selected }} disabled={item !== "Lessons" && !selected} onPress={() => changeSection(item)} style={[s.section, section === item && s.activeSection, item !== "Lessons" && !selected && { opacity: 0.45 }]}><Text style={[s.sectionText, section === item && s.activeText]}>{item}</Text></Pressable>)}</View>
    {loading && <ActivityIndicator accessibilityLabel="Loading lessons" color="#d8b6ff" />}
    {!!error && <Pressable accessibilityRole="button" onPress={refresh}><Text accessibilityRole="alert" style={s.error}>{error} Tap to retry.</Text></Pressable>}
    {section === "Lessons" ? <>
      <View style={s.titleRow}><View style={{ flex: 1 }}><Text style={s.eyebrow}>YOUR LEARNING</Text><Text accessibilityRole="header" style={s.title}>Your lessons</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Refresh lessons" onPress={refresh} style={s.refresh}><GlassIcon name="refresh-outline" size={20} color="#cdb0ef" /></Pressable></View>
      <Text style={s.subtitle}>A little practice. Real progress.</Text>
      {!loading && !error && !lessons.length && <View style={s.card}><Text style={s.course}>No lessons available yet</Text><Text style={s.muted}>Your scheduled lessons will appear here once your school confirms them.</Text></View>}
      {next.length > 0 && <Text style={s.subheading}>Your next {next.length === 1 ? "lesson" : "lessons"}</Text>}
      {cards(next)}
      {previous.length > 0 && <Text style={s.subheading}>Lesson history</Text>}{cards(previous)}
    </> : !selected ? <View style={s.card}><Text style={s.course}>This lesson is no longer available</Text><Pressable onPress={() => changeSection("Lessons")}><Text style={s.link}>Back to lessons</Text></Pressable></View> : section === "Lesson details" ? <>
      <Text style={s.eyebrow}>LESSON DETAILS</Text><Text accessibilityRole="header" style={s.title}>{selected.enrollment.course.name}</Text><Text style={s.subtitle}>{duration(selected)} · With {teacherName(selected)}</Text>
      <View style={s.detailCard}>
        <View style={s.detailRow}><Text style={s.muted}>Date</Text><Text style={s.value}>{dateLabel(selected)}</Text></View>
        <View style={s.detailRow}><Text style={s.muted}>Time</Text><Text style={s.value}>{timeLabel(selected)}</Text></View>
        <View style={s.detailRow}><Text style={s.muted}>Timezone</Text><Text style={s.value}>Baku · UTC+4</Text></View>
        <View style={[s.detailRow, { borderBottomWidth: 0 }]}><Text style={s.muted}>Status</Text><Status lesson={selected} /></View>
      </View>
      <Text style={s.subheading}>Before your lesson</Text><Text style={s.muted}>Have your notes ready and bring one topic you’d like to practise.</Text>
      <View style={s.notice}><GlassIcon name="information-circle-outline" size={21} color="#cdb0ef" /><Text style={[s.muted, { flex: 1 }]}>Your teacher will share any classroom or joining details with you.</Text></View>
      <Pressable accessibilityRole="button" accessibilityLabel="Manage lesson" onPress={() => changeSection("Manage lessons")} style={s.primary}><Text style={s.primaryText}>Manage lesson</Text><GlassIcon name="arrow-forward" size={20} color="#281e35" /></Pressable>
      <Pressable accessibilityRole="button" onPress={() => changeSection("Lessons")} style={s.back}><Text style={s.link}>Back to lessons</Text></Pressable>
    </> : <>
      <Text style={s.eyebrow}>YOUR BOOKING</Text><Text accessibilityRole="header" style={s.title}>Manage lesson</Text><Text style={s.subtitle}>{selected.enrollment.course.name}{"\n"}{dateLabel(selected)} · {timeLabel(selected)}{"\n"}With {teacherName(selected)}</Text>
      {upcoming(selected) ? <LessonRescheduleControls key={`${selected.id}:${selected.rescheduledAt || ""}:${selected.rescheduleRequests?.[0]?.status || ""}`} lessonId={selected.id} onChanged={refresh} /> : <Text style={s.muted}>This lesson is {selected.status}. Contact your school if a cancellation was made by mistake.</Text>}
      <Pressable accessibilityRole="button" onPress={() => changeSection("Lesson details")} style={s.back}><Text style={s.link}>Back to lesson</Text></Pressable>
    </>}
  </ScrollView>;
}
const s = StyleSheet.create({
  container: { width: "100%", maxWidth: 700, alignSelf: "center", padding: 22, gap: 16 },
  sections: { flexDirection: "row", gap: 6, marginBottom: 14 }, section: { flex: 1, minHeight: 44, borderRadius: 22, backgroundColor: "#22232e", borderWidth: 1, borderColor: "#363340", alignItems: "center", justifyContent: "center", paddingHorizontal: 5 }, activeSection: { backgroundColor: "#d8b6ff", borderColor: "#d8b6ff" }, sectionText: { color: "#c8bad9", fontSize: 11, fontWeight: "600", textAlign: "center" }, activeText: { color: "#281e35" },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 12 }, title: { color: "#f7f4fc", fontSize: 28, fontWeight: "700", letterSpacing: -0.8 }, eyebrow: { color: "#aaa2ba", fontSize: 10, letterSpacing: 1.8, fontWeight: "700", marginBottom: 7 }, subtitle: { color: "#aaa6b6", fontSize: 14, lineHeight: 23 }, muted: { color: "#b3adbf", fontSize: 13, lineHeight: 21, flexShrink: 1 }, refresh: { padding: 9 },
  subheading: { color: "#f2edf8", fontSize: 19, fontWeight: "600", marginTop: 8 }, month: { color: "#b9a2d0", fontSize: 11, letterSpacing: 1.5, marginTop: 8, marginBottom: 14 }, cardGroup: { gap: 0 }, card: { padding: 20, backgroundColor: "#1b1d26", borderRadius: 23, borderWidth: 1, borderColor: "#33313f", gap: 13 }, nextCard: { borderLeftColor: "#cfadf0", borderLeftWidth: 3 }, row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }, time: { fontSize: 26, color: "#f3eff9", fontWeight: "600", marginTop: 4 }, course: { fontSize: 17, color: "#eee8f5", fontWeight: "600", lineHeight: 24 }, teacherRow: { flexDirection: "row", alignItems: "center", gap: 10, borderTopWidth: 1, borderColor: "#35313f", paddingTop: 16, marginTop: 7 }, initial: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#2d263b", alignItems: "center", justifyContent: "center" }, accent: { color: "#d7b6f6", fontWeight: "600" }, badge: { borderRadius: 18, paddingVertical: 8, paddingHorizontal: 11, backgroundColor: "#30273f" }, badgeText: { color: "#d9bdf5", fontSize: 11, fontWeight: "600" }, cancelled: { backgroundColor: "#3b2731" },
  detailCard: { paddingHorizontal: 18, borderRadius: 22, backgroundColor: "#1b1d26", borderWidth: 1, borderColor: "#302d3a" }, detailRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 20, paddingVertical: 19, borderBottomWidth: 1, borderColor: "#35313f" }, value: { color: "#f2edf8", fontSize: 13, lineHeight: 21, textAlign: "right", flexShrink: 1 }, notice: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 17, backgroundColor: "#252230", borderRadius: 18 }, primary: { backgroundColor: "#d8b6ff", borderRadius: 20, padding: 17, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12, marginTop: 12 }, primaryText: { color: "#281e35", fontWeight: "700", fontSize: 15 }, back: { alignItems: "center", padding: 15 }, link: { color: "#cfb1ee", fontSize: 14, fontWeight: "600" }, action: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 22, borderBottomWidth: 1, borderColor: "#35313f" }, error: { color: "#f4b3b3", lineHeight: 22 },
});




