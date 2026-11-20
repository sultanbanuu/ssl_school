import { CourseIcon } from "./CourseIcon";
import React, { useState } from "react";
import { Linking, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { GlassIcon, GlassPressable } from "./GlassIcon";
import { LessonCountSlider } from "./LessonCountSlider";
import { courseDetails } from "./course-details";
import { baseURL, money } from "./src/api";

export type Course = { id: string; name: string; price: string; description?: string | null };

const maxLessons = 30;
const lessonPrice = 13;

export function StudentCourse({ course, onTrial, enrolled, count, onCountChange }: {
  course: Course;
  onTrial: () => void;
  enrolled: boolean;
  count: number;
  onCountChange: (count: number) => void;
}) {
  const details = courseDetails(course.name);
  const accent = details?.accent ?? "#bdb7ff";
  const wide = useWindowDimensions().width >= 760;
  const [syllabusError, setSyllabusError] = useState("");

  async function openSyllabus(file: string) {
    setSyllabusError("");
    try {
      await Linking.openURL(`${baseURL}/api/courses/syllabi/${file}`);
    } catch {
      setSyllabusError("Couldn’t open the syllabus. Please try again.");
    }
  }

  return (
    <ScrollView contentContainerStyle={s.page}>
      <View style={[s.hero, { backgroundColor: accent }]}>
        <View pointerEvents="none" style={s.orbit} />
        <View style={s.heroIcon}>
          <GlassIcon name={details?.icon ?? "book-outline"} size={30} color="#25212d" />
        </View>
        <Text accessibilityRole="header" style={s.title}>{course.name}</Text>
        {details?.subtitle && <Text style={s.subtitle}>{details.subtitle}</Text>}
        {details?.intro || course.description ? (
          <Text style={s.intro}>{details?.intro ?? course.description}</Text>
        ) : null}
      </View>

      {!details?.custom && (
        <View style={s.facts}>
          {(details?.facts ?? [{ label: "Price", value: `${money(course.price)} / month` }]).map(({ label, value }) => (
            <View key={label} style={s.fact}>
              <Text style={s.label}>{label}</Text>
              <Text style={s.factValue}>{value}</Text>
            </View>
          ))}
        </View>
      )}

      {!!details?.sections.length && (
        <View style={[s.sections, wide && s.grid]}>
          {details.sections.map(({ icon, title, body }) => (
            <View key={title} style={[s.section, wide && s.gridItem]}>
              <View style={s.sectionIcon}><CourseIcon name={icon} size={32} /></View>
              <View style={s.sectionText}>
                <Text accessibilityRole="header" style={s.heading}>{title}</Text>
                <Text style={s.body}>{body}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {enrolled
        ? <Text style={s.body}>You’re enrolled. Open Lesson to see your schedule.</Text>
        : <Text style={s.body}>Contact your school to enroll in this course.</Text>}

      {details?.custom && (
        <View style={s.calculator}>
          <Text accessibilityRole="header" style={s.heading}>Dərs paketini hesabla</Text>
          <View style={s.readout}>
            <Text style={s.label}>Dərs sayı</Text>
            <Text style={s.factValue}>{count}</Text>
          </View>
          <LessonCountSlider label="Dərs sayı" value={count} max={maxLessons} onChange={onCountChange} />
          <View style={s.readout}>
            <Text style={s.label}>1</Text>
            <Text style={s.label}>{maxLessons}</Text>
          </View>
          <View style={[s.readout, s.total]}>
            <Text style={s.heading}>Ümumi məbləğ</Text>
            <Text accessibilityLiveRegion="polite" style={[s.totalValue, { color: accent }]}>{count * lessonPrice} ₼</Text>
          </View>
        </View>
      )}

      {(details?.syllabi || details?.syllabusNote) && (
        <View style={s.sections}>
          <Text accessibilityRole="header" style={s.heading}>Syllabus</Text>
          {details.syllabi?.map(({ file, label }) => (
            <GlassPressable
              key={file}
              accessibilityRole="button"
              accessibilityLabel={`${label} (PDF)`}
              onPress={() => void openSyllabus(file)}
              style={s.action}
            >
              <GlassIcon name="book-outline" size={20} color={accent} />
              <View style={s.sectionText}><Text style={s.heading}>{label}</Text></View>
              <Text style={s.body}>PDF</Text>
            </GlassPressable>
          ))}
          {details.syllabusNote && <Text style={s.body}>{details.syllabusNote}</Text>}
          {!!syllabusError && <Text accessibilityRole="alert" style={s.body}>{syllabusError}</Text>}
        </View>
      )}

      <GlassPressable accessibilityRole="button" onPress={onTrial} style={[s.action, { borderColor: accent }]}>
        <GlassIcon name="calendar-outline" size={23} color={accent} />
        <View style={s.sectionText}>
          <Text style={s.heading}>Book a free trial with Sayad</Text>
          <Text style={s.body}>Choose an available 15-minute slot</Text>
        </View>
        <GlassIcon name="arrow-forward" size={20} color={accent} />
      </GlassPressable>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { width: "100%", maxWidth: 1000, alignSelf: "center", padding: 20, paddingBottom: 32, gap: 16 },
  hero: { borderRadius: 28, overflow: "hidden", padding: 24, gap: 14 },
  orbit: { position: "absolute", right: -55, top: -35, width: 290, height: 170, borderRadius: 110, transform: [{ rotate: "-28deg" }], borderColor: "#ffffff88", borderWidth: 2, backgroundColor: "#ffffff23" },
  heroIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: "#ffffff63", alignItems: "center", justifyContent: "center" },
  title: { color: "#25212d", fontSize: 34, lineHeight: 39, fontWeight: "800", letterSpacing: -1.1 },
  subtitle: { color: "#34303b", fontSize: 16, fontWeight: "700" },
  intro: { color: "#34303b", fontSize: 16, lineHeight: 24, maxWidth: 660 },
  facts: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  fact: { flexGrow: 1, flexBasis: 145, padding: 14, gap: 4, borderRadius: 15, backgroundColor: "#2d2935" },
  label: { color: "#c1bbcc", fontSize: 13 },
  factValue: { color: "#f8f4ff", fontSize: 15, fontWeight: "700" },
  sections: { gap: 10 },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  gridItem: { flexBasis: "47%", flexGrow: 1 },
  section: { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 14, borderRadius: 18, backgroundColor: "#252427", borderWidth: 1, borderColor: "#39353e" },
  sectionIcon: { borderRadius: 11, backgroundColor: "#37333e", padding: 2 },
  sectionText: { flex: 1, gap: 5 },
  heading: { color: "#f8f4ff", fontSize: 16, fontWeight: "700" },
  body: { color: "#cac5d2", fontSize: 14, lineHeight: 21 },
  action: { flexDirection: "row", alignItems: "center", gap: 9, padding: 12, borderRadius: 18, borderWidth: 1, borderColor: "#39353e", backgroundColor: "#26232c" },
  calculator: { backgroundColor: "#242e29", borderRadius: 22, padding: 18, gap: 6 },
  readout: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  total: { marginTop: 10, paddingTop: 14, borderTopWidth: 1, borderTopColor: "#48594e" },
  totalValue: { fontSize: 26, fontWeight: "800" },
});
