import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { addDays } from "../src/scheduling";
import { civil, fullName, schoolToday, weekStart, type AvailabilitySlot } from "./useAvailability";

const label = (date: string, options: Intl.DateTimeFormatOptions) => new Date(date + "T12:00:00Z").toLocaleDateString("en-GB", { ...options, timeZone: "UTC" });
export function AppointmentPicker({ week, onWeek, onMonth, slots, onSelect, busy, loading }: {
  week: string; onWeek: (date: string) => void; onMonth: (date: string) => void; slots: AvailabilitySlot[]; onSelect: (slot: AvailabilitySlot) => void; busy: boolean; loading: boolean;
}) {
  const wide = useWindowDimensions().width >= 900;
  const [expanded, setExpanded] = useState(false);
  const [chosen, setChosen] = useState(schoolToday());
  const selected = weekStart(chosen) === week ? chosen : week;
  const month = selected.slice(0, 7) + "-01";
  const days = Array.from({ length: 42 }, (_, i) => addDays(weekStart(month), i));
  const weekdays = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const pick = (date: string) => { setChosen(date); if (!wide) setExpanded(false); onMonth(date.slice(0, 7) + "-01"); if (weekStart(date) !== week) onWeek(weekStart(date)); };
  const changeMonth = (delta: number) => { const date = new Date(month + "T12:00:00Z"); date.setUTCMonth(date.getUTCMonth() + delta); pick(date.toISOString().slice(0, 10)); };
  const forDay = (date: string) => slots.filter(slot => civil(slot.startsAt).slice(0, 10) === date).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const arrow = (title: string, text: string, action: () => void) => <Pressable accessibilityRole="button" accessibilityLabel={title} disabled={busy} onPress={action} style={s.arrow}><Text style={s.arrowText}>{text}</Text></Pressable>;
  return <View style={s.frame}>
    <Text accessibilityRole="header" style={s.title}>Select an appointment time</Text>
    <Text style={s.zone}>Azerbaijan Standard Time · GMT+04:00</Text>
    <View style={[s.layout, wide && { flexDirection: "row" }]}>
      <View style={[s.month, wide && { width: 280 }]}>
        <View style={s.row}><Pressable accessibilityRole="button" accessibilityLabel={expanded ? "Hide month calendar" : "Show month calendar"} accessibilityState={{ expanded: wide || expanded }} onPress={() => setExpanded(!expanded)} style={{ flex: 1, minHeight: 44, justifyContent: "center" }}><Text style={s.monthTitle}>{label(month, { month: "long", year: "numeric" })}{!wide && (expanded ? " ▴" : " ▾")}</Text></Pressable>{arrow("Previous month", "‹", () => changeMonth(-1))}{arrow("Next month", "›", () => changeMonth(1))}</View>
        {(wide || expanded) && <View style={s.monthGrid}>{["M", "T", "W", "T", "F", "S", "S"].map((day, i) => <View key={i} style={s.cell}><Text style={s.weekLabel}>{day}</Text></View>)}
          {days.map(date => <Pressable key={date} accessibilityRole="button" accessibilityLabel={`Choose ${date}`} accessibilityState={{ selected: date === selected }} disabled={busy} onPress={() => pick(date)} style={s.cell}><View style={[s.date, forDay(date).length > 0 && s.available, date === selected && s.chosen]}><Text style={[s.dateText, date.slice(0, 7) !== month.slice(0, 7) && { opacity: 0.4 }, date === selected && s.white]}>{Number(date.slice(8))}</Text>{forDay(date).length > 0 && <View style={[s.dot, date === selected && { backgroundColor: "white" }]} />}</View></Pressable>)}
        </View>}
        <Text style={s.legend}>● Times available     Blue circle: selected day</Text>
      </View>
      <View style={s.schedule}>
        <View style={s.row}>{arrow("Previous week", "‹", () => pick(addDays(selected, -7)))}<Text style={s.range}>{label(week, { day: "numeric", month: "short" })} – {label(addDays(week, 6), { day: "numeric", month: "short" })}</Text>{arrow("Next week", "›", () => pick(addDays(selected, 7)))}</View>
        <View style={s.week}>{weekdays.map(date => <Pressable key={date} accessibilityRole="button" accessibilityLabel={`Show appointments ${date}`} accessibilityState={{ selected: date === selected }} disabled={busy} onPress={() => pick(date)} style={[s.weekDay, date === selected && s.chosen]}><Text style={[s.weekLabel, date === selected && s.white]}>{label(date, { weekday: "short" }).slice(0, 2)}</Text><Text style={[s.dayNumber, date === selected && s.white]}>{Number(date.slice(8))}</Text></Pressable>)}</View>
        {loading && <Text accessibilityLiveRegion="polite" style={s.zone}>Updating appointment times…</Text>}
        {!wide && <Text style={s.dayTitle}>{label(selected, { weekday: "long", day: "numeric", month: "long" })}</Text>}
        <View style={wide ? s.week : s.times}>{(wide ? weekdays : [selected]).map(date => <View key={date} style={wide ? s.dayColumn : s.phoneTimes}>
          {!loading && !forDay(date).length && <Text style={s.empty}>{wide ? "—" : "No appointments on this day. Choose another date."}</Text>}
          {forDay(date).map(slot => <Pressable key={slot.id} testID={`appointment-${slot.id}`} accessibilityRole="button" accessibilityLabel={`${civil(slot.startsAt).slice(11,16)}, ${fullName(slot.teacher.profile)}, ${slot.course.name}${slot.reservation ? ", " + slot.reservation.status : ""}`} disabled={busy || loading} onPress={() => onSelect(slot)} style={[s.time, !wide && s.phoneTime, !!slot.reservation && s.reserved]}><Text style={s.timeText}>{civil(slot.startsAt).slice(11, 16)}</Text><Text style={s.person}>{fullName(slot.teacher.profile)}</Text><Text style={s.subject}>{slot.reservation?.status || slot.course.name}</Text></Pressable>)}
        </View>)}</View>
      </View>
    </View>
  </View>;
}
const s = StyleSheet.create({
  frame: { borderWidth: 1, borderColor: "#dce2e5", borderRadius: 18, backgroundColor: "white", padding: 16, gap: 8 }, title: { color: "#202c36", fontSize: 20, fontWeight: "600" }, zone: { color: "#74808c", fontSize: 12, lineHeight: 18 }, layout: { gap: 20, marginTop: 8 }, month: { flexShrink: 0 }, row: { flexDirection: "row", alignItems: "center" }, monthTitle: { fontSize: 16, fontWeight: "600", color: "#263541" }, arrow: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" }, arrowText: { fontSize: 28, color: "#536778" }, monthGrid: { flexDirection: "row", flexWrap: "wrap" }, cell: { width: "14.285714%", minHeight: 42, alignItems: "center", justifyContent: "center" }, date: { width: 32, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" }, dateText: { fontSize: 14, color: "#344754" }, available: { backgroundColor: "#e1f2fc" }, chosen: { backgroundColor: "#0864cf", borderRadius: 24 }, white: { color: "#fff" }, dot: { width: 3, height: 3, borderRadius: 2, backgroundColor: "#0864cf", marginTop: 2 }, legend: { fontSize: 10, color: "#6b7f8c", marginTop: 10 }, schedule: { flex: 1, minWidth: 0 }, range: { flex: 1, textAlign: "center", color: "#3c5263", fontSize: 13 }, week: { flexDirection: "row", gap: 4 }, weekDay: { flex: 1, minWidth: 0, alignItems: "center", paddingVertical: 10, gap: 5 }, weekLabel: { fontSize: 10, color: "#7a8791" }, dayNumber: { fontSize: 20, color: "#243848" }, dayTitle: { marginVertical: 18, color: "#344754", fontWeight: "600", fontSize: 14 }, times: { width: "100%" }, phoneTimes: { flexDirection: "row", flexWrap: "wrap", gap: 10, width: "100%" }, dayColumn: { flex: 1, minWidth: 0, gap: 12, paddingTop: 16 }, time: { borderWidth: 1, borderColor: "#a6bbca", borderRadius: 22, paddingVertical: 12, paddingHorizontal: 5, alignItems: "center", gap: 4, minHeight: 48 }, phoneTime: { flexBasis: "46%", flexGrow: 1 }, timeText: { fontSize: 17, fontWeight: "600", color: "#0864cf" }, person: { fontSize: 10, color: "#566b7c", textAlign: "center" }, subject: { fontSize: 10, color: "#778795", textAlign: "center" }, reserved: { backgroundColor: "#fff5df", borderColor: "#d7b977" }, empty: { color: "#8897a1", textAlign: "center", paddingVertical: 24, flexShrink: 1, width: "100%", fontSize: 13, lineHeight: 20 },
});
