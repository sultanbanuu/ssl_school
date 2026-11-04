import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { api, Profile } from "./api";

type Notification = {
  id: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
};
type Recipient = Profile & { lastName: string | null };
const message = (e: unknown) =>
  e instanceof Error ? e.message : "Please try again.";
function Action({
  title,
  onPress,
  disabled,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[s.action, disabled && { opacity: 0.5 }]}
    >
      <Text style={s.link}>{title}</Text>
    </Pressable>
  );
}
export function Notifications({ profile, onCount }: { profile: Profile; onCount?: (count: number) => void }) {
  const [composing, setComposing] = useState(false);
  const composeSending = useRef(false);
  const [detail, setDetail] = useState<Notification | null>(null);
  const [items, setItems] = useState<Notification[]>([]);
  const [count, setCount] = useState(0);
  const unread = false;
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const generation = useRef(0);
  const lock = useRef(false);
  const mutation = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const load = useCallback(async () => {
    const ticket = ++generation.current;
    lock.current = true;
    setLoading(true);
    setError("");
    try {
      const [rows, total] = await Promise.all([
        api<Notification[]>(`/notifications?limit=25&unread=${unread}`),
        api<{ count: number }>("/notifications/unread-count"),
      ]);
      if (ticket === generation.current) {
        setItems(rows);
        setCount(total.count);
        onCount?.(total.count);
        setMore(rows.length === 25);
      }
    } catch (e) {
      if (ticket === generation.current) setError(message(e));
    } finally {
      if (ticket === generation.current) {
        setLoading(false);
        lock.current = false;
      }
    }
  }, [unread, onCount]);
  const latestLoad = useRef(load);
  latestLoad.current = load;
  useEffect(() => {
    setItems([]);
    setMore(false);
    void load();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void load();
    });
    return () => {
      generation.current++;
      sub.remove();
    };
  }, [load]);
  async function next() {
    if (lock.current || mutation.current) return;
    lock.current = true;
    setLoading(true);
    const ticket = generation.current;
    try {
      const rows = await api<Notification[]>(
        `/notifications?limit=25&offset=${items.length}&unread=${unread}`,
      );
      if (ticket === generation.current) {
        setItems((old) => [
          ...old,
          ...rows.filter((row) => !old.some((item) => item.id === row.id)),
        ]);
        setMore(rows.length === 25);
        setError("");
      }
    } catch (e) {
      if (ticket === generation.current) setError(message(e));
    } finally {
      if (ticket === generation.current) {
        setLoading(false);
        lock.current = false;
      }
    }
  }
  async function read(id?: string) {
    if (mutation.current) return;
    mutation.current = true;
    setSaving(true);
    setError("");
    try {
      await api(
        id ? `/notifications/${id}/read` : "/notifications/read-all",
        {},
        "PATCH",
      );
      if (!mounted.current) return;
      setDetail((old) =>
        old && (!id || old.id === id) ? { ...old, isRead: true } : old,
      );
      await latestLoad.current();
    } catch (e) {
      if (mounted.current) setError(message(e));
    } finally {
      mutation.current = false;
      if (mounted.current) setSaving(false);
    }
  }
  return (
    <>
      <ScrollView
        contentContainerStyle={s.content}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={load}
            tintColor="#255d47"
          />
        }
      >
        <Text accessibilityRole="header" style={s.title}>Notifications</Text>
        {["admin", "manager"].includes(profile.role) && (
          <Action
            title="+  Send a school update"
            onPress={() => setComposing(true)}
          />
        )}
        <View style={s.row}>
          <View style={[s.chip, s.activeChip]}><Text style={s.link}>All updates</Text></View>
          <Action
            title={saving ? "Updating…" : "Mark all as read"}
            onPress={() => void read()}
            disabled={saving || loading || !count}
          />
        </View>
        {!!error && (
          <View style={s.card}>
            <Text accessibilityRole="alert" style={s.error}>
              {error}
            </Text>
            <Action
              title="Try again"
              onPress={() => void load()}
              disabled={loading}
            />
          </View>
        )}
        {loading && !items.length ? (
          <ActivityIndicator
            color="#255d47"
            accessibilityLabel="Loading notifications"
          />
        ) : !items.length && !error ? (
          <View style={s.card}>
            <Text style={s.emptyIcon}>✓</Text>
            <Text style={s.heading}>
              {unread ? "No unread notifications" : "Nothing here yet"}
            </Text>
            <Text style={s.body}>
              {unread
                ? "You’ve read all your school updates. Check back soon."
                : "When your school sends you an update, you’ll find it here."}
            </Text>
            {unread && (
              <Action
                title="View all updates"
                onPress={() => void load()}
              />
            )}
          </View>
        ) : (
          items.map((item) => (
            <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`${item.isRead ? "Read" : "Unread"}: ${item.title}. Open message`} onPress={() => setDetail(item)} style={s.notificationRow}>
              <View style={s.notificationIcon}><Ionicons name="school-outline" size={24} color="#fff" /></View>
              <View style={{ flex: 1, minWidth: 0, gap: 8 }}><Text numberOfLines={1} style={s.heading}>{item.title}</Text><Text style={s.small}>{new Date(item.createdAt).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</Text></View>
              {!item.isRead && <View style={s.unreadDot} />}
            </Pressable>
          ))
        )}
        {more && (
          <Action
            title={loading ? "Loading…" : "Load more"}
            disabled={loading}
            onPress={() => void next()}
          />
        )}
      </ScrollView>
      <Modal
        visible={composing}
        animationType="slide"
        onRequestClose={() => { if (!composeSending.current) setComposing(false); }}
      >
        <SafeAreaProvider><SafeAreaView style={s.screen}>
          <Compose
            sending={composeSending}
            close={() => setComposing(false)}
            sent={() => void latestLoad.current()}
          />
        </SafeAreaView></SafeAreaProvider>
      </Modal>
      <Modal
        visible={!!detail}
        animationType="slide"
        onRequestClose={() => setDetail(null)}
      >
        <SafeAreaProvider><SafeAreaView style={s.screen}>
          <ScrollView contentContainerStyle={s.content}>
            <Pressable accessibilityRole="button" accessibilityLabel="Back to notifications" onPress={() => setDetail(null)} style={s.backButton}><Ionicons name="chevron-back" size={22} color="#f5f5f3" /><Text style={s.link}>Back to notifications</Text></Pressable>
            {detail && (
              <>
                <Text style={s.eyebrow}>
                  SCHOOL UPDATE · {detail.isRead ? "READ" : "UNREAD"}
                </Text>
                <Text style={s.title}>{detail.title}</Text>
                <Text style={s.small}>
                  {new Date(detail.createdAt).toLocaleString()}
                </Text>
                <View style={s.card}>
                  <Text selectable style={s.messageBody}>
                    {detail.message}
                  </Text>
                </View>
                {!!error && (
                  <Text accessibilityRole="alert" style={s.error}>
                    {error}
                  </Text>
                )}
                {!detail.isRead && (
                  <Action
                    title={saving ? "Updating…" : "Mark as read"}
                    disabled={saving}
                    onPress={() => void read(detail.id)}
                  />
                )}
              </>
            )}
          </ScrollView>
        </SafeAreaView></SafeAreaProvider>
      </Modal>
    </>
  );
}
function Compose({ close, sent, sending }: { close: () => void; sent: () => void; sending: React.RefObject<boolean> }) {
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [selected, setSelected] = useState("");
  const [allStudents, setAllStudents] = useState(false);
  const [delivered, setDelivered] = useState<number | null>(null);
  const [offset, setOffset] = useState(0);
  const [more, setMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [success, setSuccess] = useState(false);
  const lock = sending;
  const recipientLock = useRef(false);
  async function loadRecipients() {
    if (recipientLock.current) return;
    recipientLock.current = true;
    setLoading(true);
    try {
      const rows = await api<Recipient[]>(
        `/notifications/recipients?limit=25&offset=${offset}`,
      );
      setRecipients((old) => [
        ...old,
        ...rows.filter((row) => !old.some((item) => item.id === row.id)),
      ]);
      setOffset(offset + rows.length);
      setMore(rows.length === 25);
      setStatus("");
    } catch (e) {
      setStatus(message(e));
    } finally {
      recipientLock.current = false;
      setLoading(false);
    }
  }
  useEffect(() => {
    void loadRecipients();
  }, []);
  async function send() {
    if (lock.current || (!allStudents && !selected) || !title.trim() || !body.trim()) return;
    lock.current = true;
    setBusy(true);
    setStatus("");
    try {
      const result = await api<{ delivered?: number }>("/notifications", {
        ...(allStudents ? { audience: "all_students" } : { userId: selected }),
        title: title.trim(),
        message: body.trim(),
      });
      setDelivered(allStudents ? result.delivered ?? 0 : null);
      setSuccess(true);
      sent();
    } catch (e) {
      setStatus(message(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  if (success)
    return (
      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.eyebrow}>MESSAGE DELIVERED</Text>
        <Text style={s.title}>Update sent.</Text>
        <View style={s.card}>
          <Text style={s.emptyIcon}>✓</Text>
          <Text style={s.heading}>{title.trim()}</Text>
          <Text style={s.body}>
            {delivered === null ? "Your update is now in the recipient’s school inbox." : `Your update was sent to ${delivered} students.`}
          </Text>
        </View>
        <Action title="Back to notifications" onPress={close} />
        <Action
          title="Send another update"
          onPress={() => {
            setSuccess(false);
            setTitle("");
            setBody("");
            setSelected("");
            setAllStudents(false);
            setDelivered(null);
          }}
        />
      </ScrollView>
    );
  return (
    <ScrollView
      contentContainerStyle={s.content}
      keyboardShouldPersistTaps="handled"
    >
      <Action
        title="‹  Back to notifications"
        onPress={close}
        disabled={busy}
      />
      <Text style={s.eyebrow}>STAFF ANNOUNCEMENT</Text>
      <Text style={s.title}>Send an update.</Text>
      <Text style={s.body}>
        Keep someone in the loop with a message to their school inbox.
      </Text>
      <View style={s.card}>
        <Text style={s.heading}>01 Choose a recipient</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="All students" accessibilityState={{ selected: allStudents }} disabled={busy} onPress={() => { setAllStudents(true); setSelected(""); }} style={[s.action, allStudents && s.unread]}>
          <Text style={s.link}>All students{allStudents ? " ✓" : ""}</Text>
        </Pressable>
        {!loading && !recipients.length && (
          <Text style={s.body}>
            No accounts loaded. Use the button below to try again.
          </Text>
        )}
        <ScrollView style={{ maxHeight: 220 }} nestedScrollEnabled>
          {recipients.map((person) => (
            <Pressable
              key={person.id}
              accessibilityRole="button"
              accessibilityState={{ selected: selected === person.id }}
              disabled={busy}
              onPress={() => { setSelected(person.id); setAllStudents(false); }}
              style={[s.action, selected === person.id && s.unread]}
            >
              <Text style={s.link}>
                {[person.firstName, person.lastName]
                  .filter(Boolean)
                  .join(" ") || "School account"}{" "}
                · {person.role}
                {selected === person.id ? " ✓" : ""}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
        {more && (
          <Action
            title={loading ? "Loading recipients…" : "Load more recipients"}
            onPress={() => void loadRecipients()}
            disabled={loading}
          />
        )}
      </View>
      <View style={s.card}>
        <Text style={s.heading}>02 Write your update</Text>
        <Text style={s.small}>Title · {title.length}/160</Text>
        <TextInput
          accessibilityLabel="Notification title"
          placeholder="Give your update a title"
          value={title}
          onChangeText={setTitle}
          maxLength={160}
          editable={!busy}
          style={s.input}
        />
        <Text style={s.small}>Message · {body.length}/5000</Text>
        <TextInput
          accessibilityLabel="Notification message"
          placeholder="Write your update…"
          value={body}
          onChangeText={setBody}
          maxLength={5000}
          multiline
          editable={!busy}
          style={[s.input, { minHeight: 100, textAlignVertical: "top" }]}
        />
      </View>
      {!!status && (
        <Text accessibilityRole="alert" style={s.error}>
          {status}
        </Text>
      )}
      <Text style={s.small}>
        {allStudents ? "This sends an in-app message to every student account." : "This sends an in-app message to one selected account."}
      </Text>
      <Action
        title={busy ? "Sending…" : allStudents ? "Send to all students" : "Send notification"}
        disabled={busy || (!allStudents && !selected) || !title.trim() || !body.trim()}
        onPress={() => void send()}
      />
    </ScrollView>
  );
}
const s = StyleSheet.create({
  backButton: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 8, minHeight: 48 },
  notificationRow: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: "#2d2d2d", borderRadius: 20, padding: 18, minHeight: 92 },
  notificationIcon: { width: 46, height: 46, borderRadius: 23, backgroundColor: "#7064ed", alignItems: "center", justifyContent: "center" },
  unreadDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: "#ff566a" },
  screen: { flex: 1, backgroundColor: "#272727" },
  message: { gap: 12 },
  eyebrow: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.5,
    color: "#b5b5b5",
  },
  hero: { backgroundColor: "#7064ed", padding: 22, borderRadius: 22, gap: 12 },
  heroLabel: {
    color: "#b5b5b5",
    fontSize: 10,
    letterSpacing: 2,
    fontWeight: "700",
  },
  heroTitle: { color: "#f5f5f3", fontSize: 26, fontWeight: "600" },
  heroBody: { color: "#b5b5b5", fontSize: 14, lineHeight: 22 },
  chip: {
    paddingHorizontal: 20,
    paddingVertical: 13,
    borderRadius: 24,
    backgroundColor: "#272727",
  },
  activeChip: { backgroundColor: "#7064ed" },
  white: { color: "#f5f5f3" },
  emptyIcon: { fontSize: 32, color: "#f5f5f3" },
  messageBody: { fontSize: 17, lineHeight: 28, color: "#f5f5f3" },
  content: {
    padding: 22,
    gap: 18,
    paddingBottom: 48,
    width: "100%",
    maxWidth: 700,
    alignSelf: "center",
  },
  title: { textAlign: "left", fontSize: 28, fontWeight: "700", color: "#f5f5f3" },
  heading: { fontSize: 18, fontWeight: "700", color: "#f5f5f3" },
  body: { fontSize: 15, color: "#b5b5b5", lineHeight: 23 },
  small: { fontSize: 12, color: "#b5b5b5" },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  card: {
    backgroundColor: "#272727",
    padding: 20,
    gap: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#3d3d3d",
  },
  unread: { backgroundColor: "#272727", borderColor: "#3d3d3d" },
  action: { padding: 12, borderRadius: 10, backgroundColor: "#272727" },
  link: { color: "#f5f5f3", fontWeight: "700" },
  input: {
    padding: 14,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#3d3d3d",
    color: "#f5f5f3",
    fontSize: 16,
  },
  error: { color: "#ff9b90", padding: 14, backgroundColor: "#272727" },
});
