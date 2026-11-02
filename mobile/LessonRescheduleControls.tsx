import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { schoolRequest } from "./auth-client";
import { lessonTimeOptions } from "./lesson-time-options";
type Slot = { id: string; startsAt: string; endsAt: string; canReschedule?: boolean; reason?: string };
type Options = { items: Slot[]; hasMore: boolean; nextOffset: number; lessonMinutes: number; scheduleConfigured: boolean; from: string; to: string; quota: { used: number; limit: number; remaining: number; resetsAt: string }; pending: Slot | null };
export const bookingTime = (start: string, end: string) => `${new Date(start).toLocaleDateString("en-GB", { timeZone: "Asia/Baku", day: "numeric", month: "short", year: "numeric" })} · ${new Date(start).toLocaleTimeString("en-GB", { timeZone: "Asia/Baku", hour: "2-digit", minute: "2-digit" })}–${new Date(end).toLocaleTimeString("en-GB", { timeZone: "Asia/Baku", hour: "2-digit", minute: "2-digit" })}`;
export function LessonRescheduleControls({ lessonId, onChanged }: { lessonId: string; onChanged: () => void }) {
  const [options, setOptions] = useState<Options | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedRange, setSelectedRange] = useState<string | null>(null);
  const [mode, setMode] = useState<"reschedule" | "cancel" | null>("reschedule");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [visibleCount, setVisibleCount] = useState(6);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  useEffect(() => {
    let alive = true;
    let loading = false;
    const load = async () => {
      if (loading) return;
      loading = true;
      try {
        const count = Math.max(1, Math.ceil((optionsRef.current?.nextOffset || 7) / 7));
        const pages = await Promise.all(Array.from({ length: count }, (_, i) => schoolRequest<Options>(`/lessons/${lessonId}/reschedule-options?offset=${i * 7}`)));
        if (alive) {
          const data = { ...pages[pages.length - 1]!, from: pages[0]!.from, items: pages.flatMap(page => page.items) };
          setOptions(data); setError("");
          setSelected(value => value && data.items.some(range => Date.parse(value) >= Date.parse(range.startsAt) && Date.parse(value) + data.lessonMinutes * 60000 <= Date.parse(range.endsAt)) ? value : null);
        }
      } catch (e) { if (alive) setError(e instanceof Error ? e.message : "Could not refresh availability"); }
      finally { loading = false; }
    };
    load();
    const timer = setInterval(() => { if (AppState.currentState === "active" || Platform.OS === "web") void load(); }, 15000);
    const sub = AppState.addEventListener("change", state => { if (state === "active") load(); });
    if (Platform.OS === "web") window.addEventListener("focus", load);
    return () => { alive = false; clearInterval(timer); sub.remove(); if (Platform.OS === "web") window.removeEventListener("focus", load); };
  }, [lessonId]);
  async function more(reset = false) {
    setBusy(true); setError("");
    try { const page = await schoolRequest<Options>(`/lessons/${lessonId}/reschedule-options?offset=${reset ? 0 : options?.nextOffset || 0}`); setOptions(old => ({ ...page, items: [...new Map([...(reset ? [] : old?.items || []), ...page.items].map(item => [item.id, item])).values()] })); if (reset) setSelected(null); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not load availability"); } finally { setBusy(false); }
  }
  async function submit(cancel: boolean) {
    setBusy(true); setError(""); setMessage("");
    try {
      await schoolRequest(`/lessons/${lessonId}/${cancel ? "cancel" : "reschedule-requests"}`, "POST", cancel ? undefined : { startsAt: selected });
      setMessage(cancel ? "Lesson cancelled." : "Request sent. Your original lesson stays booked until your teacher or admin approves.");
      setMode(null); setSelected(null); onChanged();
      if (!cancel) setOptions(await schoolRequest<Options>(`/lessons/${lessonId}/reschedule-options`));
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to update lesson"); } finally { setBusy(false); }
  }
  const timeOptions = lessonTimeOptions(options?.items || [], options?.lessonMinutes || 0);
  return <View style={s.wrap}>
    <Text style={s.note}>Choose an available time matching your scheduled lesson’s duration. All times are in Baku.</Text>
    {options && <Text style={s.note}>{options.quota.used} of 3 rescheduling requests used this month. Resets {new Date(options.quota.resetsAt).toLocaleDateString("en-GB", { timeZone: "Asia/Baku", day: "numeric", month: "long" })}.</Text>}
    {options?.pending && <Text style={s.notice}>Reschedule pending: {bookingTime(options.pending.startsAt, options.pending.endsAt)}. Your original booking is unchanged.</Text>}
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    {!!message && <Text accessibilityLiveRegion="polite" style={s.notice}>{message}</Text>}
    <Pressable accessibilityRole="button" disabled={busy} onPress={() => setMode("reschedule")} style={s.row}><Text style={s.title}>Reschedule lesson</Text><Text style={s.note}>{options?.quota.remaining === 0 ? "Monthly limit reached" : "Choose your teacher’s available time →"}</Text></Pressable>
    {mode === "reschedule" && <View style={s.wrap}>
      {!options && !error && <ActivityIndicator color="#d8b6ff" />}
      <Text style={s.title}>Teacher’s available times</Text>
      <Text style={s.note}>Availability updates automatically every 15 seconds.</Text>
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => void more(true)}><Text style={s.link}>Refresh available times</Text></Pressable>
      {options && <Text style={s.note}>Each option is {options.lessonMinutes} minutes, matching your scheduled lesson.</Text>}
      {timeOptions.slice(0, visibleCount).map(slot => <Pressable key={slot.startsAt} accessibilityRole="radio" accessibilityLabel={bookingTime(slot.startsAt, slot.endsAt)} accessibilityState={{ checked: selected === slot.startsAt }} onPress={() => setSelected(slot.startsAt)} style={[s.slot, selected === slot.startsAt && s.chosen]}><Text style={s.title}>{bookingTime(slot.startsAt, slot.endsAt)}</Text><Text style={s.note}>{options?.lessonMinutes}-minute lesson</Text></Pressable>)}
      {timeOptions.length > visibleCount && <Pressable accessibilityRole="button" onPress={() => setVisibleCount(count => count + 6)}><Text style={s.link}>Show more openings ({timeOptions.length - visibleCount})</Text></Pressable>}
      {options && options.items.length === 0 && <Text style={s.note}>{options.scheduleConfigured === false ? "Your teacher’s working hours have not been configured yet. Contact your school." : "No free ranges fit this lesson in the dates shown. Try the next week."}</Text>}
      {options?.from && <Text style={s.note}>Showing {options.from} through {options.to}</Text>}
      {options?.hasMore && <Pressable disabled={busy} onPress={() => void more()}><Text style={s.link}>Show next week</Text></Pressable>}
      <Pressable accessibilityRole="button" disabled={busy || !selected || !options?.quota.remaining || !!options.pending} onPress={() => submit(false)} style={[s.button, (busy || !selected) && { opacity: 0.5 }]}><Text style={s.buttonText}>{busy ? "Sending…" : "Send reschedule request"}</Text></Pressable>
      <Text style={s.note}>Submitting uses one of your three monthly requests, including if rejected. An admin can correct a mistaken request. Availability is checked again on approval.</Text>
    </View>}
    <Pressable accessibilityRole="button" disabled={busy} onPress={() => setMode(mode === "cancel" ? null : "cancel")} style={s.row}><Text style={[s.title, { color: "#efbbc9" }]}>Cancel lesson</Text><Text style={s.note}>Cancellation has no monthly limit →</Text></Pressable>
    {mode === "cancel" && <View style={s.wrap}><Text style={s.note}>Cancel this lesson? Any pending rescheduling request will also close. Your admin can restore a mistaken cancellation if the time remains available.</Text><Pressable accessibilityRole="button" disabled={busy} onPress={() => submit(true)} style={s.button}><Text style={s.buttonText}>{busy ? "Cancelling…" : "Confirm cancellation"}</Text></Pressable><Pressable onPress={() => setMode(null)}><Text style={s.link}>Keep lesson</Text></Pressable></View>}
  </View>;
}
const s = StyleSheet.create({ wrap: { gap: 14 }, note: { color: "#b3adbf", fontSize: 13, lineHeight: 21 }, notice: { color: "#d9bdf5", padding: 15, backgroundColor: "#282331", borderRadius: 16, lineHeight: 22 }, error: { color: "#f4b3b3", lineHeight: 22 }, row: { borderBottomWidth: 1, borderColor: "#35313f", paddingVertical: 20, gap: 7 }, title: { color: "#eee8f5", fontSize: 15, fontWeight: "600" }, slot: { borderRadius: 15, padding: 16, borderWidth: 1, borderColor: "#35313f", backgroundColor: "#1b1d26" }, chosen: { borderColor: "#d8b6ff", backgroundColor: "#31243f" }, button: { backgroundColor: "#d8b6ff", padding: 17, borderRadius: 18, alignItems: "center" }, buttonText: { color: "#281e35", fontWeight: "700" }, link: { color: "#d8b6ff", padding: 12 } });
