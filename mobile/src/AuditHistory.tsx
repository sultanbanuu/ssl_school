import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "./api";

type Event = {
  id: string; actorId: string | null; actorRole: string | null; databaseUser: string;
  entityType: string; entityId: string; action: string; createdAt: string; transactionId: string;
  before: Record<string, unknown> | null; after: Record<string, unknown> | null;
};
const filters = ["all", "payment", "role", "lesson", "availability", "trial", "reschedule"];
const label = (value: string) => value.replaceAll("_", " ").replace(/^./, c => c.toUpperCase());
const display = (value: unknown) => value === undefined || value === null ? "—" : typeof value === "object" ? JSON.stringify(value) : String(value);

export function AuditHistory() {
  const [filter, setFilter] = useState("all");
  const [items, setItems] = useState<Event[]>([]);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<Event | null>(null);
  const generation = useRef(0);
  const busy = useRef(false);

  async function load(offset = 0) {
    if (busy.current) return;
    busy.current = true;
    const ticket = ++generation.current;
    setLoading(true); setError("");
    try {
      const result = await api<{ items: Event[]; hasMore: boolean }>(`/audit-logs?limit=25&offset=${offset}${filter === "all" ? "" : `&entityType=${filter}`}`);
      if (ticket !== generation.current) return;
      setItems(old => offset ? [...old, ...result.items.filter(row => !old.some(item => item.id === row.id))] : result.items);
      setMore(result.hasMore);
    } catch (e) {
      if (ticket === generation.current) setError(e instanceof Error ? e.message : "Could not load audit history.");
    } finally {
      if (ticket === generation.current) { busy.current = false; setLoading(false); }
    }
  }
  useEffect(() => {
    busy.current = false; setItems([]); setMore(false); void load();
    return () => { generation.current++; };
  }, [filter]);
  const fields = detail ? [...new Set([...Object.keys(detail.before ?? {}), ...Object.keys(detail.after ?? {})])].filter(key => key !== "id" && (detail.action !== "updated" || JSON.stringify(detail.before?.[key]) !== JSON.stringify(detail.after?.[key]))) : [];

  return <>
    <ScrollView contentContainerStyle={s.content}>
      <Text accessibilityRole="header" style={s.title}>Audit history</Text>
      <Text style={s.muted}>Payment, role, and schedule changes. History is read-only.</Text>
      <View style={s.row}>{filters.map(value => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: filter === value }} disabled={loading} onPress={() => setFilter(value)} style={[s.button, filter === value && s.selected]}><Text style={s.text}>{label(value)}</Text></Pressable>)}</View>
      <Pressable accessibilityRole="button" disabled={loading} onPress={() => void load()} style={s.button}><Text style={s.text}>Refresh history</Text></Pressable>
      {!!error && <Text accessibilityRole="alert" style={s.error}>{error} Use Refresh history to retry.</Text>}
      {loading && <ActivityIndicator accessibilityLabel="Loading audit history" color="#a49dff" />}
      {!loading && !error && !items.length && <Text style={s.muted}>No recorded changes yet.</Text>}
      {items.map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`View ${item.entityType} ${item.action}`} onPress={() => setDetail(item)} style={s.card}>
        <Text style={s.heading}>{label(item.entityType)} {item.action}</Text>
        <Text style={s.muted}>{new Date(item.createdAt).toLocaleString()}</Text>
        <Text style={s.text}>{item.actorId ? `${label(item.actorRole ?? "User")} · ${item.actorId}` : `Database action · ${item.databaseUser}`}</Text>
        <Text style={s.muted}>Record: {item.entityId}</Text>
      </Pressable>)}
      {more && <Pressable accessibilityRole="button" disabled={loading} onPress={() => void load(items.length)} style={s.button}><Text style={s.text}>Load older changes</Text></Pressable>}
    </ScrollView>
    <Modal visible={!!detail} animationType="slide" onRequestClose={() => setDetail(null)}>
      <SafeAreaView style={s.screen}><ScrollView contentContainerStyle={s.content}>
        <Pressable accessibilityRole="button" onPress={() => setDetail(null)} style={s.button}><Text style={s.text}>Back to audit history</Text></Pressable>
        {detail && <>
          <Text accessibilityRole="header" style={s.title}>{label(detail.entityType)} {detail.action}</Text>
          <Text style={s.muted}>{new Date(detail.createdAt).toLocaleString()}</Text>
          <Text selectable style={s.text}>Actor: {detail.actorId ? `${detail.actorRole} · ${detail.actorId}` : `Database action (${detail.databaseUser})`}</Text>
          <Text selectable style={s.muted}>Record: {detail.entityId}</Text>
          <Text selectable style={s.muted}>Transaction: {detail.transactionId}</Text>
          {fields.map(key => <View key={key} style={s.card}>
            <Text style={s.heading}>{label(key)}</Text>
            <Text selectable style={s.muted}>Before: {display(detail.before?.[key])}</Text>
            <Text selectable style={s.text}>After: {display(detail.after?.[key])}</Text>
          </View>)}
        </>}
      </ScrollView></SafeAreaView>
    </Modal>
  </>;
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#272727" },
  content: { padding: 22, paddingBottom: 48, gap: 16, width: "100%", maxWidth: 900, alignSelf: "center" },
  title: { fontSize: 28, fontWeight: "700", color: "#f5f5f3" },
  heading: { fontSize: 17, fontWeight: "600", color: "#f5f5f3" },
  text: { color: "#f5f5f3", fontSize: 15, lineHeight: 22 },
  muted: { color: "#b5b5b5", fontSize: 14, lineHeight: 22 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  button: { padding: 12, minHeight: 44, borderRadius: 12, backgroundColor: "#353535" },
  selected: { backgroundColor: "#7064ed" },
  card: { padding: 18, gap: 8, borderRadius: 18, backgroundColor: "#303030" },
  error: { color: "#ff9b90" },
});
