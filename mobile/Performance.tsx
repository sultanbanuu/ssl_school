import MascotLoader from "./MascotLoader";
import { BackIcon } from "./CourseIcon";
import { studentContentWidth } from "./student-layout";
import { SchoolIcon } from "./SchoolIcon";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { AppState, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { api, type Profile } from "./src/api";
import { assessmentSchema, defaultWeights, emptyAssessment, levels, scores, skillLabels, skills, weightsSchema, type Assessment, type Weights } from "../src/shared/performance";

type Enrollment = { id: string; courseId: string; studentId: string; course: { name: string }; student: { id: string; performanceLevel?: string | null; profile: { firstName: string | null; lastName: string | null } } };
type Evaluation = { updatedAt?: string; id: string; studentId: string; lessonId: string; topic: string; assessment: Assessment; lesson: { date: string; enrollmentId: string } };
type Data = { enrollments: Enrollment[]; evaluations: Evaluation[]; weights: Weights };
type Lesson = { id: string; date: string; enrollment: { course: { name: string } } };
const name = (e: Enrollment) => [e.student.profile.firstName, e.student.profile.lastName].filter(Boolean).join(" ") || "Student";
const day = (value: string) => value.slice(0, 10);
const message = (e: unknown) => e instanceof Error ? e.message : "Unable to save. Please try again.";
function Button({ title, onPress, disabled, secondary = false }: { title: string; onPress: () => void; disabled?: boolean; secondary?: boolean }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[s.button, secondary && s.secondary, disabled && { opacity: 0.5 }]}><View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>{title.startsWith("←") && <BackIcon />}<Text style={[s.buttonText, secondary && { color: "#f5f5f3" }]}>{title.replace(/^←\s*/, "")}</Text></View></Pressable>;
}
// Accepts "7,5" as well as "7.5": Azerbaijani and Russian keyboards type a decimal comma.
const toNumber = (value: string) => Number(value.trim().replace(",", "."));
// Memoized so a keystroke in one field re-renders only that field, not the whole score form.
const Field = React.memo(function Field({ label, value, onChangeText, numeric = false, multiline = false }: { label: string; value: string; onChangeText: (v: string) => void; numeric?: boolean; multiline?: boolean }) {
  return <View style={s.field}><Text style={s.label}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText} keyboardType={numeric ? "decimal-pad" : "default"} multiline={multiline} style={[s.input, multiline && { minHeight: 90, textAlignVertical: "top" }]} placeholderTextColor="#758174" /></View>;
});
const Select = React.memo(function Select({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  return <View style={s.field}><Text style={s.label}>{label}</Text><Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ expanded: open }} onPress={() => setOpen(true)} style={s.select}><Text style={[s.text, { flex: 1 }]}>{options.find(o => o.value === value)?.label || "Select…"}</Text><Text style={{ color: "#f5f5f3" }}>⌄</Text></Pressable>{open && <Modal visible transparent animationType="fade" onRequestClose={() => setOpen(false)}><View style={s.overlay}><View style={s.dialog}><Text style={s.heading}>{label}</Text><ScrollView keyboardShouldPersistTaps="handled">{options.map(o => <Pressable accessibilityRole="button" accessibilityState={{ selected: o.value === value }} key={o.value} onPress={() => { onChange(o.value); setOpen(false); }} style={[s.option, o.value === value && s.secondary]}><Text style={s.text}>{o.label}</Text></Pressable>)}{!options.length && <Text style={s.muted}>No options available.</Text>}</ScrollView><Button title="Close" secondary onPress={() => setOpen(false)} /></View></View></Modal>}</View>;
});
// One-tap choice row: used for scores instead of a dropdown, so each score is a single tap with no dialog.
const Choice = React.memo(function Choice({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  return <View style={s.field} accessibilityRole="radiogroup" accessibilityLabel={label}><Text style={s.label}>{label}</Text><View style={s.choices}>{options.map(o => { const selected = o.value === value; return <Pressable key={o.value} accessibilityRole="radio" accessibilityLabel={`${label}: ${o.label}`} aria-checked={selected} onPress={() => onChange(o.value)} style={({ pressed }) => [s.chip, selected && s.chipSelected, pressed && { opacity: 0.7 }]}><Text style={[s.chipText, selected && s.chipTextSelected]}>{o.label}</Text></Pressable>; })}</View></View>;
});
const speakingLabels = ["Task fulfilment", "Fluency", "Intelligibility", "Interaction"];
const speakingOptions = [{ value: "", label: "–" }, ...[0, 1, 2, 3, 4, 5].map(n => ({ value: String(n), label: String(n) }))];
const homeworkOptions = ["Not assigned", "Submitted", "Not submitted", "Reviewed"].map(v => ({ value: v, label: v }));
function Principles() {
  return <View style={s.card}>
    <Text style={s.muted}>Your teacher scores your work in four areas:</Text>
    <Text style={s.muted}>• <Text style={{ fontWeight: "700" }}>Speaking</Text> - Task fulfilment, fluency, intelligibility and interaction;</Text>
    <Text style={s.muted}>• <Text style={{ fontWeight: "700" }}>Vocabulary (20 points)</Text> - Word recall and use in context;</Text>
    <Text style={s.muted}>• <Text style={{ fontWeight: "700" }}>Listening (10 points)</Text> - Main idea, details and implied meaning;</Text>
    <Text style={s.muted}>• <Text style={{ fontWeight: "700" }}>Sentence structure (20 points)</Text> - 0–2 points per sentence across 10 sentences</Text>
  </View>;
}
export function Performance({ profile, onFailure, header, onExplore }: { profile: Profile; onFailure: (e: unknown) => void; header?: React.ReactNode; onExplore?: () => void }) {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [student, setStudent] = useState("");
  const [course, setCourse] = useState("");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [adminStudent, setAdminStudent] = useState("");
  const [level, setLevel] = useState("");
  const failure = useRef(onFailure); failure.current = onFailure;
  const load = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try { setData(await api<Data>("/performance")); setError(""); }
    catch (e) { setError(message(e)); failure.current(e); }
    finally { setLoading(false); }
  };
  useEffect(() => {
    let active = true;
    let refreshing = false;
    const refresh = async () => {
      if (!active || refreshing) return;
      refreshing = true;
      try { await load(false); } finally { refreshing = false; }
    };
    void load();
    if (profile.role !== "student") return () => { active = false; };
    const timer = setInterval(() => { if (AppState.currentState === "active") void refresh(); }, 15000);
    const listener = AppState.addEventListener("change", state => { if (state === "active") void refresh(); });
    return () => { active = false; clearInterval(timer); listener.remove(); };
  }, [profile.id, profile.role]);
  const act = async (work: () => Promise<unknown>, success: string) => {
    setBusy(true); setError(""); setNotice("");
    try { await work(); setNotice(success); await load(); }
    catch (e) { setError(message(e)); failure.current(e); }
    finally { setBusy(false); }
  };
  const enrolled = data ? [...new Map(data.enrollments.map(e => [e.studentId, e])).values()] : [];
  const classes = data ? [...new Map(data.enrollments.map(e => [e.courseId, e.course.name])).entries()] : [];
  const selected = enrolled.find(e => e.studentId === student);
  return <ScrollView keyboardShouldPersistTaps="handled" style={s.screen} contentContainerStyle={s.content} refreshControl={<RefreshControl refreshing={loading && data !== null} onRefresh={load} />}>
    {header}
    {!!error && <View style={s.card}><Text accessibilityRole="alert" style={s.error}>{error}</Text><Button title="Retry loading" secondary onPress={load} /></View>}
    {!!notice && <Text accessibilityLiveRegion="polite" style={s.success}>{notice}</Text>}
    {!data ? loading && <MascotLoader accessibilityLabel="Loading performance" /> : profile.role === "student" ? <StudentPerformance evaluations={data.evaluations} enrolled={data.enrollments.length > 0} onExplore={onExplore} /> : profile.role === "teacher" ? selected ? <TeacherStudent key={selected.studentId} enrollment={selected} evaluations={data.evaluations.filter(e => e.studentId === student)} weights={data.weights} back={() => setStudent("")} onSaved={load} onFailure={onFailure} /> : <>
      <View style={s.card}><Text style={s.number}>{enrolled.length}</Text><Text style={s.muted}>Enrolled students</Text></View>
      <Text style={s.heading}>Your classes</Text><View style={s.wrap}><Button title="All students" secondary={course !== ""} onPress={() => setCourse("")} />{classes.map(([id, title]) => <Button key={id} title={`${title} · ${data.enrollments.filter(e => e.courseId === id).length}`} secondary={course !== id} onPress={() => setCourse(id)} />)}</View>
      <View style={s.card}><Text style={s.heading}>{classes.find(([id]) => id === course)?.[1] || "Student overview"}</Text><Field label="Search students" value={search} onChangeText={setSearch} />{enrolled.filter(e => (!course || data.enrollments.some(x => x.studentId === e.studentId && x.courseId === course)) && name(e).toLowerCase().includes(search.toLowerCase())).map(e => {
        const latest = data.evaluations.filter(x => x.studentId === e.studentId).at(-1);
        const score = latest ? scores(latest.assessment).overall : null;
        return <Pressable key={e.studentId} accessibilityRole="button" accessibilityLabel={`View ${name(e)}`} onPress={() => setStudent(e.studentId)} style={s.studentRow}><View style={s.avatar}><Text style={s.text}>{name(e).split(" ").map(p => p[0]).slice(0, 2).join("")}</Text></View><View style={{ flex: 1, gap: 6 }}><Text style={s.heading}>{name(e)}</Text><Text style={s.muted}>{data.enrollments.filter(x => x.studentId === e.studentId).map(x => x.course.name).join(" · ")}</Text><View style={s.wrap}><Text style={s.badge}>{e.student.performanceLevel || "Level not assigned"}</Text><Text style={s.badge}>{score === null ? latest ? "Incomplete" : "Not assessed" : `${score}/100`}</Text></View></View><Text style={s.text}>View →</Text></Pressable>;
      })}{!enrolled.length && <Text style={s.muted}>Your enrolled students will appear here.</Text>}</View>
      <WeightEditor weights={data.weights} busy={busy} save={w => act(() => api("/performance/weights", w, "PUT"), "Scoring weights saved. New evaluations will use these weights.")} />
    </> : <>
      <Principles />
      <View style={s.card}><Text style={s.heading}>Student management</Text><Text style={s.muted}>{enrolled.length} enrolled students</Text><Select label="Student name" value={adminStudent} options={enrolled.map(e => ({ value: e.studentId, label: name(e) }))} onChange={id => { setAdminStudent(id); setLevel(enrolled.find(e => e.studentId === id)?.student.performanceLevel || ""); setNotice(""); }} /><Select label="Assign class · student level" value={level} options={[{ value: "", label: "Not assigned" }, ...levels.map(l => ({ value: l, label: l }))]} onChange={setLevel} /><Text style={s.muted}>This level badge is used in performance management. It is not shown on the student's profile.</Text><Button title={busy ? "Saving…" : "Save level"} disabled={busy || !adminStudent} onPress={() => void act(() => api(`/performance/students/${adminStudent}/level`, { level: level || null }, "PUT"), "Student level saved.")} /></View>
      <View style={s.card}><Text style={s.heading}>Enrolled students</Text>{enrolled.map(e => <View key={e.studentId} style={s.studentRow}><Text style={[s.text, { flex: 1 }]}>{name(e)}</Text><Text style={s.badge}>{e.student.performanceLevel || "Not assigned"}</Text></View>)}</View>
    </>}
  </ScrollView>;
}
function WeightEditor({ weights, save, busy }: { weights: Weights; save: (w: Weights) => Promise<void>; busy: boolean }) {
  const [values, setValues] = useState(() => Object.fromEntries(skills.map(k => [k, String(weights[k])]))) ;
  const parsed = weightsSchema.safeParse(Object.fromEntries(skills.map(k => [k, values[k].trim() === "" ? NaN : toNumber(values[k])])));
  const setters = useMemo(() => Object.fromEntries(skills.map(k => [k, (v: string) => setValues(old => ({ ...old, [k]: v }))])), []);
  return <View style={s.card}><Text style={s.heading}>Performance weights</Text><Text style={s.muted}>Adjust how each skill contributes. Changes apply to new evaluations; existing scores retain their saved weights.</Text><View style={s.wrap}>{skills.map(k => <Field key={k} label={`${skillLabels[k]} %`} numeric value={values[k]} onChangeText={setters[k]} />)}</View><Text style={parsed.success ? s.muted : s.error}>Total: {skills.reduce((n, k) => n + (toNumber(values[k]) || 0), 0)}% · Must equal 100%</Text><Button title={busy ? "Saving…" : "Save scoring weights"} disabled={busy || !parsed.success} onPress={() => { if (parsed.success) void save(parsed.data); }} /></View>;
}
function TeacherStudent({ enrollment, evaluations, weights, back, onSaved, onFailure }: { enrollment: Enrollment; evaluations: Evaluation[]; weights: Weights; back: () => void; onSaved: () => Promise<void>; onFailure: (e: unknown) => void }) {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [lessonId, setLessonId] = useState("");
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const load = async () => { setLoading(true); try { setLessons(await api<Lesson[]>(`/performance/students/${enrollment.studentId}/lessons`)); setError(""); } catch (e) { setError(message(e)); onFailure(e); } finally { setLoading(false); } };
  useEffect(() => { void load(); }, [enrollment.studentId]);
  const current = evaluations.find(e => e.lessonId === lessonId);
  const lesson = lessons.find(l => l.id === lessonId);
  const open = (id: string) => { setLessonId(id); setSaved(""); setEditing(true); };
  return <><Button title={editing ? "← Student profile" : "← All students"} secondary onPress={() => editing ? setEditing(false) : back()} /><Text style={s.title}>{editing ? "Evaluate this lesson." : name(enrollment)}</Text><Text style={s.muted}>{name(enrollment)} · {enrollment.student.performanceLevel || "Level not assigned"}</Text>
    {!!error && <><Text style={s.error}>{error}</Text><Button title="Retry lessons" onPress={load} /></>}
    {!editing && !!saved && <View style={s.savedCard}><Text style={s.savedTick}>✓</Text><Text accessibilityLiveRegion="polite" style={[s.text, { flex: 1 }]}>{saved}</Text></View>}
    {editing && lesson ? <EvaluationForm key={lessonId} lesson={lesson} existing={current} weights={weights} onSaved={topic => {
      // Close straight away; the refreshed list arrives in the background.
      setSaved(`Saved “${topic}” · ${day(lesson.date)}. The student can see it now.`);
      setEditing(false);
      void onSaved();
    }} onFailure={onFailure} /> : <>
      <View style={s.card}><Text style={s.heading}>Give a lesson score</Text>{loading ? <MascotLoader accessibilityLabel="Loading lessons" /> : <><Select label="Lesson date & class" value={lessonId} options={lessons.map(l => ({ value: l.id, label: `${day(l.date)} · ${l.enrollment.course.name}${evaluations.some(e => e.lessonId === l.id) ? " · Assessed" : ""}` }))} onChange={setLessonId} /><Button title={current ? "Adjust score" : "Evaluate lesson"} disabled={!lessonId} onPress={() => open(lessonId)} />{!lessons.length && <Text style={s.muted}>Schedule a lesson for this student to begin assessing.</Text>}</>}</View>
      <View style={s.card}><Text style={s.heading}>Lesson history</Text>{[...evaluations].reverse().map(e => <View key={e.id} style={s.card}><Text style={s.heading}>{e.topic}</Text><Text style={s.muted}>{day(e.lesson.date)} · {scores(e.assessment).overall ?? "Incomplete"}{scores(e.assessment).overall !== null && "/100"}</Text>{!!e.assessment.feedback && <Text style={s.text}>{e.assessment.feedback}</Text>}{!!e.assessment.target && <Text style={s.muted}>Next target: {e.assessment.target}</Text>}<Button title="Adjust score" secondary disabled={!lessons.some(l => l.id === e.lessonId)} onPress={() => open(e.lessonId)} /></View>)}{!evaluations.length && <Text style={s.muted}>No evaluations yet.</Text>}</View>
    </>}
  </>;
}
const pointKeys = ["vocabulary", "listening", "sentenceStructure"] as const;
type PointKey = typeof pointKeys[number];
type PointText = Record<PointKey, { earned: string; possible: string }>;
function EvaluationForm({ lesson, existing, weights, onSaved, onFailure }: { lesson: Lesson; existing?: Evaluation; weights: Weights; onSaved: (topic: string) => void; onFailure: (e: unknown) => void }) {
  const [initial] = useState(() => existing?.assessment || emptyAssessment(weights));
  const [topic, setTopic] = useState(existing?.topic || "");
  const [speaking, setSpeaking] = useState(() => initial.speaking.map(v => v === null ? "" : String(v)));
  const [points, setPoints] = useState<PointText>(() => Object.fromEntries(pointKeys.map(k => [k, { earned: initial[k].earned === null ? "" : String(initial[k].earned), possible: String(initial[k].possible) }])) as PointText);
  const [homework, setHomework] = useState(initial.homework);
  const [feedback, setFeedback] = useState(initial.feedback);
  const [target, setTarget] = useState(initial.target);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Functional updates keep every keystroke even when several arrive before React re-renders,
  // and stable callbacks let the memoized fields skip re-rendering while another field is typed in.
  const handlers = useMemo(() => ({
    speaking: speakingLabels.map((_, i) => (v: string) => setSpeaking(old => old.map((x, j) => i === j ? v : x))),
    points: Object.fromEntries(pointKeys.map(k => [k, {
      earned: (v: string) => setPoints(old => ({ ...old, [k]: { ...old[k], earned: v } })),
      possible: (v: string) => setPoints(old => ({ ...old, [k]: { ...old[k], possible: v } })),
    }])) as Record<PointKey, { earned: (v: string) => void; possible: (v: string) => void }>,
    homework: (v: string) => setHomework(v as Assessment["homework"]),
  }), []);
  // Only the score inputs feed the preview: typing feedback or the topic does not re-validate scores.
  const scored = useMemo(() => assessmentSchema.safeParse({
    weights: initial.weights, speaking: speaking.map(v => v === "" ? null : Number(v)),
    ...Object.fromEntries(pointKeys.map(k => [k, { earned: points[k].earned.trim() === "" ? null : toNumber(points[k].earned), possible: points[k].possible.trim() === "" ? NaN : toNumber(points[k].possible) }])),
    homework: "Not assigned", feedback: "", target: "",
  }), [initial, speaking, points]);
  const result = useMemo(() => scored.success ? scores(scored.data) : null, [scored]);
  const tooLong = feedback.length > 4000 || target.length > 1000;
  const ready = scored.success && !tooLong && !!topic.trim();
  const save = async () => {
    if (!scored.success || !ready || busy) return;
    setBusy(true); setError("");
    const assessment = { ...scored.data, homework, feedback, target };
    try { await api(`/performance/lessons/${lesson.id}`, { topic: topic.trim(), assessment }, "PUT"); onSaved(topic.trim()); }
    catch (e) { setError(message(e)); onFailure(e); setBusy(false); }
  };
  return <>
    <View style={s.card}><Text style={s.heading}>Lesson details</Text><Text style={s.muted}>{day(lesson.date)} · {lesson.enrollment.course.name}</Text><Field label="Lesson topic" value={topic} onChangeText={setTopic} /></View>
    <View style={s.hero}><Text style={s.heroLabel}>LIVE SCORE PREVIEW</Text><Text style={s.heroNumber}>{result?.overall ?? "—"}<Text style={s.heroSmall}> /100</Text></Text>{skills.map(k => <View key={k} style={s.between}><Text style={s.heroSmall}>{skillLabels[k]}</Text><Text style={s.heroSmall}>{result?.categories[k] == null ? "Not assessed" : `${Math.round(result.categories[k]!)} /100`}</Text></View>)}<Text style={s.heroSmall}>{result?.overall == null ? "Incomplete · Unassessed categories are not zero." : "All weighted categories assessed."}</Text></View>
    <View style={s.card}><View style={s.between}><Text style={s.heading}>01 · Speaking</Text><Text style={s.badge}>{initial.weights.speaking}% weight</Text></View><Text style={s.muted}>Assess against the student's level. 0 = not demonstrated; 5 = independently successful; – = not assessed.</Text>{speakingLabels.map((label, i) => <Choice key={label} label={label} value={speaking[i]!} options={speakingOptions} onChange={handlers.speaking[i]!} />)}</View>
    {pointKeys.map((k, i) => <View key={k} style={s.card}><View style={s.between}><Text style={s.heading}>0{i + 2} · {skillLabels[k]}</Text><Text style={s.badge}>{initial.weights[k]}% weight</Text></View><Text style={s.muted}>{k === "vocabulary" ? "Recall and use in context." : k === "listening" ? "Main idea, details and implied meaning." : "Ten sentences, each assessed from 0 to 2 points by default."}</Text><View style={s.wrap}><Field label={`${skillLabels[k]} points earned`} numeric value={points[k].earned} onChangeText={handlers.points[k].earned} /><Field label={`${skillLabels[k]} points possible`} numeric value={points[k].possible} onChangeText={handlers.points[k].possible} /></View></View>)}
    <View style={s.card}><Text style={s.heading}>Homework & feedback</Text><Choice label="Homework status · separate from performance" value={homework} options={homeworkOptions} onChange={handlers.homework} /><Field label="Feedback for the student" multiline value={feedback} onChangeText={setFeedback} /><Field label="Next learning target" value={target} onChangeText={setTarget} /></View>
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}{!scored.success && <Text accessibilityRole="alert" style={s.error}>Check your points: earned must be between zero and points possible; points possible must be greater than zero.</Text>}{tooLong && <Text accessibilityRole="alert" style={s.error}>Feedback is limited to 4,000 characters and the next target to 1,000.</Text>}
    <Text style={s.muted}>Save makes feedback and assessed skills visible to the student immediately. You can adjust scores later.</Text><Button title={busy ? "Saving…" : existing ? "Save score changes" : "Save evaluation"} disabled={busy || !ready} onPress={save} />
  </>;
}

function StudentPerformance({ evaluations, enrolled, onExplore }: { evaluations: Evaluation[]; enrolled: boolean; onExplore?: () => void }) {
  const preview = evaluations.length === 0;
  const newest = [...evaluations].sort((a, b) => (b.updatedAt || b.lesson.date).localeCompare(a.updatedAt || a.lesson.date))[0];
  const previewSkills = { speaking: 95, vocabulary: 98, listening: 100, sentenceStructure: 97 };
  const [period, setPeriod] = useState<"all" | "week" | "month">("all");
  const [explain, setExplain] = useState(false);
  const { width } = useWindowDimensions();
  // School-local date, independent of the device's timezone.
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Baku", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const now = new Date(`${today}T00:00:00Z`);
  const start = new Date(now);
  if (period === "week") start.setUTCDate(start.getUTCDate() - (start.getUTCDay() + 6) % 7); else start.setUTCDate(1);
  const previous = new Date(start);
  if (period === "week") previous.setUTCDate(previous.getUTCDate() - 7); else previous.setUTCMonth(previous.getUTCMonth() - 1);
  const from = start.toISOString().slice(0, 10), prev = previous.toISOString().slice(0, 10);
  const rows = period === "all" ? evaluations : evaluations.filter(e => day(e.lesson.date) >= from && day(e.lesson.date) <= today);
  const earlier = evaluations.filter(e => day(e.lesson.date) >= prev && day(e.lesson.date) < from);
  const mean = (values: (number | null)[]) => { const present = values.filter((n): n is number => n !== null); return present.length ? Math.round(present.reduce((a, b) => a + b, 0) / present.length) : null; };
  const overall = preview ? 98 : mean(rows.map(e => scores(e.assessment).overall));
  const old = mean(earlier.map(e => scores(e.assessment).overall));
  const delta = period !== "all" && overall !== null && old !== null ? overall - old : null;
  const latest = rows.at(-1);
  const varying = rows.some(e => skills.some(k => e.assessment.weights[k] !== latest?.assessment.weights[k]));
  const points = preview ? [95, 96, 98, 100].map((score, i) => ({ score, date: new Date(+now - (3 - i) * 86400000).toISOString().slice(0, 10) })) : rows.map(e => ({ date: day(e.lesson.date), score: scores(e.assessment).overall })).filter((p): p is { date: string; score: number } => p.score !== null);
  return <>{newest && <View style={s.card} testID="latest-teacher-result"><Text style={s.heading}>Latest teacher result</Text><Text style={s.number}>{scores(newest.assessment).overall === null ? "Incomplete" : `${scores(newest.assessment).overall}/100`}</Text><Text style={s.heading}>{newest.topic}</Text><Text style={s.muted}>Lesson: {day(newest.lesson.date)}</Text>{!!newest.assessment.feedback && <Text style={s.text}>{newest.assessment.feedback}</Text>}{!!newest.assessment.target && <Text style={s.muted}>Next target: {newest.assessment.target}</Text>}</View>}{preview && <View style={s.card}><Text style={s.badge}>PREVIEW · YOUR POTENTIAL</Text><Text style={s.title}>Ready to aim for the highest score?</Text><Text style={s.text}>{enrolled ? "Your next chapter starts here. Attend your first lesson and see your progress take shape." : "Enroll and see your change. Build your confidence, grow every skill, and aim for 95–100."}</Text><Text style={s.muted}>These are example scores, not your results. Your own scores will appear after your teacher assesses a lesson.</Text>{!enrolled && onExplore && <Button title="Explore courses →" onPress={onExplore} />}</View>}<View style={s.between}><View style={{ flex: 1 }}><Text style={s.title}>Your learning, in focus.</Text><Text style={s.muted}>Small steps. Real progress.</Text></View></View><View style={s.wrap}><Button title="All results" secondary={period !== "all"} onPress={() => setPeriod("all")} /><Button title="This week" secondary={period !== "week"} onPress={() => setPeriod("week")} /><Button title="This month" secondary={period !== "month"} onPress={() => setPeriod("month")} /></View>
    <View style={[s.wrap, { alignItems: "stretch" }]}><View style={[s.hero, { flex: 1, minWidth: width < 600 ? "100%" : 280 }]}><Text style={s.heroLabel}>{preview ? "OVERALL PERFORMANCE · PREVIEW" : "OVERALL PERFORMANCE"}</Text><View style={s.between}><Text style={s.heroNumber}>{overall ?? "—"}<Text style={s.heroSmall}> /100</Text></Text><ScoreRing score={overall} /></View>{!preview && period === "all" && <Text style={s.heroSmall}>All saved lesson evaluations</Text>}{!preview && delta !== null && <Text style={s.heroSmall}>{`${delta > 0 ? "↗ +" : delta < 0 ? "↘ " : "→ "}${delta} points from last ${period}`}</Text>}{overall === null && <Text style={s.heroSmall}>Your teacher's completed evaluations will appear here.</Text>}<Text style={s.heroSmall}>{preview ? "Example score · not an assessment" : `${rows.filter(e => scores(e.assessment).overall !== null).length} complete · ${rows.filter(e => scores(e.assessment).overall === null).length} incomplete`}</Text></View></View>
    <View style={s.between}><Text style={s.heading}>Your skill breakdown</Text><Button title="How scoring works ↗" secondary onPress={() => setExplain(!explain)} /></View>{explain && <Principles />}
    <View style={s.wrap}>{skills.map((k, i) => { const value = preview ? previewSkills[k] : mean(rows.map(e => scores(e.assessment).categories[k])); return <View key={k} style={[s.card, { flexGrow: 1, flexBasis: width < 380 ? "100%" : width < 750 ? "44%" : "22%" }]}><SchoolIcon name={k === "sentenceStructure" ? "sentence structure" : k} size={42} /><Text style={s.heading}>{skillLabels[k]}</Text><Text style={s.number}>{value ?? "—"}<Text style={s.muted}> /100</Text></Text><View style={s.track}><View style={[s.fill, { width: `${value ?? 0}%` }]} /></View><Text style={s.muted}>{preview ? "Example score · your potential" : value === null ? "Not assessed" : varying ? "Weight varies by lesson" : `${latest?.assessment.weights[k] ?? defaultWeights[k]}% of overall score`}</Text></View>; })}</View>
    <View style={s.card}><Text style={s.heading}>Steady progress</Text><Text style={s.muted}>{preview ? "Example progress · your journey starts here" : "Your performance over time"}</Text><Text style={s.badge}>{preview ? "PREVIEW" : points.length < 2 ? "Getting started" : points.at(-1)!.score > points[0].score ? "↗ Growing" : points.at(-1)!.score === points[0].score ? "Steady" : "Room to grow"}</Text><ProgressChart points={points} /></View>
    <View style={s.card}><Text style={s.heading}>Lesson feedback</Text>{[...rows].reverse().map(e => <View key={e.id} style={s.feedback}><Text style={s.heading}>{e.topic}</Text><Text style={s.muted}>{day(e.lesson.date)} · {scores(e.assessment).overall === null ? "Incomplete" : `${scores(e.assessment).overall}/100`}</Text><Text style={s.text}>{e.assessment.feedback || "No written feedback yet."}</Text>{!!e.assessment.target && <Text style={s.text}>Next target: {e.assessment.target}</Text>}<Text style={s.badge}>Homework: {e.assessment.homework}</Text></View>)}{!rows.length && <Text style={s.muted}>{preview ? "Your feedback, homework review and next learning target will appear here after your first evaluation." : period === "all" ? "No saved evaluations yet." : `No evaluations for this ${period} yet. Choose All results to see other lesson dates.`}</Text>}</View>
  </>;
}
function ScoreRing({ score }: { score: number | null }) {
  const [selected, setSelected] = useState(false);
  return <View accessibilityLabel="Overall performance" style={{ width: 82, height: 82, borderRadius: 24, backgroundColor: "#ffffff22", alignItems: "center", justifyContent: "center" }}><SchoolIcon name="achievement" selected size={52} /></View>;
}
function ProgressChart({ points }: { points: { date: string; score: number }[] }) {
  const [width, setWidth] = useState(260);
  const dates = [...new Set(points.map(p => p.date))];
  const daily = dates.map(date => ({ date, score: points.filter(p => p.date === date).reduce((sum, p) => sum + p.score, 0) / points.filter(p => p.date === date).length }));
  const start = daily.length ? Date.parse(daily[0].date) : 0, end = daily.length ? Date.parse(daily.at(-1)!.date) : 0;
  const coords = daily.map(p => ({ x: end === start ? width / 2 : 7 + (Date.parse(p.date) - start) / (end - start) * (width - 14), y: 120 - p.score * 1.1 }));
  return <View><View onLayout={e => setWidth(e.nativeEvent.layout.width)} style={{ height: 140 }} accessibilityLabel={daily.map(p => `${p.date}: ${Math.round(p.score)} out of 100`).join("; ") || "No complete assessments"}>{[10, 65, 120].map(top => <View key={top} style={{ position: "absolute", top, left: 0, right: 0, borderTopWidth: 1, borderColor: "#3d3d3d", borderStyle: "dashed" }} />)}{coords.map((p, i) => { const next = coords[i + 1]; return <React.Fragment key={i}>{next && <View style={{ position: "absolute", left: (p.x + next.x) / 2 - Math.hypot(next.x - p.x, next.y - p.y) / 2, top: (p.y + next.y) / 2, width: Math.hypot(next.x - p.x, next.y - p.y), height: 2, backgroundColor: "#39b971", transform: [{ rotate: `${Math.atan2(next.y - p.y, next.x - p.x)}rad` }] }} />}<View style={{ position: "absolute", left: p.x - 4, top: p.y - 3, width: 8, height: 8, borderRadius: 4, backgroundColor: "#7064ed" }} /></React.Fragment>; })}{!daily.length && <Text style={[s.muted, { textAlign: "center", paddingTop: 45 }]}>Your progress chart starts with your first complete evaluation.</Text>}</View><View style={s.between}><Text style={s.muted}>{daily[0]?.date.slice(5)}</Text><Text style={s.muted}>{daily.length > 1 ? daily.at(-1)?.date.slice(5) : ""}</Text></View></View>;
}
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#191919" }, content: { padding: 22, gap: 16, maxWidth: studentContentWidth, width: "100%", alignSelf: "center", paddingBottom: 36 },
  title: { color: "#f5f5f3", fontSize: 28, fontWeight: "700", letterSpacing: -0.8 }, heading: { color: "#f5f5f3", fontSize: 16, fontWeight: "700" }, text: { color: "#f5f5f3", fontSize: 14, lineHeight: 21 }, muted: { color: "#b5b5b5", fontSize: 12, lineHeight: 19 }, label: { color: "#f5f5f3", fontSize: 12, lineHeight: 18 },
  card: { backgroundColor: "#272727", borderWidth: 1, borderColor: "#3d3d3d", borderRadius: 20, padding: 18, gap: 14 }, wrap: { flexDirection: "row", flexWrap: "wrap", gap: 12 }, between: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }, field: { flexGrow: 1, minWidth: 120, gap: 7 },
  input: { backgroundColor: "#272727", borderWidth: 1, borderColor: "#3d3d3d", borderRadius: 10, padding: 12, minHeight: 46, color: "#f5f5f3", fontSize: 14 }, select: { backgroundColor: "#272727", borderWidth: 1, borderColor: "#3d3d3d", borderRadius: 10, padding: 12, minHeight: 46, flexDirection: "row", gap: 10, alignItems: "center" },
  button: { minHeight: 44, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 11, backgroundColor: "#7064ed", justifyContent: "center", alignSelf: "flex-start" }, buttonText: { color: "#f5f5f3", fontSize: 13, fontWeight: "600" }, secondary: { backgroundColor: "#272727" }, badge: { backgroundColor: "#272727", paddingHorizontal: 9, paddingVertical: 5, borderRadius: 7, color: "#b5b5b5", fontSize: 11, alignSelf: "flex-start" },
  number: { color: "#f5f5f3", fontSize: 28, fontWeight: "700" }, studentRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 15, borderBottomWidth: 1, borderColor: "#3d3d3d" }, avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: "#272727", justifyContent: "center", alignItems: "center" },
  hero: { backgroundColor: "#7064ed", borderRadius: 21, padding: 22, gap: 18 }, heroLabel: { color: "#f0edff", fontSize: 11, fontWeight: "700", letterSpacing: 1.2 }, heroNumber: { color: "#f5f5f3", fontSize: 52, fontWeight: "500" }, heroSmall: { color: "#f5f5f3", fontSize: 12, lineHeight: 20 }, skillIcon: { backgroundColor: "#272727", color: "#f5f5f3", alignSelf: "flex-start", borderRadius: 9, padding: 10, fontSize: 20 }, track: { height: 5, borderRadius: 4, backgroundColor: "#272727", overflow: "hidden" }, fill: { height: 5, backgroundColor: "#39b971", borderRadius: 4 }, feedback: { gap: 10, borderTopWidth: 1, borderColor: "#3d3d3d", paddingTop: 15 },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, chip: { minWidth: 44, minHeight: 40, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: "#3d3d3d", backgroundColor: "#1f1f1f", alignItems: "center", justifyContent: "center" }, chipSelected: { backgroundColor: "#7064ed", borderColor: "#7064ed" }, chipText: { color: "#b5b5b5", fontSize: 14, fontWeight: "600" }, chipTextSelected: { color: "#f5f5f3" },
  savedCard: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#1d3328", borderWidth: 1, borderColor: "#39b971", borderRadius: 16, padding: 14 }, savedTick: { width: 28, height: 28, borderRadius: 14, backgroundColor: "#39b971", color: "#0f1f17", fontWeight: "800", textAlign: "center", lineHeight: 28, overflow: "hidden" },
  error: { color: "#ff9b90", lineHeight: 21 }, success: { color: "#f5f5f3", padding: 10, lineHeight: 21 }, overlay: { flex: 1, backgroundColor: "#12251c88", padding: 22, alignItems: "center", justifyContent: "center" }, dialog: { width: "100%", maxWidth: 480, maxHeight: "80%", borderRadius: 20, backgroundColor: "#272727", padding: 18, gap: 16 }, option: { minHeight: 48, padding: 14, borderRadius: 8 },
});
