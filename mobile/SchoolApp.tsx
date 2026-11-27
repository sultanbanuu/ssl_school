import MascotLoader, { ScreenFade } from "./MascotLoader";
import { BackIcon } from "./CourseIcon";
import { studentContentWidth } from "./student-layout";
import { StatusBadge } from "./StatusBadge";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AppState,
  BackHandler,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as ImagePicker from "expo-image-picker";
import { File } from "expo-file-system";
import {
  api,
  ApiError,
  Course,
  money,
  Payment,
  Profile,
  Upload,
} from "./src/api";

import { Performance } from "./Performance";
import { Lessons } from "./Lessons";
import { Availability } from "./Availability";
import { Notifications } from "./src/Notifications";
import { AuditHistory } from "./src/AuditHistory";
import { useNotificationUpdates } from "./src/useNotificationUpdates";
import { enableDevicePush, listenForPush } from "./src/devicePush";
import { RescheduleReview } from "./RescheduleReview";

type Route =
  | { name: "audit" }
  | { name: "performance" }
  | { name: "availability" }
  | { name: "lessons" }
  | { name: "notifications" }
  | { name: "history" }
  | { name: "new" }
  | { name: "detail"; id: string };
const errorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
const date = (value: string | null) =>
  value
    ? new Date(
        value.length === 10 ? `${value}T12:00:00` : value,
      ).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "—";
function Button({
  title,
  onPress,
  disabled,
  secondary = false,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        secondary && s.secondary,
        (disabled || pressed) && { opacity: 0.5 },
      ]}
    >
      <Text style={[s.buttonText, secondary && { color: "#f5f5f3" }]}>
        {title}
      </Text>
    </Pressable>
  );
}
function Field({
  label,
  ...props
}: React.ComponentProps<typeof TextInput> & { label: string }) {
  return (
    <View style={s.gap}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor="#929b96"
        {...props}
        style={[s.input, props.style]}
      />
    </View>
  );
}
function Badge({ status }: { status: Payment["status"] }) {
  return <StatusBadge label={status === "pending" ? "Awaiting review" : status === "approved" ? "Approved" : "Cancelled"} tone={status === "pending" ? "yellow" : status === "approved" ? "green" : "coral"} />;
}
function Notice({ text }: { text: string }) {
  return text ? (
    <Text accessibilityRole="alert" style={s.notice}>
      {text}
    </Text>
  ) : null;
}

function StaffNavButton({ label, selected, count, onPress }: {
  label: string;
  selected: boolean;
  count?: number;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={count === undefined ? undefined : `${count} unread notifications`}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [s.navButton, selected && s.navActive, pressed && { opacity: 0.6 }]}
    >
      <Text style={s.navText}>{label}</Text>
      {!!count && (
        <View testID="notification-badge" style={s.notificationBadge}>
          <Text style={s.notificationBadgeText}>{count > 99 ? "99+" : count}</Text>
        </View>
      )}
    </Pressable>
  );
}

export function StaffSchoolApp({
  profile,
  onSignOut,
  busy: signingOut,
  error,
  onFailure,
}: {
  profile: Profile;
  onSignOut: () => Promise<void>;
  busy: boolean;
  error: string;
  onFailure: (error: unknown) => void;
}) {
  const notificationUpdates = useNotificationUpdates(profile?.id);
  const [route, setRoute] = useState<Route>({ name: "lessons" });
  const [revision, setRevision] = useState(0);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [focusedRequest, setFocusedRequest] = useState<string | null>(null);
  const lessonScroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const canReviewRequests = profile.role === "admin" || profile.role === "teacher";
  const reviewRequest = (id: string) => {
    setFocusedRequest(id);
    setReviewOpen(true);
    requestAnimationFrame(() => lessonScroll.current?.scrollTo({ y: 0, animated: true }));
  };
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (route.name === "history" || route.name === "lessons") return false;
      setRoute({ name: "lessons" });
      return true;
    });
    return () => sub.remove();
  }, [route]);
  const goHome = () => {
    setRevision((v) => v + 1);
    setRoute({ name: "history" });
  };
  return (
    <SafeAreaProvider>
      <SafeAreaView style={s.safe}>
        <StatusBar style="dark" />
        <KeyboardAvoidingView
          style={s.flex}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={s.header}>
            <Image
              source={require("./assets/brand/logo.png")}
              style={s.logo}
              accessibilityLabel="SSL School"
              accessible
            />
            <ScrollView horizontal style={s.navScroll} contentContainerStyle={s.navLinks} keyboardShouldPersistTaps="handled">
              <StaffNavButton label="Lessons" selected={route.name === "lessons"} onPress={() => setRoute({ name: "lessons" })} />
              <StaffNavButton label="Teacher Availability" selected={route.name === "availability"} onPress={() => setRoute({ name: "availability" })} />
              {profile.role === "admin" && (
                <StaffNavButton label="Payments" selected={["history", "new", "detail"].includes(route.name)} onPress={goHome} />
              )}
              <StaffNavButton label="Analytics / Performance" selected={route.name === "performance"} onPress={() => setRoute({ name: "performance" })} />
              {profile.role === "admin" && (
                <StaffNavButton label="Audit history" selected={route.name === "audit"} onPress={() => setRoute({ name: "audit" })} />
              )}
              <StaffNavButton
                label="Notifications"
                selected={route.name === "notifications"}
                count={notificationUpdates.count}
                onPress={() => {
                  notificationUpdates.dismiss();
                  setRoute({ name: "notifications" });
                }}
              />
            </ScrollView>
            <Pressable
              accessibilityRole="button"
              disabled={signingOut}
              onPress={() => void onSignOut()}
              style={({ pressed }) => [s.navButton, s.signOut, (pressed || signingOut) && { opacity: 0.6 }]}
            >
              <Text style={s.navText}>{signingOut ? "Signing out…" : "Sign out"}</Text>
            </Pressable>
          </View>
          <Notice text={error} />
          <ScreenFade key={route.name + ("id" in route ? `:${route.id}` : "")} style={{ flex: 1 }}>
          {route.name === "audit" ? (profile.role === "admin" ? <AuditHistory /> : <Notice text="Admin access required." />) : route.name === "performance" ? <Performance profile={profile} onFailure={onFailure} /> : route.name === "availability" ? (
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={[
                s.content,
                { maxWidth: 1500, paddingHorizontal: 16 },
              ]}
            >
              <Availability role={profile.role} onFailure={onFailure} />
            </ScrollView>
          ) : route.name === "lessons" ? (
            <ScrollView
              ref={lessonScroll}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={[
                s.content,
                Platform.OS === "web" &&
                  profile.role !== "student" && { maxWidth: 1500 },
              ]}
            >
              {canReviewRequests && <RescheduleReview
                admin={profile.role === "admin"}
                open={reviewOpen}
                focusedRequest={focusedRequest}
                onToggle={() => {
                  setFocusedRequest(null);
                  setReviewOpen(!reviewOpen);
                }}
                onFailure={onFailure}
                onChanged={() => setRevision(v => v + 1)}
              />}
              <Lessons key={revision} role={profile.role} onFailure={onFailure} onReviewRequest={canReviewRequests ? reviewRequest : undefined} />
            </ScrollView>
          ) : route.name === "notifications" ? (
            <Notifications
              key={profile.id}
              profile={profile}
              onCount={notificationUpdates.syncCount}
            />
          ) : !["student", "admin"].includes(profile.role) ? (
            <View style={s.content}>
              <Text style={s.title}>Payments are private.</Text>
              <Text style={s.muted}>
                This section is available to students and administrators. Your
                account is a {profile.role}.
              </Text>
            </View>
          ) : route.name === "history" ? (
            <History
              key={revision}
              profile={profile}
              open={(id) => setRoute({ name: "detail", id })}
              create={() => setRoute({ name: "new" })}
            />
          ) : (
            <>
              <Pressable
                accessibilityRole="button"
                onPress={goHome}
                style={s.back}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><BackIcon /><Text style={s.link}>Back to payments</Text></View>
              </Pressable>
              {route.name === "new" ? (
                <NewPayment done={(id) => setRoute({ name: "detail", id })} />
              ) : (
                <Detail id={route.id} admin={profile.role === "admin"} />
              )}
            </>
          )}
          </ScreenFade>
          {profile &&
            notificationUpdates.banner &&
            route.name !== "notifications" && (
              <View
                accessibilityLiveRegion="polite"
                pointerEvents="box-none"
                style={{ position: "absolute", top: 12, width: "100%", maxWidth: studentContentWidth, alignSelf: "center", paddingHorizontal: 22, zIndex: 20 }}
                testID="floating-notification"
              >
                <View style={s.floatingNotification}>
                <ScrollView style={{ flex: 1, maxHeight: 260 }} contentContainerStyle={{ gap: 5 }}>
                  <Text style={s.floatingLabel}>NEW SCHOOL UPDATE</Text>
                  <Text style={s.floatingTitle}>
                    {notificationUpdates.banner.title}
                  </Text>
                  <Text style={s.floatingBody}>
                    {notificationUpdates.banner.message}
                  </Text>
                </ScrollView>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Dismiss notification"
                  onPress={notificationUpdates.dismiss}
                  style={{ padding: 12 }}
                >
                  <Text style={s.floatingTitle}>×</Text>
                </Pressable>
                </View>
              </View>
            )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

export function History({
  profile,
  open,
  create,
}: {
  profile: Profile;
  open: (id: string) => void;
  create: () => void;
}) {
  const [items, setItems] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [more, setMore] = useState(false);
  const generation = useRef(0);
  const busy = useRef(false);
  const load = useCallback(async () => {
    const ticket = ++generation.current;
    busy.current = true;
    setLoading(true);
    setError("");
    try {
      const rows = await api<Payment[]>(
        `/payments?limit=25&offset=0`,
      );
      if (ticket === generation.current) {
        setItems(rows);
        setMore(rows.length === 25);
      }
    } catch (e) {
      if (ticket === generation.current) {
        setItems([]);
        setMore(false);
        setError(errorMessage(e));
      }
    } finally {
      if (ticket === generation.current) {
        setLoading(false);
        busy.current = false;
      }
    }
  }, []);
  useEffect(() => {
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
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    const ticket = generation.current;
    try {
      const rows = await api<Payment[]>(
        `/payments?limit=25&offset=${items.length}`,
      );
      if (ticket === generation.current) {
        setItems((old) => [
          ...old,
          ...rows.filter((row) => !old.some((p) => p.id === row.id)),
        ]);
        setMore(rows.length === 25);
        setError("");
      }
    } catch (e) {
      if (ticket === generation.current) setError(errorMessage(e));
    } finally {
      if (ticket === generation.current) {
        setLoading(false);
        busy.current = false;
      }
    }
  }
  return (
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
      <Text style={s.title}>Payments</Text>
      {profile.role === "student" && (
        <View style={s.hero}>
          <Text style={s.heroLabel}>ONE MONTH. MORE POSSIBILITIES.</Text>
          <Text style={s.heroTitle}>Ready for your next chapter?</Text>
          <Text style={s.heroBody}>
            Pay your school, then send your receipt here. We’ll take care of the
            review.
          </Text>
          <Button title="Submit a payment  ↗" onPress={create} secondary />
        </View>
      )}
      <View style={s.row}>
        <Text style={s.section}>
          {profile.role === "admin" ? "Payment review" : "Payment history"}
        </Text>
        <Pressable accessibilityRole="button" onPress={load}>
          <Text style={s.link}>Refresh</Text>
        </Pressable>
      </View>
      {profile.role === "student" && (
        <Text style={s.small}>Your submissions from the last six months</Text>
      )}
      <Notice text={error} />
      {loading && !items.length ? (
        <MascotLoader />
      ) : !items.length && !error ? (
        <View style={s.card}>
          <Text style={s.section}>Nothing here yet</Text>
          <Text style={s.muted}>
            Your payment submissions will appear here.
          </Text>
        </View>
      ) : (
        items.map((p) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${p.studentName || "Student name unavailable"}, ${p.courseName || "Course payment"}, ${money(p.amount)}, ${p.status}`}
            key={p.id}
            onPress={() => open(p.id)}
            style={s.card}
          >
            <Text style={s.body}>{p.studentName || "Student name unavailable"}</Text>
            <View style={s.row}>
              <Text style={s.course}>{p.courseName || "Course payment"}</Text>
              <Text style={s.amount}>{money(p.amount)}</Text>
            </View>
            <View style={s.row}>
              <Text style={s.small}>{date(p.submittedAt)}</Text>
              <Badge status={p.status} />
            </View>
            <Text style={s.link}>View payment →</Text>
          </Pressable>
        ))
      )}
      {more && (
        <Button
          title={loading ? "Loading…" : "Load more"}
          onPress={next}
          disabled={loading}
          secondary
        />
      )}
    </ScrollView>
  );
}

export function NewPayment({ done }: { done: (id: string) => void }) {
  const [courses, setCourses] = useState<Course[]>([]);
  const [course, setCourse] = useState<Course | null>(null);
  const [asset, setAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState("");
  const pending = useRef<Upload | null>(null);
  const uploaded = useRef(false);
  const lock = useRef(false);
  async function load() {
    setLoading(true);
    setError("");
    try {
      const all: Course[] = [];
      for (let offset = 0; ; offset += 100) {
        const page = await api<Course[]>(
          `/payments/courses?limit=100&offset=${offset}`,
        );
        all.push(...page);
        if (page.length < 100) break;
      }
      setCourses(all);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function pick() {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 1,
        allowsEditing: false,
      });
      if (!result.canceled) {
        const chosen = result.assets[0];
        if (
          !["image/jpeg", "image/png", "image/webp"].includes(
            chosen.mimeType || "",
          )
        )
          throw new Error("Choose a JPEG, PNG, or WebP image.");
        setAsset(chosen);
        pending.current = null;
        uploaded.current = false;
        setError("");
      }
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  async function submit() {
    if (!course || !asset || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      // Once PUT succeeds, always retry the same submission, even after the quote expires.
      // The API returns the existing payment when a previous response was lost.
      if (!uploaded.current) {
        const bytes =
          Platform.OS === "web" && asset.file
            ? await asset.file.arrayBuffer()
            : Platform.OS === "web"
              ? await (await fetch(asset.uri)).arrayBuffer()
              : await new File(asset.uri).arrayBuffer();
        if (!bytes.byteLength || bytes.byteLength > 5 * 1024 * 1024)
          throw new Error("Receipt must be between 1 byte and 5 MiB.");
        setStep("Preparing receipt…");
        if (
          !pending.current ||
          new Date(pending.current.submitBefore).getTime() <= Date.now()
        )
          pending.current = await api<Upload>("/payments/uploads", {
            courseId: course.courseId,
            contentType: asset.mimeType,
            size: bytes.byteLength,
          });
        setStep("Uploading receipt…");
        let response: Response;
        try {
          response = await fetch(pending.current.uploadUrl, {
            method: "PUT",
            headers: pending.current.headers,
            body: bytes,
            credentials: "omit",
          });
        } catch {
          pending.current = null;
          throw new Error(
            Platform.OS === "web"
              ? "Receipt storage could not be reached. Check your connection. If this continues, ask your school to enable receipt uploads for this website."
              : "Receipt storage could not be reached. Check your connection and try again.",
          );
        }
        if (!response.ok) {
          pending.current = null;
          throw new Error("Receipt upload failed. Please try again.");
        }
        uploaded.current = true;
      }
      setStep("Submitting payment…");
      const payment = await api<Payment>("/payments", {
        uploadId: pending.current!.uploadId,
      });
      done(payment.id);
    } catch (e) {
      if (e instanceof ApiError && e.status === 422) {
        pending.current = null;
        uploaded.current = false;
      }
      setError(errorMessage(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <ScrollView contentContainerStyle={s.content}>
      <Text style={s.eyebrow}>MONTHLY COURSE PAYMENT</Text>
      <Text style={s.title}>Keep your learning going.</Text>
      <Text style={s.muted}>
        Choose your course and upload proof of your payment. No money is charged
        in this app.
      </Text>
      <Text style={s.section}>01 Choose a course</Text>
      {loading ? (
        <MascotLoader accessibilityLabel="Loading courses" />
      ) : (
        courses.map((c) => (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: course?.courseId === c.courseId }}
            disabled={busy || uploaded.current}
            key={c.courseId}
            onPress={() => {
              setCourse(c);
              pending.current = null;
            }}
            style={[s.card, course?.courseId === c.courseId && s.selected]}
          >
            <View style={s.row}>
              <Text style={s.course}>{c.name}</Text>
              <Text style={s.amount}>
                {c.perLesson ? (c.amount ? money(c.amount) : "—") : money(c.monthlyPrice)}
              </Text>
            </View>
            <Text style={[s.small, course?.courseId === c.courseId && { color: "#f5f5f3" }]}>
              {c.perLesson
                ? c.lessonCount
                  ? `${c.lessonCount} ${c.lessonCount === 1 ? "lesson" : "lessons"} × ${money(c.monthlyPrice)}`
                  : "Lesson count not set yet — ask your teacher"
                : "One calendar month"}{" "}
              {course?.courseId === c.courseId ? " • Selected" : ""}
            </Text>
          </Pressable>
        ))
      )}
      {!loading && !courses.length && (
        <View style={s.card}>
          <Text style={s.muted}>
            No eligible courses loaded. You need an active course enrollment to
            submit a payment.
          </Text>
          <Button title="Reload courses" onPress={load} secondary />
        </View>
      )}
      <Text style={s.section}>02 Add your receipt</Text>
      <View style={s.upload}>
        {asset && (
          <Image
            source={{ uri: asset.uri }}
            style={s.preview}
            resizeMode="contain"
          />
        )}
        <Text style={s.section}>
          {asset ? "Receipt attached" : "A clear picture is all you need"}
        </Text>
        <Text style={s.small}>JPEG, PNG or WebP · Maximum 5 MiB</Text>
        <Button
          title={asset ? "Change receipt" : "+  Choose receipt"}
          disabled={busy || uploaded.current}
          onPress={pick}
          secondary
        />
      </View>
      <Notice text={error} />
      <Text style={s.small}>
        Your school will review your receipt and set the month’s start date when
        approved. One pending payment is allowed per course.
      </Text>
      <Button
        title={
          busy
            ? step
            : uploaded.current
              ? "Retry submission"
              : "Submit for review →"
        }
        onPress={submit}
        disabled={busy || !course || !asset}
      />
    </ScrollView>
  );
}

export function Detail({ id, admin }: { id: string; admin: boolean }) {
  const [payment, setPayment] = useState<Payment | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [startDate, setStartDate] = useState("");
  const [reason, setReason] = useState("");
  const [decision, setDecision] = useState<"approved" | "cancelled" | null>(
    null,
  );
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lock = useRef(false);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setPayment(await api<Payment>(`/payments/${id}`));
    } catch (e) {
      setPayment(null);
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [id]);
  useEffect(() => {
    void load();
    const sub = AppState.addEventListener("change", (state) => {
      setReceipt(null);
      if (state === "active") void load();
    });
    return () => {
      sub.remove();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [load]);
  async function viewReceipt() {
    setBusy(true);
    setError("");
    try {
      const result = await api<{ url: string; expiresInSeconds: number }>(
        `/payments/${id}/receipt`,
      );
      setReceipt(result.url);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(
        () => setReceipt(null),
        result.expiresInSeconds * 1000,
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function review() {
    if (!decision || lock.current) return;
    if (
      decision === "approved" &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) ||
        Number.isNaN(Date.parse(`${startDate}T00:00:00Z`)) ||
        new Date(`${startDate}T00:00:00Z`).toISOString().slice(0, 10) !==
          startDate)
    ) {
      setError("Enter a valid start date in YYYY-MM-DD format.");
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const updated = await api<Payment>(
        `/payments/${id}/review`,
        decision === "approved"
          ? { status: decision, startDate }
          : {
              status: decision,
              ...(reason.trim() ? { cancellationReason: reason.trim() } : {}),
            },
        "PATCH",
      );
      setPayment(updated);
      setDecision(null);
      await load();
    } catch (e) {
      const message = errorMessage(e);
      await load();
      setError(message);
      setDecision(null);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <ScrollView
      contentContainerStyle={s.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
    >
      <Text style={s.eyebrow}>PAYMENT DETAILS</Text>
      <Text style={s.title}>{payment?.courseName || "Course payment"}</Text>
      <Notice text={error} />
      {!payment ? (
        <Button
          title="Reload payment"
          disabled={loading}
          onPress={load}
          secondary
        />
      ) : (
        <>
          <View style={s.card}>
            <Badge status={payment.status} />
            <Text style={s.total}>{money(payment.amount)}</Text>
            <Text style={s.muted}>
              {payment.status === "pending"
                ? "Receipt submitted. Waiting for your school to review."
                : payment.status === "approved"
                  ? "Your payment has been approved."
                  : "This payment was cancelled. You can submit a new receipt from Payments."}
            </Text>
            <View style={s.divider} />
            <Text style={s.label}>Submitted</Text>
            <Text style={s.body}>{date(payment.submittedAt)}</Text>
            {payment.startDate && (
              <>
                <Text style={s.label}>Course coverage</Text>
                <Text style={s.body}>
                  {date(payment.startDate)} → {date(payment.endDate)}
                </Text>
                <Text style={s.small}>The end date is exclusive.</Text>
              </>
            )}
            {payment.cancellationReason && (
              <>
                <Text style={s.label}>Cancellation reason</Text>
                <Text style={s.body}>{payment.cancellationReason}</Text>
              </>
            )}
            <Text style={s.label}>Student</Text>
            <Text style={s.body}>{payment.studentName || "Student name unavailable"}</Text>
            {admin && (
              <>
                <Text style={s.label}>Student ID</Text>
                <Text selectable style={s.small}>
                  {payment.studentId}
                </Text>
              </>
            )}
            <Text style={s.label}>Payment reference</Text>
            <Text selectable style={s.small}>
              {payment.id}
            </Text>
          </View>
          {payment.receiptAvailable ? (
            <View style={s.card}>
              <Text style={s.section}>Payment receipt</Text>
              {receipt && (
                <Image
                  source={{ uri: receipt }}
                  style={s.receipt}
                  resizeMode="contain"
                  onError={() => {
                    setReceipt(null);
                    setError(
                      "Receipt could not be loaded. Tap View receipt to try again.",
                    );
                  }}
                />
              )}
              <Button
                title={receipt ? "Refresh receipt" : "View receipt"}
                onPress={viewReceipt}
                disabled={busy}
                secondary
              />
            </View>
          ) : (
            <Text style={s.small}>
              No receipt is available for this historical payment.
            </Text>
          )}
          {admin && payment.availableActions.length > 0 && (
            <View style={s.card}>
              <Text style={s.section}>Review this payment</Text>
              <Text style={s.muted}>
                Check the receipt before making a decision.
              </Text>
              <Field
                label="Start date (YYYY-MM-DD)"
                placeholder="2026-10-21"
                value={startDate}
                onChangeText={setStartDate}
                editable={!busy}
                autoCapitalize="none"
              />
              <Field
                label="Cancellation reason (optional)"
                value={reason}
                onChangeText={setReason}
                maxLength={1000}
                multiline
                editable={!busy}
              />
              {decision ? (
                <>
                  <Text style={s.notice}>
                    {decision === "approved"
                      ? `Approve this payment starting ${startDate}?`
                      : "Cancel this payment?"}{" "}
                    This decision cannot be changed.
                  </Text>
                  <Button
                    title={busy ? "Saving decision…" : "Confirm decision"}
                    onPress={review}
                    disabled={busy}
                  />
                  <Button
                    title="Go back"
                    onPress={() => setDecision(null)}
                    disabled={busy}
                    secondary
                  />
                </>
              ) : (
                <>
                  <Button
                    title="Approve payment"
                    onPress={() => setDecision("approved")}
                    disabled={
                      busy ||
                      !startDate ||
                      !payment.availableActions.includes("approve")
                    }
                  />
                  <Button
                    title="Cancel payment"
                    onPress={() => setDecision("cancelled")}
                    disabled={
                      busy || !payment.availableActions.includes("cancel")
                    }
                    secondary
                  />
                </>
              )}
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  notificationBadge: {
    backgroundColor: "#7064ed",
    borderRadius: 12,
    minWidth: 22,
    minHeight: 22,
    paddingHorizontal: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  notificationBadgeText: { color: "#f5f5f3", fontSize: 11, fontWeight: "800" },
  floatingNotification: {
    backgroundColor: "#7064ed",
    borderRadius: 18,
    padding: 18,
    flexDirection: "row",
    gap: 8,
    elevation: 8,
    shadowColor: "#102d22",
    shadowOpacity: 0.2,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    zIndex: 20,
  },
  floatingLabel: { fontSize: 11, color: "#b5b5b5", fontWeight: "700" },
  floatingTitle: { fontSize: 17, color: "#f5f5f3", fontWeight: "700" },
  floatingBody: { fontSize: 14, lineHeight: 20, color: "#f5f5f3" },
  flex: { flex: 1 },
  safe: { flex: 1, backgroundColor: "#191919" },
  loading: { flex: 1 },
  header: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderColor: "#3d3d3d",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  navScroll: { flex: 1, minWidth: 0 },
  navLinks: { alignItems: "center", gap: 4 },
  navButton: { minHeight: 44, paddingHorizontal: 9, borderRadius: 9, flexDirection: "row", alignItems: "center", gap: 5 },
  navText: { color: "#f5f5f3", fontWeight: "700", fontSize: 13 },
  navActive: { backgroundColor: "#37324f" },
  signOut: { borderWidth: 1, borderColor: "#57515f" },
  logo: { width: 48, height: 48 },
  content: {
    padding: 22,
    gap: 18,
    paddingBottom: 48,
    width: "100%",
    maxWidth: studentContentWidth,
    alignSelf: "center",
  },
  back: { paddingHorizontal: 24, paddingTop: 18 },
  eyebrow: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 2,
    color: "#b5b5b5",
    marginTop: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: -1.4,
    color: "#f5f5f3",
  },
  muted: { fontSize: 15, color: "#b5b5b5", lineHeight: 23 },
  small: { fontSize: 12, color: "#b5b5b5", lineHeight: 19 },
  body: { fontSize: 15, color: "#f5f5f3", lineHeight: 22 },
  link: {
    fontSize: 13,
    color: "#f5f5f3",
    fontWeight: "700",
    paddingVertical: 5,
  },
  hero: {
    backgroundColor: "#7064ed",
    padding: 25,
    borderRadius: 22,
    gap: 17,
    marginVertical: 5,
  },
  heroLabel: {
    color: "#b5b5b5",
    fontSize: 9,
    letterSpacing: 1.8,
    fontWeight: "700",
  },
  heroTitle: {
    color: "#f5f5f3",
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "600",
    maxWidth: 300,
  },
  heroBody: { color: "#f0edff", fontSize: 14, lineHeight: 22 },
  card: {
    padding: 20,
    borderRadius: 18,
    backgroundColor: "#272727",
    borderWidth: 1,
    borderColor: "#3d3d3d",
    gap: 14,
  },
  selected: {
    borderColor: "#7064ed",
    backgroundColor: "#7064ed",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },
  section: { fontSize: 18, color: "#f5f5f3", fontWeight: "700" },
  course: { fontSize: 16, color: "#f5f5f3", fontWeight: "600", flexShrink: 1 },
  amount: { fontSize: 16, color: "#f5f5f3", fontWeight: "700" },
  total: {
    fontSize: 40,
    color: "#f5f5f3",
    fontWeight: "700",
    letterSpacing: -1,
  },
  badge: {
    borderRadius: 20,
    paddingHorizontal: 11,
    paddingVertical: 7,
    alignSelf: "flex-start",
  },
  filters: { gap: 8 },
  chip: {
    paddingHorizontal: 15,
    paddingVertical: 11,
    borderRadius: 24,
    backgroundColor: "#272727",
  },
  chipActive: { backgroundColor: "#7064ed" },
  chipText: { fontSize: 12, fontWeight: "600", color: "#b5b5b5" },
  button: {
    minHeight: 50,
    padding: 14,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    backgroundColor: "#7064ed",
  },
  secondary: { backgroundColor: "#272727" },
  buttonText: { color: "#f5f5f3", fontSize: 14, fontWeight: "700" },
  input: {
    backgroundColor: "#272727",
    borderWidth: 1,
    borderColor: "#3d3d3d",
    padding: 14,
    borderRadius: 11,
    fontSize: 16,
    color: "#f5f5f3",
    minHeight: 50,
  },
  label: { fontSize: 12, fontWeight: "600", color: "#b5b5b5" },
  gap: { gap: 8 },
  notice: {
    padding: 14,
    borderRadius: 10,
    backgroundColor: "#272727",
    color: "#ff9b90",
    fontSize: 13,
    lineHeight: 20,
  },
  upload: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#3d3d3d",
    borderRadius: 18,
    padding: 22,
    gap: 16,
    backgroundColor: "#272727",
  },
  preview: { width: "100%", height: 180 },
  receipt: { width: "100%", height: 360 },
  divider: { height: 1, backgroundColor: "#272727" },
});

