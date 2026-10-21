import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { schoolRequest, SessionExpiredError } from "./auth-client";

type Lesson = { id: string; date: string; startTime: string; endTime: string | null; status: "scheduled" | "cancelled" | "completed"; enrollment: { course: { name: string }; student: { profile: { firstName: string | null; lastName: string | null } } }; teacher: { profile: { firstName: string | null; lastName: string | null } } };
type Enrollment = { id: string; studentId: string; courseId: string; course: { name: string }; student: { profile: { firstName: string | null; lastName: string | null } } };
const pageSize = 25;
export function Lessons({ role, onFailure }: { role: string; onFailure: (error: unknown) => void }) {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [enrollmentId, setEnrollmentId] = useState("");
  const [date, setDate] = useState("");
  const [startTime, setStart] = useState("");
  const [endTime, setEnd] = useState("");
  const staff = role === "admin" || role === "manager";
  async function load(page: number) {
    setBusy(true); setError("");
    try { setLessons(await schoolRequest<Lesson[]>(`/lessons?limit=${pageSize}&offset=${page}`)); setOffset(page); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to load lessons"); if (e instanceof SessionExpiredError) onFailure(e); }
    finally { setBusy(false); }
  }
  useEffect(() => { void load(0); }, []);
  async function mutate(path: string, method: string, body: unknown) {
    setBusy(true); setError("");
    try { await schoolRequest(path, method, body); setEditing(null); await load(offset); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to save lesson"); if (e instanceof SessionExpiredError) onFailure(e); }
    finally { setBusy(false); }
  }
  async function newLesson() {
    setBusy(true); setError("");
    try {
      const all: Enrollment[] = [];
      for (let skip = 0; ; skip += 100) {
        const page = await schoolRequest<Enrollment[]>(`/enrollments?limit=100&offset=${skip}`);
        all.push(...page); if (page.length < 100) break;
      }
      setEnrollments(all); setEnrollmentId(""); setEditing("new"); setDate(""); setStart(""); setEnd("");
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load enrollments"); if (e instanceof SessionExpiredError) onFailure(e); }
    finally { setBusy(false); }
  }
  const button = (label: string, action: () => void) => <Pressable accessibilityRole="button" disabled={busy} onPress={action} style={{ paddingVertical: 9 }}><Text style={{ color: "#245e50", fontWeight: "600" }}>{label}</Text></Pressable>;
  return <View style={{ gap: 12 }}>
    <Text style={{ fontSize: 22, color: "#203d33", fontWeight: "600" }}>{role === "teacher" ? "Your teaching schedule" : staff ? "School lessons" : "Your lessons"}</Text>
    <Text style={{ color: "#748077" }}>Dates and times use the school’s local time (Asia/Baku).</Text>
    {button("Refresh lessons", () => { void load(offset); })}
    {staff && button("Schedule a lesson", () => { void newLesson(); })}
    {busy && <ActivityIndicator color="#245e50" />}
    {!!error && !editing && <Text accessibilityRole="alert" style={{ color: "#a03d2b" }}>{error}</Text>}
    {!busy && !lessons.length && <Text>No lessons on this page.</Text>}
    {editing && <View style={{ gap: 10, padding: 14, borderWidth: 1, borderColor: "#dce2d9", borderRadius: 10 }}>
      <Text style={{ fontWeight: "600" }}>{editing === "new" ? "New lesson" : "Reschedule lesson"}</Text>
      {editing === "new" && <>
        <Text>Select an enrollment (student / course)</Text>
        {enrollments.length === 0 && <Text>Create an enrollment before scheduling a lesson.</Text>}
        {enrollments.map(e => <Pressable key={e.id} disabled={busy} accessibilityRole="radio" accessibilityState={{ checked: enrollmentId === e.id }} onPress={() => setEnrollmentId(e.id)} style={{ padding: 8, backgroundColor: enrollmentId === e.id ? "#d9e8d4" : "#f6f5ef" }}><Text>{[e.student.profile.firstName, e.student.profile.lastName].filter(Boolean).join(" ") || e.studentId} / {e.course.name}</Text></Pressable>)}
      </>}
      {([ ["Date (YYYY-MM-DD)", date, setDate], ["Start (HH:MM)", startTime, setStart], ["End (HH:MM)", endTime, setEnd] ] as const).map(([label, value, update]) => <View key={label}><Text>{label}</Text><TextInput accessibilityLabel={label} editable={!busy} value={value} onChangeText={update} placeholder={label} style={{ padding: 10, borderWidth: 1, borderColor: "#dce2d9", borderRadius: 6 }} /></View>)}
      {!!error && <Text accessibilityRole="alert" style={{ color: "#a03d2b" }}>{error}</Text>}
      {button("Save lesson", () => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime) || endTime <= startTime || (editing === "new" && !enrollmentId)) { setError("Select an enrollment and enter a valid date and time range."); return; }
        void mutate(editing === "new" ? "/lessons" : `/lessons/${editing}`, editing === "new" ? "POST" : "PATCH", { date, startTime, endTime, ...(editing === "new" ? { enrollmentId } : {}) });
      })}
      {button("Close", () => setEditing(null))}
    </View>}
    {lessons.map(lesson => <View key={lesson.id} style={{ padding: 14, backgroundColor: "#f0f4ed", borderRadius: 10, gap: 6 }}>
      <Text style={{ fontWeight: "600" }}>{lesson.enrollment.course.name}</Text>
      <Text>{lesson.date} · {lesson.startTime}–{lesson.endTime || "End unspecified"}</Text>
      <Text>Student: {[lesson.enrollment.student.profile.firstName, lesson.enrollment.student.profile.lastName].filter(Boolean).join(" ") || "Student"}</Text>
      <Text>Teacher: {[lesson.teacher.profile.firstName, lesson.teacher.profile.lastName].filter(Boolean).join(" ") || "Teacher"}</Text>
      <Text>{lesson.status}</Text>
      {role !== "student" && lesson.status === "scheduled" && <View>
        {button("Reschedule", () => { setEditing(lesson.id); setDate(lesson.date); setStart(lesson.startTime); setEnd(lesson.endTime || ""); })}
        {button("Mark completed", () => { void mutate(`/lessons/${lesson.id}`, "PATCH", { status: "completed" }); })}
        {button("Cancel lesson", () => { void mutate(`/lessons/${lesson.id}`, "PATCH", { status: "cancelled" }); })}
      </View>}
    </View>)}
    <View style={{ flexDirection: "row", gap: 20 }}>{offset > 0 && button("Previous", () => { void load(Math.max(0, offset - pageSize)); })}{lessons.length === pageSize && button("Next", () => { void load(offset + pageSize); })}</View>

  </View>;
}
