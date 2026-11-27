import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { schoolRequest, SessionExpiredError } from "./auth-client";
import { bookingTime } from "./LessonRescheduleControls";

type Enrollment = { course: { name: string }; student: { profile: { firstName: string | null; lastName: string | null } } };
type RequestRow = {
  id: string;
  status: string;
  startsAt: string;
  endsAt: string;
  originalStart: string;
  originalEnd: string;
  reviewNote: string | null;
  quotaWaived: boolean;
  waiverReason: string | null;
  lesson: { enrollment: Enrollment };
};
type Cancelled = { id: string; date: string; startTime: string; enrollment: Enrollment };
type EditTime = { id: string; date: string; time: string };

async function pages<T>(path: string, filters?: Record<string, string>) {
  const all: T[] = [];
  for (let offset = 0; ; offset += 50) {
    const query = new URLSearchParams({ ...filters, offset: String(offset) });
    const page = await schoolRequest<T[]>(`${path}?${query}`);
    all.push(...page);
    if (page.length < 50) return all;
  }
}

function lessonName(enrollment: Enrollment) {
  const { firstName, lastName } = enrollment.student.profile;
  const name = [firstName, lastName].filter(Boolean).join(" ") || "Student";
  return `${name} · ${enrollment.course.name}`;
}

export function RescheduleReview({ admin, open, focusedRequest, onToggle, onChanged, onFailure }: {
  admin: boolean;
  open: boolean;
  focusedRequest: string | null;
  onToggle: () => void;
  onChanged: () => void;
  onFailure: (e: unknown) => void;
}) {
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [cancelled, setCancelled] = useState<Cancelled[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [edit, setEdit] = useState<EditTime | null>(null);
  const generation = useRef(0);
  const saving = useRef(false);
  const fail = useRef(onFailure);
  fail.current = onFailure;

  const load = useCallback(async () => {
    const ticket = ++generation.current;
    setLoading(true);
    try {
      const requests = await pages<RequestRow>("/reschedule-requests", open ? undefined : { status: "pending" });
      if (ticket !== generation.current) return;
      setRows(requests);
      if (admin && open) {
        const cancellations = await pages<Cancelled>("/student-cancellations");
        if (ticket !== generation.current) return;
        setCancelled(cancellations);
      }
      setLoadError("");
    } catch (e) {
      if (ticket !== generation.current) return;
      setLoadError(e instanceof Error ? e.message : "Unable to load requests");
      if (e instanceof SessionExpiredError) fail.current(e);
    } finally {
      if (ticket === generation.current) setLoading(false);
    }
  }, [admin, open]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      if (AppState.currentState !== "background" && AppState.currentState !== "inactive") void load();
    }, 15000);
    const sub = AppState.addEventListener("change", state => {
      if (state === "active") void load();
    });
    return () => {
      generation.current++;
      clearInterval(timer);
      sub.remove();
    };
  }, [load]);

  async function mutate(path: string, body: unknown, method = "PATCH") {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setMessage("");
    setError("");
    try {
      await schoolRequest(path, method, body);
      setEdit(null);
      onChanged();
      await load();
      setMessage("Change saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save change");
      if (e instanceof SessionExpiredError) fail.current(e);
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  function review(row: RequestRow, status: "approved" | "rejected", time?: EditTime) {
    if (time && (!/^\d{4}-\d{2}-\d{2}$/.test(time.date) || !/^([01]\d|2[0-3]):(00|30)$/.test(time.time))) {
      setError("Enter a date as YYYY-MM-DD and a Baku time ending in :00 or :30.");
      return;
    }
    void mutate(`/reschedule-requests/${row.id}`, {
      status,
      note: reasons[row.id]?.trim() || undefined,
      ...(time && { startsAt: `${time.date}T${time.time}:00+04:00` }),
    });
  }

  function button(label: string, onPress: () => void, disabled = false) {
    return <Pressable accessibilityRole="button" disabled={busy || disabled} onPress={onPress} style={[s.button, (busy || disabled) && s.disabled]}>
      <Text style={s.buttonText}>{label}</Text>
    </Pressable>;
  }

  const pendingCount = rows.filter(row => row.status === "pending").length;
  const priority = (row: RequestRow) => row.id === focusedRequest ? 2 : Number(row.status === "pending");
  return <View style={s.wrap}>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={onToggle} disabled={busy} style={s.toggle}>
      <Text style={s.title}>Rescheduling requests{pendingCount ? ` (${pendingCount} pending)` : ""} {open ? "−" : "+"}</Text>
    </Pressable>
    {open && <View style={s.wrap}>
      {loading && <ActivityIndicator accessibilityLabel="Loading rescheduling requests" />}
      {!!loadError && <Text accessibilityRole="alert" style={s.error}>{loadError}</Text>}
      {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
      {!!message && <Text accessibilityLiveRegion="polite" style={s.note}>{message}</Text>}
      {button("Refresh requests", () => void load())}
      {!loading && !rows.length && !loadError && <Text style={s.note}>No rescheduling requests.</Text>}
      {[...rows].sort((a, b) => priority(b) - priority(a)).map(row => {
        const pending = row.status === "pending";
        const editingTime = edit?.id === row.id ? edit : null;
        const canWaive = admin && !row.quotaWaived;
        return <View key={row.id} style={s.card} testID={`reschedule-request-${row.id}`}>
          <Text style={s.title}>{lessonName(row.lesson.enrollment)}</Text>
          <Text style={s.note}>Status: {row.status}{row.quotaWaived ? " · excluded from monthly limit" : ""}</Text>
          <Text style={s.note}>Original lesson: {bookingTime(row.originalStart, row.originalEnd)} (Baku)</Text>
          <Text style={s.note}>{row.status === "approved" ? "Confirmed" : "Requested"}: {bookingTime(row.startsAt, row.endsAt)} (Baku)</Text>
          {row.reviewNote && <Text style={s.note}>Review note: {row.reviewNote}</Text>}
          {row.waiverReason && <Text style={s.note}>Correction: {row.waiverReason}</Text>}
          {(pending || canWaive) && <TextInput
            accessibilityLabel={`Review note for ${row.id}`}
            placeholder={canWaive ? "Review note / reason for quota correction" : "Review note (optional)"}
            placeholderTextColor="#b5b5b5"
            value={reasons[row.id] || ""}
            maxLength={500}
            editable={!busy}
            onChangeText={text => setReasons(old => ({ ...old, [row.id]: text }))}
            style={s.input}
          />}
          {pending && editingTime && <View style={s.wrap}>
            <Text style={s.note}>New lesson start in Baku time. The lesson keeps its original duration.</Text>
            <TextInput accessibilityLabel="New lesson date (YYYY-MM-DD)" placeholder="YYYY-MM-DD" placeholderTextColor="#b5b5b5" value={editingTime.date} onChangeText={date => setEdit({ ...editingTime, date })} maxLength={10} editable={!busy} style={s.input} />
            <TextInput accessibilityLabel="New lesson start time (HH:MM)" placeholder="HH:MM" placeholderTextColor="#b5b5b5" value={editingTime.time} onChangeText={time => setEdit({ ...editingTime, time })} maxLength={5} editable={!busy} style={s.input} />
          </View>}
          <View style={s.actions}>
            {pending && (editingTime ? <>
              {button("Approve new time", () => review(row, "approved", editingTime))}
              {button("Cancel time edit", () => { setEdit(null); setError(""); })}
            </> : <>
              {button("Approve", () => review(row, "approved"))}
              {button("Change requested time", () => {
                const baku = new Date(Date.parse(row.startsAt) + 4 * 60 * 60 * 1000).toISOString();
                setEdit({ id: row.id, date: baku.slice(0, 10), time: baku.slice(11, 16) });
                setError("");
              })}
              {button("Reject", () => review(row, "rejected"))}
            </>)}
            {canWaive && button("Exclude mistaken request from limit", () => void mutate(`/reschedule-requests/${row.id}/quota`, { reason: reasons[row.id] }), (reasons[row.id]?.trim().length || 0) < 3)}
          </View>
        </View>;
      })}
      {admin && <>
        <Text style={s.title}>Student cancellations</Text>
        {!cancelled.length && !loading && !loadError && <Text style={s.note}>No student cancellations.</Text>}
        {cancelled.map(lesson => <View key={lesson.id} style={s.card}>
          <Text style={s.title}>{lessonName(lesson.enrollment)}</Text>
          <Text style={s.note}>{lesson.date} · {lesson.startTime} (Baku)</Text>
          {button("Restore cancelled lesson", () => void mutate(`/lessons/${lesson.id}/restore`, undefined, "POST"))}
        </View>)}
      </>}
    </View>}
  </View>;
}

const s = StyleSheet.create({
  wrap: { gap: 12 },
  toggle: { padding: 16, borderRadius: 14, backgroundColor: "#272727" },
  title: { fontSize: 16, color: "#f5f5f3", fontWeight: "600" },
  note: { color: "#b5b5b5", lineHeight: 21 },
  error: { color: "#ff9b90" },
  card: { padding: 16, gap: 10, borderWidth: 1, borderColor: "#3d3d3d", backgroundColor: "#272727", borderRadius: 14 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  button: { padding: 12, borderRadius: 10, backgroundColor: "#7064ed", alignSelf: "flex-start" },
  disabled: { opacity: 0.4 },
  buttonText: { color: "#f5f5f3", fontWeight: "600" },
  input: { padding: 12, borderWidth: 1, borderColor: "#3d3d3d", borderRadius: 10, color: "#f5f5f3" },
});
