import { SwipeBack } from "./SwipeBack";
import { BackIcon } from "./CourseIcon";
import { SchoolIcon } from "./SchoolIcon";
import { studentContentWidth } from "./student-layout";
import { LessonBadge } from "./StatusBadge";

import { phoneSchema } from "../src/shared/phone";

import React, { useCallback, useEffect, useRef, useState } from "react";

import {
  ActivityIndicator,
  AppState,
  BackHandler,
  Image,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  SafeAreaProvider,
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import { StatusBar } from "expo-status-bar";

import {
  GlassIcon as Ionicons,
  GlassPressable as Pressable,
} from "./GlassIcon";

import { GlassTabBar } from "./GlassTabBar";

import { schoolRequest, SessionExpiredError } from "./auth-client";

import { Profile, money } from "./src/api";

import { Performance } from "./Performance";

import { StudentLessons } from "./StudentLessons";

import { Availability } from "./Availability";
import { StudentCourse, type Course } from "./StudentCourse";
import { courseDetails } from "./course-details";
import { courseCatalog, coursePosition } from "../src/shared/course-catalog";

import { Notifications } from "./src/Notifications";
import { BrowserNotificationSettings } from "./src/BrowserNotificationSettings";

import { useNotificationUpdates } from "./src/useNotificationUpdates";
import { enableDevicePush, listenForPush } from "./src/devicePush";

import { History, NewPayment, Detail } from "./SchoolApp";

const courseCardImages = [
  require("./assets/courses/upgrade-your-level.png"),
  require("./assets/courses/english-in-context.png"),
  require("./assets/courses/all-in-one-english.png"),
  require("./assets/courses/lean-leader.png"),
  require("./assets/courses/academic-exam-prep.png"),
];

const courseCardColorOverrides: Partial<Record<number, string>> = {
  2: "#b4d8ff",
  4: "#ffde59",
};

type Props = {
  profile: Profile;
  onSignOut: () => Promise<void>;
  busy: boolean;
  error: string;
  onFailure: (error: unknown) => void;
};

type Screen =
  | "settings"
  | "account-settings"
  | "Today"
  | "Lesson"
  | "Profile"
  | "notifications"
  | "payments"
  | "new-payment"
  | "payment-detail"
  | "availability"
  | "course-detail";

type Enrollment = { createdAt: string; courseId: string };
const trialPageHash = "#/trial-lessons";
const isTrialPage = () => Platform.OS === "web" && window.location.hash === trialPageHash;

type Lesson = {
  status: string;
  rescheduledAt?: string | null;
  rescheduleRequests?: { status: string }[];
  id: string;
  date: string;
  startTime: string;
  enrollment: { course: { name: string } };
  teacher: { profile: { firstName: string | null; lastName: string | null } };
};

const tabs = ["Today", "Lesson", "Profile"] as const;

async function allPages<T>(path: string): Promise<T[]> {
  const rows: T[] = [];

  for (let offset = 0; ; offset += 100) {
    const page = await schoolRequest<T[]>(
      `${path}${path.includes("?") ? "&" : "?"}limit=100&offset=${offset}`,
    );

    rows.push(...page);

    if (page.length < 100) return rows;
  }
}

export function StudentApp(props: Props) {
  return (
    <SafeAreaProvider>
      <StudentShell {...props} />
    </SafeAreaProvider>
  );
}

function StudentShell({
  profile: initialProfile,
  onSignOut,
  busy,
  error,
  onFailure,
}: Props) {
  const insets = useSafeAreaInsets();

  const [screen, updateScreen] = useState<Screen>(() => isTrialPage() ? "availability" : "Today");
  const setScreen = useCallback((next: Screen) => {
    if (next !== "availability" && isTrialPage()) {
      const url = new URL(window.location.href);
      url.hash = "";
      window.history.replaceState(window.history.state, "", url);
    }
    updateScreen(next);
  }, []);

  const [profile, setProfile] = useState(initialProfile);

  const [firstName, setFirstName] = useState(profile.firstName || "");

  const [lastName, setLastName] = useState(profile.lastName || "");

  const [email, setEmail] = useState(profile.email || "");

  const [phone, setPhone] = useState(profile.phone || "");

  const [phoneBusy, setPhoneBusy] = useState(false);

  const [phoneNotice, setPhoneNotice] = useState("");

  const [phoneError, setPhoneError] = useState("");

  const savePhone = async () => {
    if (
      !firstName.trim() ||
      !lastName.trim() ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    ) {
      setPhoneError("Enter your name, surname and a valid email address.");
      return;
    }

    const parsed = phoneSchema.safeParse(phone);

    if (!parsed.success) {
      setPhoneError("Include your country code, e.g. +994501234567.");
      return;
    }

    if (phoneBusy) return;

    setPhoneBusy(true);
    setPhoneError("");
    setPhoneNotice("");

    try {
      const saved = await schoolRequest<Profile>("/me", "PATCH", {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        phone: parsed.data,
      });
      setProfile(saved);
      setPhone(saved.phone || "");
      setEmail(saved.email || "");
      setPhoneNotice("Account settings saved.");
    } catch (e) {
      setPhoneError(
        e instanceof Error ? e.message : "Unable to save account settings.",
      );
    } finally {
      setPhoneBusy(false);
    }
  };

  const [paymentId, setPaymentId] = useState("");

  const [courses, setCourses] = useState<Course[]>([]);

  const [enrollments, setEnrollments] = useState<Enrollment[] | null>(null);

  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [lessonCount, setLessonCount] = useState<number | null>(null);

  const [loading, setLoading] = useState(true);
  const loadingToday = useRef(false);
  const lastTodayLoad = useRef(0);

  const [loadError, setLoadError] = useState("");


  const [selectedCourse, setSelectedCourse] = useState<string | null>(null);
  const [customLessonCount, setCustomLessonCount] = useState(1);
  const [trialFromCourse, setTrialFromCourse] = useState(false);
  const currentCourse = courses.find((course) => course.id === selectedCourse);
  const canBookTrial = enrollments?.length === 0;
  const openTrial = (fromCourse: boolean) => {
    if (Platform.OS === "web") {
      const url = new URL(window.location.href);
      url.hash = trialPageHash;
      window.history.replaceState(window.history.state, "", url);
    }
    setTrialFromCourse(fromCourse);
    setScreen("availability");
  };

  const updates = useNotificationUpdates(profile.id);

  const failureRef = useRef(onFailure);

  failureRef.current = onFailure;

  const load = useCallback(async (showRefresh = true) => {
    if (loadingToday.current) return;
    loadingToday.current = true;
    setLoading(showRefresh || lastTodayLoad.current === 0);
    setLoadError("");

    try {
      const now = new Date();

      const [c, e, l] = await Promise.all([
        allPages<Course>("/courses"),
        allPages<Enrollment>("/enrollments"),
        allPages<Lesson>("/lessons?status=scheduled"),
      ]);

      setCourses(
        c.filter((course) => coursePosition(course.name) < courseCatalog.length)
          .sort((a, b) => coursePosition(a.name) - coursePosition(b.name)),
      );
      lastTodayLoad.current = Date.now();
      setEnrollments(e);
      setLessonCount(l.length);

      setLessons(
        l
          .filter(
            (item) =>
              new Date(`${item.date}T${item.startTime}:00+04:00`).getTime() >=
              now.getTime(),
          )
          .sort((a, b) =>
            `${a.date} ${a.startTime}`.localeCompare(
              `${b.date} ${b.startTime}`,
            ),
          ),
      );

    } catch (e) {
      setLoadError(
        e instanceof Error
          ? e.message
          : "Unable to load your learning. Pull down to retry.",
      );
      if (e instanceof SessionExpiredError) failureRef.current(e);
    } finally {
      loadingToday.current = false;
      setLoading(false);
    }
  }, [profile.id]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && screen === "Today") void load();
    });
    return () => sub.remove();
  }, [load, screen]);

  const parentScreen: Screen =
    screen === "account-settings" || screen === "payments"
      ? "settings"
      : screen === "new-payment" || screen === "payment-detail"
        ? "payments"
        : screen === "settings"
          ? "Profile"
          : screen === "availability" && trialFromCourse && currentCourse
            ? "course-detail"
            : "Today";

  const goBack = useCallback(() => setScreen(parentScreen), [parentScreen, setScreen]);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (screen === "Today") return false;
      goBack();
      return true;
    });
    return () => sub.remove();
  }, [screen, goBack]);

  useEffect(() => {
    if (screen === "Today" && Date.now() - lastTodayLoad.current > 30_000) void load(false);
  }, [screen, load]);

  const openingToday = enrollments === null && loading;

  const openNotifications = () => {
    updates.dismiss();
    setScreen("notifications");
  };
  useEffect(
    () => listenForPush(profile.id, () => setScreen("notifications")),
    [profile.id, setScreen],
  );
  useEffect(() => {
    const register = () => { void enableDevicePush(false).catch(() => {}); };
    register();
    const subscription = AppState.addEventListener("change", state => {
      if (state === "active") register();
    });
    return () => subscription.remove();
  }, [profile.id]);

  const activeTab = screen === "course-detail" || (screen === "availability" && trialFromCourse)
    ? "Today"
    : tabs.includes(screen as (typeof tabs)[number])
      ? screen
    : [
          "settings",
          "account-settings",
          "payments",
          "new-payment",
          "payment-detail",
        ].includes(screen)
      ? "Profile"
      : screen === "availability"
        ? "Lesson"
        : null;

  const fullName =
    [profile.firstName, profile.lastName].filter(Boolean).join(" ") ||
    "Your profile";

  const sectionTitle =
    screen === "settings"
      ? "Settings"
      : screen === "account-settings"
        ? "Account settings"
        : screen === "payments"
          ? "Billing & subscriptions"
          : screen === "new-payment"
            ? "New payment"
            : screen === "payment-detail"
              ? "Payment details"
              : screen === "course-detail"
                ? "Course details"
                : screen === "availability"
                  ? "Free trial"
                  : null;

  const backLabel = parentScreen === "course-detail" ? "course details"
    : parentScreen === "Today" ? "Today"
      : parentScreen === "Profile" ? "profile"
        : parentScreen === "settings" ? "settings" : "billing";

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={s.safe}>
      <SwipeBack enabled={screen !== "Today"} onBack={goBack} screenKey={screen}>
      <StatusBar style="light" />

      {screen === "Profile" ? (
        <View style={s.header}>
          <View style={{ flex: 1, paddingRight: 16 }}>
            <Text style={s.profileName}>{fullName}</Text>
            <Text style={s.muted}>Student · SSL School</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Settings"
            onPress={() => setScreen("settings")}
            style={s.iconButton}
          >
            <SchoolIcon name="settings" size={28} />
          </Pressable>
        </View>
      ) : sectionTitle ? (
        <View style={s.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Back to ${backLabel}`}
            onPress={goBack}
            style={s.iconButton}
          >
            <Ionicons name="chevron-back" size={24} color="#f5f3fa" />
          </Pressable>
          <Text
            style={[
              s.heading,
              { flex: 1, textAlign: "left", fontSize: 28, marginLeft: 12 },
            ]}
          >
            {sectionTitle}
          </Text>
          {screen === "settings" && (
            <View style={s.iconButton}>
              <SchoolIcon name="settings" selected size={28} />
            </View>
          )}
        </View>
      ) : (
        <View style={s.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open profile"
            onPress={() => setScreen("Profile")}
            style={s.avatar}
          >
            <SchoolIcon name="profile-gray" size={44} />
          </Pressable>

          <View
            accessibilityLabel={
              lessonCount === null
                ? "Lesson count unavailable"
                : `${lessonCount} scheduled ${lessonCount === 1 ? "lesson" : "lessons"} remaining`
            }
            style={s.dayBadge}
          >
            <Ionicons name="flash" size={19} color="#a49dff" />
            <Text style={s.dayText}>
              {lessonCount ?? "—"} {lessonCount === 1 ? "LESSON" : "LESSONS"}
            </Text>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Notifications"
            accessibilityHint={`${updates.count} unread notifications`}
            onPress={openNotifications}
            style={s.iconButton}
          >
            <SchoolIcon name="notification" selected={screen === "notifications"} size={28} />
            {updates.count > 0 && (
              <View testID="notification-badge" style={s.dot}>
                <Text style={s.dotText}>
                  {updates.count > 99 ? "99+" : updates.count}
                </Text>
              </View>
            )}
          </Pressable>
        </View>
      )}

      {!!error && (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      )}

      <View
        style={{
          flex: 1,
          paddingBottom: screen === "Today" || screen === "availability" ? 0 : 96 + insets.bottom,
        }}
      >
        {screen === "Today" ? (
          <ScrollView
            refreshControl={
              <RefreshControl
                refreshing={loading && !openingToday}
                onRefresh={load}
                tintColor="#a49dff"
              />
            }
            contentContainerStyle={[
              s.content,
              { paddingBottom: 112 + insets.bottom },
            ]}
          >
            <Text style={s.greeting}>
              Hi, {profile.firstName || "there"}
              <Text style={{ color: "#a49dff" }}>.</Text>
            </Text>
            {openingToday && (
              <View style={s.loadingToday} accessibilityRole="progressbar" accessibilityLabel="Loading courses and lessons" accessibilityState={{ busy: true }}>
                <ActivityIndicator color="#a49dff" />
                <Text style={s.muted}>Loading courses and lessons…</Text>
              </View>
            )}

            {!!loadError && (
              <Pressable accessibilityRole="button" onPress={() => void load()}>
                <Text style={s.error}>{loadError} Tap to retry.</Text>
              </Pressable>
            )}

            <View style={s.sectionHeading}>
              <Text style={s.heading}>Available courses</Text>
            </View>

            {enrollments === null ? null : !courses.length ? (
              <Text style={s.empty}>
                Your available courses will appear here.
              </Text>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 14, paddingBottom: 6 }}
              >
                {courses.map((course) => {
                  const details = courseDetails(course.name);
                  const position = coursePosition(course.name);
                  const accent = courseCardColorOverrides[position] ?? details?.accent ?? "#bdb7ff";
                  return (
                    <Pressable
                      key={course.id}
                      accessibilityRole="button"
                      accessibilityLabel={`View ${course.name}`}
                      onPress={() => {
                        setSelectedCourse(course.id);
                        setCustomLessonCount(1);
                        setScreen("course-detail");
                      }}
                      style={s.course}
                    >
                      <View style={[s.courseArtwork, { backgroundColor: accent }]}>
                        <Image
                          accessible={false}
                          source={courseCardImages[position]}
                          resizeMode="contain"
                          style={s.courseArt}
                        />
                      </View>

                      <View style={s.courseFooter}>
                        <View style={s.courseCopy}>
                          <Text style={s.courseTitle}>{course.name}</Text>
                          <Text style={s.courseMeta}>
                            {details?.custom ? "Fərdi dərs paketi" : details?.price ?? `${money(course.price)} / month`}
                          </Text>
                        </View>
                        <View style={s.courseAction}>
                          <Text style={s.courseActionText}>View</Text>
                        </View>
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}

            {canBookTrial && (
              <Pressable
                accessibilityRole="button"
                onPress={() => openTrial(false)}
                style={s.profileRow}
              >
                <View style={{ flex: 1, gap: 5 }}>
                  <Text style={s.cardTitle}>Book a free trial with Sayad</Text>
                  <Text style={s.muted}>Explore available 15-minute times</Text>
                </View>
                <Ionicons name="chevron-forward" color="#a49dff" size={20} />
              </Pressable>
            )}

            <View style={s.sectionHeading}>
              <Text style={s.heading}>Upcoming lessons</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => setScreen("Lesson")}
              >
                <Text style={s.link}>See all ↗</Text>
              </Pressable>
            </View>

            <View style={s.lessonGroup}>
              {lessons.length ? (
                lessons.slice(0, 3).map((lesson, i) => {
                  const date = new Date(`${lesson.date}T12:00:00`);
                  return (
                    <Pressable
                      key={lesson.id}
                      accessibilityRole="button"
                      onPress={() => setScreen("Lesson")}
                      style={[s.lesson, i > 0 && s.lessonBorder]}
                    >
                      <View style={s.dateTile}>
                        <Text style={s.dateMonth}>
                          {date
                            .toLocaleDateString("en", { month: "short" })
                            .toUpperCase()}
                        </Text>
                        <Text style={s.dateDay}>{date.getDate()}</Text>
                      </View>
                      <View style={{ flex: 1, gap: 5 }}>
                        <Text style={s.cardTitle}>
                          {lesson.enrollment.course.name}
                        </Text>
                        <LessonBadge lesson={lesson} />
                        <Text style={s.muted}>
                          {lesson.rescheduleRequests?.[0]?.status === "pending"
                            ? "Reschedule pending · "
                            : lesson.rescheduledAt
                              ? "Rescheduled · "
                              : ""}
                          {lesson.startTime} ·{" "}
                          {lesson.teacher.profile.firstName || "Your teacher"}
                        </Text>
                      </View>
                      <Ionicons
                        name="chevron-forward"
                        size={18}
                        color="#9998a7"
                      />
                    </Pressable>
                  );
                })
              ) : enrollments !== null && (
                <Text style={s.empty}>
                  No upcoming lessons yet. Your next bookings will appear here.
                </Text>
              )}
            </View>
          </ScrollView>
        ) : screen === "Lesson" ? (
          <StudentLessons onFailure={onFailure} onLessonCountChange={setLessonCount} />
        ) : screen === "Profile" ? (
          <Performance
            profile={profile}
            onFailure={onFailure}
            onExplore={() => setScreen("Today")}
          />
        ) : screen === "settings" ? (
          <ScrollView contentContainerStyle={[s.content, { flexGrow: 1 }]}>
            <BrowserNotificationSettings userId={profile.id} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Account settings"
              style={s.profileRow}
              onPress={() => setScreen("account-settings")}
            >
              <Text style={s.cardTitle}>Account settings</Text>
              <Ionicons name="chevron-forward" color="#a49dff" size={20} />
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Billing & subscriptions"
              style={s.profileRow}
              onPress={() => setScreen("payments")}
            >
              <Text style={s.cardTitle}>Billing & subscriptions</Text>
              <Ionicons name="chevron-forward" color="#a49dff" size={20} />
            </Pressable>

            <View style={{ flex: 1, minHeight: 100 }} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Sign out"
              disabled={busy}
              onPress={() => void onSignOut()}
              style={{
                backgroundColor: "#fff",
                borderRadius: 32,
                padding: 18,
                marginTop: 32,
                alignItems: "center",
                opacity: busy ? 0.5 : 1,
              }}
            >
              <Text
                style={{ color: "#191919", fontSize: 17, fontWeight: "700" }}
              >
                {busy ? "Signing out..." : "Sign out"}
              </Text>
            </Pressable>
          </ScrollView>
        ) : screen === "account-settings" ? (
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={s.content}
          >
            <View style={s.accountCard}>
              {[
                { label: "Name", value: firstName, change: setFirstName },
                { label: "Surname", value: lastName, change: setLastName },
                { label: "Gmail", value: email, change: setEmail },
              ].map((field) => (
                <View key={field.label} style={{ marginBottom: 20 }}>
                  <Text style={s.caption}>{field.label.toUpperCase()}</Text>
                  <TextInput
                    accessibilityLabel={field.label}
                    value={field.value}
                    onChangeText={(value) => {
                      field.change(value);
                      setPhoneNotice("");
                      setPhoneError("");
                    }}
                    keyboardType={
                      field.label === "Gmail" ? "email-address" : "default"
                    }
                    autoCapitalize={field.label === "Gmail" ? "none" : "words"}
                    autoCorrect={false}
                    editable={!phoneBusy}
                    maxLength={field.label === "Gmail" ? 254 : 160}
                    style={{
                      color: "#f7f4fc",
                      backgroundColor: "#191919",
                      borderRadius: 12,
                      padding: 14,
                      marginTop: 10,
                      minHeight: 48,
                    }}
                  />
                </View>
              ))}
              <Text style={[s.caption, { marginTop: 24 }]}>PHONE NUMBER</Text>
              <TextInput
                accessibilityLabel="Phone number"
                value={phone}
                onChangeText={(value) => {
                  setPhone(value);
                  setPhoneNotice("");
                  setPhoneError("");
                }}
                keyboardType="phone-pad"
                autoComplete="tel"
                placeholder="+994 50 123 45 67"
                placeholderTextColor="#9992a8"
                editable={!phoneBusy}
                maxLength={32}
                style={{
                  color: "#f7f4fc",
                  backgroundColor: "#272727",
                  borderRadius: 12,
                  padding: 14,
                  marginTop: 10,
                  minHeight: 48,
                }}
              />
            </View>

            <Text style={[s.muted, { marginBottom: 16 }]}>
              Include your country code so your school can reach you.
            </Text>
            {!!phoneError && (
              <Text accessibilityRole="alert" style={s.error}>
                {phoneError}
              </Text>
            )}
            {!!phoneNotice && (
              <Text
                accessibilityLiveRegion="polite"
                style={[s.link, { marginBottom: 12 }]}
              >
                {phoneNotice}
              </Text>
            )}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Save account settings"
              disabled={phoneBusy}
              onPress={() => void savePhone()}
              style={[s.saveButton, phoneBusy && { opacity: 0.5 }]}
            >
              <Ionicons name="checkmark-outline" size={20} color="#201a35" />
              <Text style={s.saveText}>
                {phoneBusy ? "Saving…" : "Save changes"}
              </Text>
            </Pressable>
          </ScrollView>
        ) : screen === "course-detail" ? (
          currentCourse ? (
            <StudentCourse
              key={currentCourse.id}
              course={currentCourse}
              count={customLessonCount}
              onCountChange={setCustomLessonCount}
              enrolled={enrollments?.some((entry) => entry.courseId === currentCourse.id) ?? false}
              onTrial={() => openTrial(true)}
            />
          ) : <Text style={s.empty}>This course is no longer available.</Text>
        ) : (
          <View style={s.legacy}>
            {screen === "notifications" ? (
              <Notifications profile={profile} onCount={updates.syncCount} />
            ) : screen === "availability" ? (
              <ScrollView contentContainerStyle={s.calendarPage}>
                <Availability role="student" onFailure={onFailure} />
              </ScrollView>
            ) : screen === "payments" ? (
              <History
                profile={profile}
                open={(id) => {
                  setPaymentId(id);
                  setScreen("payment-detail");
                }}
                create={() => setScreen("new-payment")}
              />
            ) : screen === "new-payment" ? (
              <NewPayment
                done={(id) => {
                  setPaymentId(id);
                  setScreen("payment-detail");
                }}
              />
            ) : (
              <>
                <Pressable
                  onPress={() => setScreen("payments")}
                  style={s.utility}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><BackIcon /><Text style={{ color: "#a49dff" }}>Back to payments</Text></View>
                </Pressable>
                <Detail id={paymentId} admin={false} />
              </>
            )}
          </View>
        )}
      </View>

      {updates.banner && screen !== "notifications" && (
        <View
          testID="floating-notification"
          pointerEvents="box-none"
          style={{ position: "absolute", top: 12 + insets.top, width: "100%", maxWidth: studentContentWidth, alignSelf: "center", paddingHorizontal: 22, zIndex: 30 }}
        >
        <View style={s.banner}
        >
          <Pressable accessibilityRole="button" accessibilityLabel="Open notification inbox" onPress={() => { updates.dismiss(); setScreen("notifications"); }} style={{ flex: 1 }}>
            <Text style={[s.cardTitle, { color: "white" }]}>{updates.banner.title}</Text>
            <Text numberOfLines={3} style={[s.muted, { color: "#eee8f7" }]}>
              {updates.banner.message}
            </Text>
          </Pressable>
          <Pressable
            accessibilityLabel="Dismiss notification"
            accessibilityRole="button"
            onPress={updates.dismiss}
          >
            <Ionicons name="close" size={24} color="white" />
          </Pressable>
        </View>
        </View>
      )}

      {screen !== "availability" && <View
        pointerEvents="box-none"
        style={[s.navPosition, { bottom: Math.max(insets.bottom, 12) }]}
      >
        <GlassTabBar activeTab={activeTab} onSelect={setScreen} />
      </View>}
      </SwipeBack>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  calendarPage: { width: "100%", maxWidth: 1500, alignSelf: "center", paddingHorizontal: 16, paddingBottom: 24 },
  saveButton: {
    minHeight: 52,
    borderRadius: 18,
    backgroundColor: "#8178ff",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  saveText: { color: "#201a35", fontSize: 16, fontWeight: "700" },
  safe: { flex: 1, backgroundColor: "#191919" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    maxWidth: studentContentWidth,
    alignSelf: "center",
    paddingHorizontal: 22,
    paddingTop: 10,
    paddingBottom: 15,
  },
  avatar: {
    width: 46,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
  },
  iconButton: {
    width: 46,
    height: 46,
    borderRadius: 25,
    backgroundColor: "#272727",
    borderWidth: 1,
    borderColor: "#393939",
    alignItems: "center",
    justifyContent: "center",
  },
  dayBadge: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "#3c354d",
    paddingVertical: 11,
    paddingHorizontal: 17,
    backgroundColor: "#252131",
  },
  dayText: {
    color: "#d7c5ee",
    fontWeight: "700",
    fontSize: 12,
    letterSpacing: 1,
  },
  dot: {
    position: "absolute",
    right: -3,
    top: -3,
    backgroundColor: "#8178ff",
    minWidth: 18,
    borderRadius: 12,
    paddingHorizontal: 4,
    alignItems: "center",
  },
  dotText: { fontSize: 10, color: "#20172c", fontWeight: "700" },

  content: {
    padding: 22,
    paddingTop: 20,
    paddingBottom: 24,
    maxWidth: studentContentWidth,
    width: "100%",
    alignSelf: "center",
  },
  eyebrow: {
    color: "#aaa2ba",
    fontSize: 10,
    letterSpacing: 1.8,
    fontWeight: "700",
    marginBottom: 9,
  },
  greeting: {
    color: "#f7f4fc",
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: -0.8,
    marginBottom: 8,
  },
  muted: { color: "#a6a5b3", fontSize: 13, lineHeight: 20 },
  sectionHeading: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 30,
    marginBottom: 16,
  },
  heading: {
    color: "#f3eff9",
    fontSize: 21,
    fontWeight: "600",
    letterSpacing: -0.5,
  },
  caption: {
    color: "#9992a8",
    fontSize: 9,
    letterSpacing: 1,
    fontWeight: "700",
  },
  link: {
    color: "#a49dff",
    fontSize: 13,
    fontWeight: "600",
    paddingVertical: 8,
  },
  error: { color: "#f4b3b3", padding: 12, lineHeight: 20 },
  empty: { color: "#aaa6b6", padding: 20, lineHeight: 22 },

  course: {
    width: 278,
    borderRadius: 24,
    overflow: "hidden",
    backgroundColor: "#252525",
  },
  courseArtwork: { aspectRatio: 4 / 5 },
  courseArt: {
    width: "100%",
    height: "100%",
  },
  courseFooter: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  courseCopy: { flex: 1, gap: 3 },
  courseAction: {
    minHeight: 36,
    minWidth: 64,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f5f3fa",
  },
  courseActionText: {
    color: "#252033",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
    textAlign: "center",
    includeFontPadding: false,
  },
  courseTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "600",
    color: "#fff",
    includeFontPadding: false,
  },
  courseMeta: { color: "#e4ddec", fontSize: 12, lineHeight: 17 },

  lessonGroup: {
    backgroundColor: "#272727",
    borderRadius: 22,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#393939",
  },
  lesson: {
    flexDirection: "row",
    gap: 14,
    alignItems: "center",
    paddingVertical: 17,
  },
  lessonBorder: { borderTopWidth: 1, borderColor: "#393939" },
  dateTile: {
    backgroundColor: "#2b2638",
    borderRadius: 13,
    width: 50,
    paddingVertical: 9,
    alignItems: "center",
    gap: 2,
  },
  dateMonth: { color: "#c2a6e1", fontSize: 9, fontWeight: "700" },
  dateDay: { color: "#eee5fa", fontSize: 22, fontWeight: "600" },
  cardTitle: {
    color: "#f2eef8",
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 21,
  },

  accountCard: {
    backgroundColor: "#272727",
    borderRadius: 22,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#393939",
  },
  legacy: { flex: 1, backgroundColor: "#191919" },
  utility: { padding: 18 },
  loadingToday: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 16,
  },
  profileTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 12,
    marginBottom: 26,
  },
  identityCard: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#272727",
    borderRadius: 20,
    padding: 16,
    minHeight: 108,
  },
  profileName: {
    color: "#f7f4fc",
    fontSize: 20,
    fontWeight: "600",
    lineHeight: 27,
  },
  profilePhoto: { width: 62, height: 62, borderRadius: 31 },
  profileRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    backgroundColor: "#272727",
    borderRadius: 16,
    marginBottom: 12,
  },
  banner: {
    padding: 18,
    borderRadius: 18,
    backgroundColor: "#30283f",
    flexDirection: "row",
    gap: 12,
  },

  navPosition: {
    position: "absolute",
    left: 18,
    right: 18,
    alignItems: "center",
  },
});
