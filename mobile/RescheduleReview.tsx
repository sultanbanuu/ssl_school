import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { schoolRequest, SessionExpiredError } from "./auth-client";
import { bookingTime } from "./LessonRescheduleControls";
type RequestRow = { id: string; status: string; startsAt: string; endsAt: string; originalStart: string; originalEnd: string; quotaWaived: boolean; waiverReason: string | null; lesson: { enrollment: { course: { name: string }; student: { profile: { firstName: string | null; lastName: string | null } } } } };
type Cancelled = { id: string; date: string; startTime: string; enrollment: RequestRow["lesson"]["enrollment"] };
export function RescheduleReview({ role, onChanged, onFailure }: { role: string; onChanged: () => void; onFailure: (e: unknown) => void }) {
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [cancelled, setCancelled] = useState<Cancelled[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const fail = useRef(onFailure); fail.current = onFailure;
  async function pages<T>(path: string) { const all: T[] = []; for (let offset = 0; ; offset += 50) { const page = await schoolRequest<T[]>(`${path}?offset=${offset}`); all.push(...page); if (page.length < 50) return all; } }
  async function load() {
    setLoading(true);
    try { const [r, c] = await Promise.all([pages<RequestRow>("/reschedule-requests"), role === "admin" ? pages<Cancelled>("/student-cancellations") : Promise.resolve([])]); setRows(r); setCancelled(c); setError(""); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to load requests"); if (e instanceof SessionExpiredError) fail.current(e); }
    finally { setLoading(false); }
  }
  useEffect(() => { if (!open) return; void load(); const timer = setInterval(() => void load(), 15000); return () => clearInterval(timer); }, [open, role]);
  async function mutate(path: string, body: unknown, method = "PATCH") {
    setBusy(true); setMessage(""); setError("");
    try { await schoolRequest(path, method, body); await load(); onChanged(); setMessage("Change saved. The student’s lesson information will refresh automatically."); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not save change"); if (e instanceof SessionExpiredError) fail.current(e); }
    finally { setBusy(false); }
  }
  const button = (label: string, onPress: () => void, disabled = false) => <Pressable accessibilityRole="button" disabled={busy || disabled} onPress={onPress} style={[s.button, (busy || disabled) && { opacity: 0.4 }]}><Text style={s.buttonText}>{label}</Text></Pressable>;
  const name = (enrollment: RequestRow["lesson"]["enrollment"]) => [enrollment.student.profile.firstName, enrollment.student.profile.lastName].filter(Boolean).join(" ") || "Student";
  return <View style={s.wrap}>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} style={s.toggle}><Text style={s.title}>Rescheduling requests {open ? "−" : "+"}</Text></Pressable>
    {open && <View style={s.wrap}>
      <Text style={s.note}>Free times come automatically from working hours and the lesson calendar. Review requests for a new lesson time. Original bookings stay active until approval. Availability is rechecked when you approve.</Text>
      {loading && <ActivityIndicator />}{!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}{!!message && <Text accessibilityLiveRegion="polite" style={s.note}>{message}</Text>}
      {button("Refresh requests", () => void load())}
      {!loading && !rows.length && <Text style={s.note}>No rescheduling requests.</Text>}
      {[...rows].sort((a, b) => Number(b.status === "pending") - Number(a.status === "pending")).map(row => <View key={row.id} style={s.card}>
        <Text style={s.title}>{name(row.lesson.enrollment)} · {row.lesson.enrollment.course.name}</Text><Text style={s.note}>Status: {row.status}{row.quotaWaived ? " · excluded from monthly limit" : ""}</Text>
        <Text style={s.note}>From: {bookingTime(row.originalStart, row.originalEnd)}</Text><Text style={s.note}>Requested: {bookingTime(row.startsAt, row.endsAt)} (Baku)</Text>
        {(row.status === "pending" || role === "admin" && !row.quotaWaived) && <TextInput accessibilityLabel={`Review note for ${row.id}`} placeholder="Review note / reason for quota correction" value={reasons[row.id] || ""} onChangeText={text => setReasons(old => ({ ...old, [row.id]: text }))} style={s.input} />}
        <View style={s.actions}>{row.status === "pending" && <>{button("Approve", () => void mutate(`/reschedule-requests/${row.id}`, { status: "approved", note: reasons[row.id] || undefined }))}{button("Reject", () => void mutate(`/reschedule-requests/${row.id}`, { status: "rejected", note: reasons[row.id] || undefined }))}</>}
        {role === "admin" && !row.quotaWaived && button("Exclude mistaken request from limit", () => void mutate(`/reschedule-requests/${row.id}/quota`, { reason: reasons[row.id] }), (reasons[row.id]?.trim().length || 0) < 3)}</View>
        {row.waiverReason && <Text style={s.note}>Correction: {row.waiverReason}</Text>}
      </View>)}
      {role === "admin" && <><Text style={s.title}>Student cancellations</Text><Text style={s.note}>Restore mistaken cancellations when the original time is still in the future and available. This does not reopen a closed rescheduling request.</Text>{!cancelled.length && <Text style={s.note}>No student cancellations.</Text>}{cancelled.map(lesson => <View key={lesson.id} style={s.card}><Text style={s.title}>{name(lesson.enrollment)} · {lesson.enrollment.course.name}</Text><Text style={s.note}>{lesson.date} · {lesson.startTime} (Baku)</Text>{button("Restore cancelled lesson", () => void mutate(`/lessons/${lesson.id}/restore`, undefined, "POST"))}</View>)}</>}
    </View>}
  </View>;
}
const s = StyleSheet.create({ wrap: { gap: 12 }, toggle: { padding: 16, borderRadius: 14, backgroundColor: "#e5ece5" }, title: { fontSize: 16, color: "#203d33", fontWeight: "600" }, note: { color: "#526459", lineHeight: 21 }, error: { color: "#a03d2b" }, card: { padding: 16, gap: 10, borderWidth: 1, borderColor: "#d9e1d8", backgroundColor: "white", borderRadius: 14 }, actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, button: { padding: 12, borderRadius: 10, backgroundColor: "#245d48", alignSelf: "flex-start" }, buttonText: { color: "white", fontWeight: "600" }, input: { padding: 12, borderWidth: 1, borderColor: "#c9d6ca", borderRadius: 10, color: "#203d33" } });

