import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, BackHandler, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { GlassIcon as Ionicons, GlassPressable as Pressable } from "./GlassIcon";
import { GlassTabBar } from "./GlassTabBar";
import { schoolRequest } from "./auth-client";
import { Profile, money } from "./src/api";
import { StudentLessons } from "./StudentLessons";
import { Availability } from "./Availability";
import { Notifications } from "./src/Notifications";
import { useNotificationUpdates } from "./src/useNotificationUpdates";
import { History, NewPayment, Detail } from "./SchoolApp";

type Props = { profile: Profile; onSignOut: () => Promise<void>; busy: boolean; error: string; onFailure: (error: unknown) => void };
type Screen = "Today" | "Lesson" | "Games" | "Profile" | "notifications" | "payments" | "new-payment" | "payment-detail" | "availability";
type Course = { id: string; name: string; price: string };
type Enrollment = { createdAt: string; courseId: string };
type Lesson = { rescheduledAt?: string | null; rescheduleRequests?: { status: string }[]; id: string; date: string; startTime: string; enrollment: { course: { name: string } }; teacher: { profile: { firstName: string | null; lastName: string | null } } };
const tabs = ["Today", "Lesson", "Games", "Profile"] as const;
const readings = [
  { title: "A little change, every day", category: "DAILY LIFE", level: "A2", time: "3 min", color: "#d9c5ff", icon: "sunny-outline" as const, text: "Every morning, Lina takes a short walk before breakfast. At first, it was difficult to wake up early. Now it is her favourite habit. She notices the quiet streets and enjoys the fresh air. This small change gives her more energy for the day.", words: [["habit", "something you do regularly"], ["notice", "to see or become aware of something"], ["energy", "the strength to be active"]] },
  { title: "The café around the corner", category: "OUT & ABOUT", level: "A2", time: "4 min", color: "#f6d5aa", icon: "cafe-outline" as const, text: "Sam discovers a cosy café in his neighbourhood. The owner welcomes him and recommends a homemade cake. While he waits, Sam starts a conversation with another customer. They both love travelling and exchange stories about their favourite places.", words: [["cosy", "comfortable and pleasant"], ["recommend", "to suggest a good choice"], ["exchange", "to give and receive"]] },
  { title: "A weekend without a screen", category: "NEW PERSPECTIVES", level: "B1", time: "5 min", color: "#b9dfcd", icon: "leaf-outline" as const, text: "Maya decides to spend the weekend offline. Without constant notifications, she feels more curious about the world around her. She explores a nearby forest and sketches the trees. By Sunday evening, she realises that taking a break can help her focus on what matters.", words: [["constant", "happening all the time"], ["explore", "to discover a place by looking around"], ["focus", "to give your attention to something"]] },
];
async function allPages<T>(path: string): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 100) {
    const page = await schoolRequest<T[]>(`${path}${path.includes("?") ? "&" : "?"}limit=100&offset=${offset}`);
    rows.push(...page);
    if (page.length < 100) return rows;
  }
}
export function StudentApp(props: Props) {
  return <SafeAreaProvider><StudentShell {...props} /></SafeAreaProvider>;
}
function StudentShell({ profile, onSignOut, busy, error, onFailure }: Props) {
  const insets = useSafeAreaInsets();
  const [screen, setScreen] = useState<Screen>("Today");
  const [paymentId, setPaymentId] = useState("");
  const [courses, setCourses] = useState<Course[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[] | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reading, setReading] = useState<number | null>(null);
  const [selectedCourse, setSelectedCourse] = useState<string | null>(null);
  const updates = useNotificationUpdates(profile.id);
  const failureRef = useRef(onFailure);
  failureRef.current = onFailure;
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      const [c, e, l] = await Promise.all([allPages<Course>("/courses"), allPages<Enrollment>("/enrollments"), allPages<Lesson>(`/lessons?status=scheduled&from=${today}`)]);
      setCourses(c); setEnrollments(e);
      setLessons(l.filter(item => new Date(`${item.date}T${item.startTime}:00`).getTime() >= now.getTime()).sort((a, b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`)).slice(0, 3));
      setLoadError("");
    } catch (e) { setLoadError(e instanceof Error ? e.message : "Unable to load your learning. Pull down to retry."); failureRef.current(e); }
    finally { setLoading(false); }
  }, [profile.id]);
  useEffect(() => { const sub = AppState.addEventListener("change", state => { if (state === "active") void load(); }); return () => sub.remove(); }, [load]);
  useEffect(() => { const sub = BackHandler.addEventListener("hardwareBackPress", () => { if (screen === "Today") return false; setScreen("Today"); return true; }); return () => sub.remove(); }, [screen]);
  useEffect(() => { if (screen === "Today") void load(); }, [screen, load]);
  const days = enrollments === null ? null : enrollments.length ? Math.max(1, Math.floor((Date.now() - Math.min(...enrollments.map(e => new Date(e.createdAt).setHours(0, 0, 0, 0)))) / 86400000) + 1) : 0;
  const openNotifications = () => { updates.dismiss(); setScreen("notifications"); };
  const activeTab = tabs.includes(screen as typeof tabs[number]) ? screen : ["payments", "new-payment", "payment-detail"].includes(screen) ? "Profile" : screen === "availability" ? "Lesson" : null;
  return <SafeAreaView edges={["top", "left", "right"]} style={s.safe}>
    <StatusBar style="light" />
    {screen !== "Profile" && <View style={s.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="Open profile" onPress={() => setScreen("Profile")} style={s.avatar}><Ionicons name="person-circle" size={44} color="#777c8b" /></Pressable>
      <View accessibilityLabel={days === null ? "Enrollment days unavailable" : `${days} days enrolled`} style={s.dayBadge}><Ionicons name="flash" size={19} color="#c8a5fa" /><Text style={s.dayText}>{days ?? "—"} {days === 1 ? "DAY" : "DAYS"}</Text></View>
      <Pressable accessibilityRole="button" accessibilityLabel="Notifications" accessibilityHint={`${updates.count} unread notifications`} onPress={openNotifications} style={s.iconButton}><Ionicons name="notifications-outline" size={24} color="#f5f3fa" />{updates.count > 0 && <View testID="notification-badge" style={s.dot}><Text style={s.dotText}>{updates.count > 99 ? "99+" : updates.count}</Text></View>}</Pressable>
    </View>}
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    <View style={{ flex: 1, paddingBottom: screen === "Today" ? 0 : 96 + insets.bottom }}>
    {screen === "Today" ? <ScrollView refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor="#d8b6ff" />} contentContainerStyle={[s.content, { paddingBottom: 112 + insets.bottom }]}>
      <Text style={s.eyebrow}>YOUR DAILY DOSE OF PROGRESS</Text><Text style={s.greeting}>Hi, {profile.firstName || "there"}<Text style={{ color: "#d8b6ff" }}>.</Text></Text><Text style={s.muted}>A little learning. A world of possibilities.</Text>
      {!!loadError && <Pressable accessibilityRole="button" onPress={load}><Text style={s.error}>{loadError} Tap to retry.</Text></Pressable>}
      <View style={s.sectionHeading}><Text style={s.heading}>Available courses</Text><Text style={s.caption}>FIND YOUR NEXT STEP</Text></View>
      {loading && !courses.length ? <ActivityIndicator color="#d8b6ff" /> : !courses.length ? <Text style={s.empty}>Your available courses will appear here.</Text> : <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingBottom: 6 }}>
        {courses.map((course, i) => <Pressable key={course.id} accessibilityRole="button" accessibilityLabel={`View ${course.name}`} onPress={() => setSelectedCourse(selectedCourse === course.id ? null : course.id)} style={[s.course, { backgroundColor: ["#d9c5f2", "#c5dfd6", "#f0d2ac"][i % 3] }]}>
          <View style={s.courseTop}><Text style={s.courseKicker}>{enrollments?.some(e => e.courseId === course.id) ? "YOUR COURSE" : "EXPLORE & GROW"}</Text><Ionicons name="arrow-up-right-box-outline" size={22} color="#252033" /></View>
          <View style={s.courseArt}><View style={s.orbit} /><Ionicons name={i % 2 ? "chatbubbles-outline" : "book-outline"} size={68} color="#39304d" /></View>
          <Text style={s.courseTitle}>{course.name}</Text><View style={s.courseTop}><Text style={s.courseMeta}>{money(course.price)} / month</Text><Ionicons name="arrow-forward" size={22} color="#252033" /></View>
          {selectedCourse === course.id && <Text style={s.courseMeta}>{enrollments?.some(e => e.courseId === course.id) ? "You’re enrolled. Open Lesson to see your schedule." : "Contact your school to enroll in this course."}</Text>}
        </Pressable>)}
      </ScrollView>}
      {enrollments?.length === 0 && <Pressable accessibilityRole="button" onPress={() => setScreen("availability")} style={s.profileRow}><View style={{ flex: 1, gap: 5 }}><Text style={s.cardTitle}>Book a trial with Sayad</Text><Text style={s.muted}>Explore available 15-minute times</Text></View><Ionicons name="chevron-forward" color="#d8b6ff" size={20} /></Pressable>}
      <View style={s.sectionHeading}><Text style={s.heading}>Upcoming lessons</Text><Pressable accessibilityRole="button" onPress={() => setScreen("Lesson")}><Text style={s.link}>See all ↗</Text></Pressable></View>
      <View style={s.lessonGroup}>{lessons.length ? lessons.map((lesson, i) => { const date = new Date(`${lesson.date}T12:00:00`); return <Pressable key={lesson.id} accessibilityRole="button" onPress={() => setScreen("Lesson")} style={[s.lesson, i > 0 && s.lessonBorder]}><View style={s.dateTile}><Text style={s.dateMonth}>{date.toLocaleDateString("en", { month: "short" }).toUpperCase()}</Text><Text style={s.dateDay}>{date.getDate()}</Text></View><View style={{ flex: 1, gap: 5 }}><Text style={s.cardTitle}>{lesson.enrollment.course.name}</Text><Text style={s.muted}>{lesson.rescheduleRequests?.[0]?.status === "pending" ? "Reschedule pending · " : lesson.rescheduledAt ? "Rescheduled · " : ""}{lesson.startTime} · {lesson.teacher.profile.firstName || "Your teacher"}</Text></View><Ionicons name="chevron-forward" size={18} color="#9998a7" /></Pressable>; }) : <Text style={s.empty}>No upcoming lessons yet. Your next bookings will appear here.</Text>}</View>
      <View style={s.sectionHeading}><Text style={s.heading}>Read & discover</Text><Text style={s.caption}>3 SAMPLE TASKS</Text></View><Text style={[s.muted, { marginTop: -10, marginBottom: 16 }]}>Small stories. New words. Bigger confidence.</Text>
      {readings.map((item, i) => <View key={item.title} style={s.readingCard}><Pressable accessibilityRole="button" accessibilityState={{ expanded: reading === i }} onPress={() => setReading(reading === i ? null : i)} style={s.readingTop}><View style={[s.readingIcon, { backgroundColor: item.color }]}><Ionicons name={item.icon} size={29} color="#30283c" /></View><View style={{ flex: 1, gap: 5 }}><Text style={s.caption}>{item.category} · {item.level}</Text><Text style={s.cardTitle}>{item.title}</Text><Text style={s.muted}>{item.time} read · 3 new words</Text></View><Ionicons name={reading === i ? "chevron-up" : "chevron-down"} size={18} color="#c9a4f6" /></Pressable>{reading === i && <Text style={s.passage}>{item.text}</Text>}<View style={s.vocabulary}>{item.words.map(([word, meaning]) => <View key={word} style={{ gap: 4 }}><Text style={s.word}>{word}</Text>{reading === i && <Text style={s.definition}>{meaning}</Text>}</View>)}</View></View>)}
    </ScrollView> : screen === "Lesson" ? <StudentLessons onFailure={onFailure} />
    : screen === "Games" ? <View style={s.placeholder}><Ionicons name="game-controller-outline" size={60} color="#d8b6ff" /><Text style={s.greeting}>Games</Text><Text style={s.muted}>Your next learning adventure is coming soon.</Text></View>
    : screen === "Profile" ? <ScrollView contentContainerStyle={s.content}><View style={s.profileHero}><Ionicons name="person-circle" size={88} color="#b4a0cf" /><Text style={s.greeting}>{profile.firstName || "Your profile"}</Text><Text style={s.muted}>Student · SSL School</Text></View><Pressable style={s.profileRow} onPress={() => setScreen("payments")}><Text style={s.cardTitle}>Payments</Text><Ionicons name="chevron-forward" color="#d8b6ff" size={20} /></Pressable><Pressable style={s.profileRow} onPress={openNotifications}><Text style={s.cardTitle}>Notifications</Text><Ionicons name="chevron-forward" color="#d8b6ff" size={20} /></Pressable><Pressable style={s.profileRow} disabled={busy} onPress={() => void onSignOut()}><Text style={s.link}>{busy ? "Signing out…" : "Sign out"}</Text></Pressable></ScrollView>
    : <View style={s.legacy}>{screen === "notifications" ? <Notifications profile={profile} onCount={updates.syncCount} /> : screen === "availability" ? <ScrollView><Availability role="student" onFailure={onFailure} /></ScrollView> : screen === "payments" ? <History profile={profile} open={id => { setPaymentId(id); setScreen("payment-detail"); }} create={() => setScreen("new-payment")} /> : <><Pressable onPress={() => setScreen("payments")} style={s.utility}><Text>‹ Back to payments</Text></Pressable>{screen === "new-payment" ? <NewPayment done={id => { setPaymentId(id); setScreen("payment-detail"); }} /> : <Detail id={paymentId} admin={false} />}</>}</View>}
    </View>
    {updates.banner && screen !== "notifications" && <View testID="floating-notification" style={[s.banner, { bottom: 108 + insets.bottom }]}><Pressable style={{ flex: 1 }} onPress={openNotifications}><Text style={s.cardTitle}>{updates.banner.title}</Text><Text numberOfLines={2} style={s.muted}>{updates.banner.message}</Text></Pressable><Pressable accessibilityLabel="Dismiss notification" onPress={updates.dismiss}><Ionicons name="close" size={24} color="white" /></Pressable></View>}
    <View pointerEvents="box-none" style={[s.navPosition, { bottom: Math.max(insets.bottom, 12) }]}><GlassTabBar activeTab={activeTab} onSelect={setScreen} /></View>
  </SafeAreaView>;
}
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#101219" }, header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 22, paddingTop: 10, paddingBottom: 15 }, avatar: { width: 46, height: 46, alignItems: "center", justifyContent: "center" }, iconButton: { width: 46, height: 46, borderRadius: 25, backgroundColor: "#252731", borderWidth: 1, borderColor: "#3c3e49", alignItems: "center", justifyContent: "center" }, dayBadge: { flexDirection: "row", gap: 8, alignItems: "center", borderRadius: 17, borderWidth: 1, borderColor: "#3c354d", paddingVertical: 11, paddingHorizontal: 17, backgroundColor: "#252131" }, dayText: { color: "#d7c5ee", fontWeight: "700", fontSize: 12, letterSpacing: 1 }, dot: { position: "absolute", right: -3, top: -3, backgroundColor: "#d8b6ff", minWidth: 18, borderRadius: 12, paddingHorizontal: 4, alignItems: "center" }, dotText: { fontSize: 10, color: "#20172c", fontWeight: "700" },
  content: { padding: 22, paddingTop: 20, paddingBottom: 24, maxWidth: 700, width: "100%", alignSelf: "center" }, eyebrow: { color: "#aaa2ba", fontSize: 10, letterSpacing: 1.8, fontWeight: "700", marginBottom: 9 }, greeting: { color: "#f7f4fc", fontSize: 32, fontWeight: "700", letterSpacing: -1, marginBottom: 8 }, muted: { color: "#a6a5b3", fontSize: 13, lineHeight: 20 }, sectionHeading: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "space-between", alignItems: "center", marginTop: 30, marginBottom: 16 }, heading: { color: "#f3eff9", fontSize: 21, fontWeight: "600", letterSpacing: -0.5 }, caption: { color: "#9992a8", fontSize: 9, letterSpacing: 1, fontWeight: "700" }, link: { color: "#ceb0ed", fontSize: 13, fontWeight: "600", paddingVertical: 8 }, error: { color: "#f4b3b3", padding: 12, lineHeight: 20 }, empty: { color: "#aaa6b6", padding: 20, lineHeight: 22 },
  course: { width: 278, borderRadius: 24, padding: 20, overflow: "hidden", gap: 10 }, courseTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }, courseKicker: { fontSize: 9, letterSpacing: 1.6, fontWeight: "800", color: "#4f405e" }, courseArt: { height: 120, alignItems: "center", justifyContent: "center" }, orbit: { position: "absolute", width: 150, height: 100, borderRadius: 60, borderWidth: 1, borderColor: "#ffffff88", transform: [{ rotate: "-25deg" }], backgroundColor: "#ffffff20" }, courseTitle: { fontSize: 26, fontWeight: "700", color: "#282033", letterSpacing: -0.8 }, courseMeta: { color: "#51445f", fontSize: 12, lineHeight: 19 },
  lessonGroup: { backgroundColor: "#1b1d26", borderRadius: 22, paddingHorizontal: 14, borderWidth: 1, borderColor: "#2c2d38" }, lesson: { flexDirection: "row", gap: 14, alignItems: "center", paddingVertical: 17 }, lessonBorder: { borderTopWidth: 1, borderColor: "#30313c" }, dateTile: { backgroundColor: "#2b2638", borderRadius: 13, width: 50, paddingVertical: 9, alignItems: "center", gap: 2 }, dateMonth: { color: "#c2a6e1", fontSize: 9, fontWeight: "700" }, dateDay: { color: "#eee5fa", fontSize: 22, fontWeight: "600" }, cardTitle: { color: "#f2eef8", fontSize: 15, fontWeight: "600", lineHeight: 21 },
  readingCard: { backgroundColor: "#1b1d26", borderRadius: 22, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: "#2b2d38" }, readingTop: { flexDirection: "row", alignItems: "center", gap: 12 }, readingIcon: { width: 52, height: 62, borderRadius: 14, alignItems: "center", justifyContent: "center" }, vocabulary: { flexDirection: "row", flexWrap: "wrap", gap: 10, borderTopWidth: 1, borderColor: "#30313c", marginTop: 16, paddingTop: 14 }, word: { color: "#cdb3ea", backgroundColor: "#2d263b", paddingVertical: 5, paddingHorizontal: 10, borderRadius: 8, fontSize: 11, alignSelf: "flex-start" }, definition: { color: "#b4adbf", fontSize: 12, maxWidth: 240, lineHeight: 18 }, passage: { color: "#d9d3e2", lineHeight: 25, fontSize: 14, paddingTop: 20 },
  legacy: { flex: 1, backgroundColor: "#f6f7f2" }, utility: { padding: 18 }, placeholder: { flex: 1, justifyContent: "center", alignItems: "center", gap: 16, padding: 24 }, profileHero: { alignItems: "center", gap: 8, marginVertical: 30 }, profileRow: { flexDirection: "row", justifyContent: "space-between", padding: 20, backgroundColor: "#20212b", borderRadius: 16, marginBottom: 12 }, banner: { position: "absolute", left: 20, right: 20, padding: 18, borderRadius: 18, backgroundColor: "#30283f", flexDirection: "row", gap: 12 },
  navPosition: { position: "absolute", left: 18, right: 18, alignItems: "center" },
});





