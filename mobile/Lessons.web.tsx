import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { schoolRequest, SessionExpiredError } from "./auth-client";
import {
  addDays,
  bounds,
  DAY,
  dayNumber,
  minutes,
  movedSlot,
  timeString,
  type Schedule,
  type RepeatRule,
} from "../src/scheduling";
import { calendarCSS } from "./calendar-style";
import { Availability } from "./Availability.web";
import {
  LessonStatusDialog,
  type StatusAction,
} from "./LessonStatusDialog.web";
import { StudentPicker } from "./StudentPicker.web";
import { TimeRangePicker } from "./TimeRangePicker.web";

type Person = { firstName: string | null; lastName: string | null };
type Enrollment = {
  id: string;
  studentId: string;
  teacherId: string;
  courseId: string;
  course: { name: string };
  student: { profile: Person };
};
type Student = { id: string; status: string; profile: Person };
type Course = { id: string; name: string; active: boolean; teacherId: string };
type Lesson = Omit<Schedule, "endTime"> & {
  endTime: string | null;
  id: string;
  teacherId: string;
  color?: string | null;
  status: string;
  rescheduledAt?: string | null;
  enrollment: Enrollment;
  teacher: { profile: Person };
  seriesId?: string | null;
  repeatRule?: RepeatRule | null;
  reminderMinutes?: number | null;
};
type Draft = Schedule & {
  studentId: string;
  courseId: string;
  color: string | null;
  id?: string;
  enrollmentId: string;
  teacherId: string;
  reminderMinutes: string;
  repeat: "none" | "daily" | "weekly";
  interval: number;
  weekdays: number[];
  until: string;
  scope: "one" | "future";
  seriesId?: string | null;
  status: string;
};
type Drag = {
  lesson: Lesson;
  slot: Schedule;
  startX: number;
  startY: number;
  x: number;
  y: number;
  width: number;
  resize: boolean;
  moved: boolean;
};
const name = (p: Person) =>
  [p.firstName, p.lastName].filter(Boolean).join(" ") || "Unnamed";
const schoolToday = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Baku",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const monday = (date: string) =>
  addDays(date, -((new Date(dayNumber(date)).getUTCDay() + 6) % 7));
const pretty = (date: string, options: Intl.DateTimeFormatOptions) =>
  new Date(dayNumber(date)).toLocaleDateString("en-GB", {
    ...options,
    timeZone: "UTC",
  });
const normalize = (l: Lesson): Schedule => ({
  date: l.date,
  endDate: l.endDate || l.date,
  startTime: l.startTime,
  endTime: l.endTime || "23:59",
  allDay: !!l.allDay,
});
const palette = [
  ["#4b8a6b", "#e5f0e8"],
  ["#6d79bc", "#e9ecfa"],
  ["#bc8841", "#faf0dd"],
  ["#ad6a82", "#f6e7ee"],
  ["#5096a5", "#e0f1f4"],
];
const color = (id: string, custom?: string | null) => {
  let hash = 0;
  for (const c of id) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
  const [accent, tint] = palette[hash % palette.length];
  return {
    "--accent": custom || accent,
    "--tint": custom ? `color-mix(in srgb, ${custom} 16%, white)` : tint,
  } as React.CSSProperties;
};
function initialDraft(date: string, startTime = "10:00"): Draft {
  const end = minutes(startTime) + 60;
  return {
    studentId: "",
    courseId: "",
    color: null,
    date,
    endDate: addDays(date, end >= 1440 ? 1 : 0),
    startTime,
    endTime: timeString(end % 1440),
    allDay: false,
    enrollmentId: "",
    teacherId: "",
    reminderMinutes: "0",
    repeat: "none",
    interval: 1,
    weekdays: [new Date(dayNumber(date)).getUTCDay()],
    until: addDays(date, 28),
    scope: "one",
    status: "scheduled",
  };
}
export function Lessons({
  role,
  onFailure,
}: {
  role: string;
  onFailure: (error: unknown) => void;
}) {
  return role === "student" ? (
    <Availability role={role} onFailure={onFailure} />
  ) : (
    <LessonCalendar role={role} onFailure={onFailure} />
  );
}
function LessonCalendar({
  role,
  onFailure,
}: {
  role: string;
  onFailure: (error: unknown) => void;
}) {
  const [contextLesson, setContextLesson] = useState<Lesson | null>(null);
  const [week, setWeek] = useState(() => monday(schoolToday()));
  const [statusAction, setStatusAction] = useState<StatusAction | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [teacherChoices, setTeacherChoices] = useState<
    { id: string; profile: Person }[]
  >([]);
  const [selection, setSelection] = useState<{
    date: string;
    start: number;
    end: number;
  } | null>(null);
  const selectionAnchor = useRef<{
    date: string;
    minute: number;
    top: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [courseChoices, setCourseChoices] = useState<Course[]>([]);
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [student, setStudent] = useState("");
  const [teacher, setTeacher] = useState("");
  const [course, setCourse] = useState("");
  const [preview, setPreview] = useState<{ id: string; slot: Schedule } | null>(
    null,
  );
  const [clock, setClock] = useState(Date.now());
  const dialog = useRef<HTMLDialogElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const recenter = useRef<number | null>(null);
  const scrollReady = useRef(false);
  const panAnchor = useRef<{ x: number; left: number } | null>(null);
  const generation = useRef(0);
  const mutation = useRef(false);
  const drag = useRef<Drag | null>(null);
  const gestureCleanup = useRef<(() => void) | null>(null);
  const staff = role === "admin" || role === "manager";
  const editable = staff || role === "teacher";
  const failure = useCallback(
    (e: unknown) => {
      setError(e instanceof Error ? e.message : "Unable to load schedule");
      if (e instanceof SessionExpiredError) onFailure(e);
    },
    [onFailure],
  );
  const load = useCallback(async () => {
    const ticket = ++generation.current;
    setLoading(true);
    try {
      const all: Lesson[] = [];
      for (let offset = 0; ; offset += 100) {
        const page = await schoolRequest<Lesson[]>(
          `/lessons?from=${addDays(week, -7)}&to=${addDays(week, 13)}&limit=100&offset=${offset}`,
        );
        if (ticket !== generation.current) return;
        all.push(...page);
        if (page.length < 100) break;
      }
      setLessons(all);
    } catch (e) {
      if (ticket === generation.current) {
        setLessons([]);
        failure(e);
      }
    } finally {
      if (ticket === generation.current) setLoading(false);
    }
  }, [week, failure]);
  useEffect(() => {
    setError("");
    void load();
    return () => {
      generation.current++;
    };
  }, [load]);
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 60000);
    if (scroller.current) scroller.current.scrollTop = 0;
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const sync = () => {
      if (
        !scrollReady.current ||
        recenter.current !== null ||
        drag.current ||
        selectionAnchor.current
      )
        return;
      const max = element.scrollWidth - element.clientWidth;
      if (element.scrollLeft < 240) {
        recenter.current = 1680;
        setWeek((value) => addDays(value, -7));
      } else if (element.scrollLeft > max - 240) {
        recenter.current = -1680;
        setWeek((value) => addDays(value, 7));
      }
    };
    const observer = new ResizeObserver(sync);
    observer.observe(element);
    observer.observe(element.firstElementChild!);
    element.addEventListener("scroll", sync, { passive: true });
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey || (!event.shiftKey && !event.deltaX)) return;
      const delta =
        (event.deltaX || event.deltaY) *
        (event.deltaMode === 1
          ? 16
          : event.deltaMode === 2
            ? element.clientWidth
            : 1);
      if (!delta || element.scrollWidth <= element.clientWidth) return;
      event.preventDefault();
      element.scrollLeft += delta;
    };
    element.addEventListener("wheel", wheel, { passive: false });
    sync();
    return () => {
      observer.disconnect();
      element.removeEventListener("scroll", sync);
      element.removeEventListener("wheel", wheel);
    };
  }, []);
  useLayoutEffect(() => {
    const element = scroller.current;
    if (!element) return;
    scrollReady.current = false;
    if (recenter.current !== null) {
      element.scrollLeft += recenter.current;
      if (panAnchor.current) panAnchor.current.left += recenter.current;
      recenter.current = null;
    } else {
      element.scrollLeft = 1680;
      panAnchor.current = null;
    }
    scrollReady.current = true;
  }, [week]);
  function startPan(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0 || !scroller.current) return;
    panAnchor.current = { x: e.clientX, left: scroller.current.scrollLeft };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function navigateWeek(date: string) {
    recenter.current = null;
    if (scroller.current) scroller.current.scrollLeft = 1680;
    setWeek(date);
  }
  function movePan(e: React.PointerEvent<HTMLDivElement>) {
    if (panAnchor.current && scroller.current)
      scroller.current.scrollLeft =
        panAnchor.current.left + panAnchor.current.x - e.clientX;
  }
  useEffect(() => {
    if (draft && !dialog.current?.open) dialog.current?.showModal();
    if (!draft && dialog.current?.open) dialog.current.close();
  }, [draft]);
  useEffect(() => () => gestureCleanup.current?.(), []);
  async function loadDirectory() {
    setDirectoryLoading(true);
    async function all<T>(path: string): Promise<T[]> {
      const rows: T[] = [];
      for (let offset = 0; ; offset += 100) {
        const page = await schoolRequest<T[]>(
          `/${path}?limit=100&offset=${offset}`,
        );
        rows.push(...page);
        if (page.length < 100) return rows;
      }
    }
    try {
      const [enrolled, teachers, people, courses] = await Promise.all([
        all<Enrollment>("enrollments"),
        all<{ id: string; profile: Person }>("teachers"),
        all<Student>("scheduling-students"),
        all<Course>("courses"),
      ]);
      setEnrollments(enrolled);
      setTeacherChoices(teachers);
      setStudents(people);
      setCourseChoices(courses);
    } catch (e) {
      failure(e);
    } finally {
      setDirectoryLoading(false);
    }
  }
  useEffect(() => {
    void loadDirectory();
  }, []);
  function selectEnrollment(studentId: string, courseId: string) {
    if (!draft) return;
    const enrolled = enrollments.find(
      (e) => e.studentId === studentId && e.courseId === courseId,
    );
    setDraft({
      ...draft,
      studentId,
      courseId,
      enrollmentId: enrolled?.id || "",
      teacherId:
        enrolled?.teacherId ||
        courseChoices.find((c) => c.id === courseId)?.teacherId ||
        draft.teacherId,
    });
  }
  async function createEnrollment() {
    if (!draft || mutation.current || !draft.studentId || !draft.courseId)
      return;
    mutation.current = true;
    setSaving(true);
    setError("");
    try {
      const row = await schoolRequest<Enrollment>("/enrollments", "POST", {
        studentId: draft.studentId,
        courseId: draft.courseId,
      });
      setEnrollments((previous) => [...previous, row]);
      setDraft((current) =>
        current ? { ...current, enrollmentId: row.id } : current,
      );
      setNotice("Enrollment created.");
    } catch (e) {
      failure(e);
    } finally {
      mutation.current = false;
      setSaving(false);
    }
  }
  function openNew(date = schoolToday(), time = "10:00", endMinute?: number) {
    if (!editable || saving) return;
    setError("");
    setDraft({
      ...initialDraft(date, time),
      ...(endMinute !== undefined
        ? {
            endDate: addDays(date, endMinute === 1440 ? 1 : 0),
            endTime: timeString(endMinute % 1440),
          }
        : {}),
    });
    void loadDirectory();
  }
  function openLesson(lesson: Lesson, slot = normalize(lesson)) {
    setError("");
    setDraft({
      ...initialDraft(slot.date, slot.startTime),
      ...slot,
      id: lesson.id,
      color: lesson.color ?? null,
      studentId: lesson.enrollment.studentId,
      courseId: lesson.enrollment.courseId,
      enrollmentId: lesson.enrollment.id,
      teacherId: lesson.teacherId,
      reminderMinutes:
        lesson.reminderMinutes == null ? "" : String(lesson.reminderMinutes),
      repeat: lesson.repeatRule?.frequency || "none",
      interval: lesson.repeatRule?.interval || 1,
      weekdays: lesson.repeatRule?.weekdays || [
        new Date(dayNumber(slot.date)).getUTCDay(),
      ],
      until: lesson.repeatRule?.until || slot.date,
      seriesId: lesson.seriesId,
      status: lesson.status,
    });
    if (staff) void loadDirectory();
  }
  async function save(path: string, method: string, body: unknown) {
    if (mutation.current) return;
    mutation.current = true;
    setSaving(true);
    setError("");
    try {
      await schoolRequest(path, method, body);
      setDraft(null);
      setStatusAction(null);
      setNotice("Schedule saved.");
      await load();
    } catch (e) {
      failure(e);
    } finally {
      mutation.current = false;
      setSaving(false);
      setPreview(null);
    }
  }
  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;
    const [a, b] = bounds(draft);
    if (
      !Number.isFinite(a) ||
      !Number.isFinite(b) ||
      b <= a ||
      b - a > 31 * DAY
    ) {
      setError("Choose an end after the start, within 31 days.");
      return;
    }
    if (
      !draft.allDay &&
      (minutes(draft.startTime) < 600 ||
        minutes(draft.endTime) > 1410 ||
        draft.endDate !== draft.date ||
        minutes(draft.endTime) <= minutes(draft.startTime))
    ) {
      setError("Choose a lesson between 10:00 and 23:30 on the same day.");
      return;
    }
    if (!draft.id && !draft.enrollmentId) {
      setError("Select a student and course.");
      return;
    }
    if (staff && !draft.teacherId) {
      setError("Select a teacher.");
      return;
    }
    if (
      !draft.id &&
      draft.repeat !== "none" &&
      (draft.until < draft.date ||
        dayNumber(draft.until) - dayNumber(draft.date) > 366 * DAY ||
        (draft.repeat === "weekly" && !draft.weekdays.length))
    ) {
      setError("Choose repeat days and an end date within one year.");
      return;
    }
    const body = {
      ...(!draft.id ||
      draft.color !== (lessons.find((l) => l.id === draft.id)?.color ?? null)
        ? { color: draft.color }
        : {}),
      date: draft.date,
      endDate: draft.endDate,
      startTime: draft.startTime,
      endTime: draft.endTime,
      allDay: draft.allDay,
      reminderMinutes:
        draft.reminderMinutes === "" ? null : Number(draft.reminderMinutes),
      ...(draft.id
        ? { scope: draft.scope }
        : {
            enrollmentId: draft.enrollmentId,
            ...(draft.repeat !== "none"
              ? {
                  repeat: {
                    frequency: draft.repeat,
                    interval: draft.interval,
                    until: draft.until,
                    ...(draft.repeat === "weekly"
                      ? { weekdays: draft.weekdays }
                      : {}),
                  },
                }
              : {}),
          }),
    };
    void save(
      draft.id ? `/lessons/${draft.id}` : "/lessons",
      draft.id ? "PATCH" : "POST",
      { ...body, ...(staff ? { teacherId: draft.teacherId } : {}) },
    );
  }
  function selectStart(e: React.PointerEvent<HTMLDivElement>, date: string) {
    if (
      !editable ||
      saving ||
      loading ||
      e.button !== 0 ||
      (e.target as HTMLElement).closest(".cal-card")
    )
      return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const top = e.currentTarget.getBoundingClientRect().top;
    const minute = Math.max(
      600,
      Math.min(1395, 600 + Math.floor((e.clientY - top) / 15) * 15),
    );
    selectionAnchor.current = { date, minute, top };
    setSelection({ date, start: minute, end: minute + 15 });
  }
  function selectMove(e: React.PointerEvent<HTMLDivElement>) {
    const anchor = selectionAnchor.current;
    if (!anchor) return;
    const minute = Math.max(
      600,
      Math.min(1410, 600 + Math.round((e.clientY - anchor.top) / 15) * 15),
    );
    setSelection({
      date: anchor.date,
      start: Math.min(anchor.minute, minute),
      end: Math.max(anchor.minute + 15, minute),
    });
  }
  function selectEnd() {
    if (!selectionAnchor.current || !selection) return;
    selectionAnchor.current = null;
    setSelection(null);
    openNew(selection.date, timeString(selection.start), selection.end);
  }
  function startDrag(
    e: React.PointerEvent<HTMLElement>,
    lesson: Lesson,
    resize = false,
  ) {
    if (!editable || saving || lesson.status !== "scheduled" || e.button !== 0)
      return;
    e.stopPropagation();
    const grid = e.currentTarget.closest(".cal-grid")!;
    const width = (grid.getBoundingClientRect().width - 64) / 21;
    drag.current = {
      lesson,
      slot: normalize(lesson),
      startX: e.clientX,
      startY: e.clientY,
      x: e.clientX,
      y: e.clientY,
      width,
      resize,
      moved: false,
    };
    // Listen on window because moving a card to another day remounts its DOM node.
    gestureCleanup.current?.();
    const move = (event: PointerEvent) => dragMove(event);
    const end = () => {
      gestureCleanup.current?.();
      dragEnd();
    };
    const cancel = () => {
      gestureCleanup.current?.();
      drag.current = null;
      setPreview(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", cancel);
    gestureCleanup.current = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", cancel);
    };
  }
  function dragMove(e: { clientX: number; clientY: number }) {
    const d = drag.current;
    if (!d) return;
    d.x = e.clientX;
    d.y = e.clientY;
    if (Math.abs(d.x - d.startX) + Math.abs(d.y - d.startY) < 5 && !d.moved)
      return;
    d.moved = true;
    const days = d.resize ? 0 : Math.round((d.x - d.startX) / d.width);
    const delta = Math.round((d.y - d.startY) / 15) * 15;
    const original = normalize(d.lesson);
    if (d.resize) {
      const [a, b] = bounds(original);
      const end = Math.max(
        a + 15 * 60000,
        Math.min(dayNumber(original.date) + 1410 * 60000, b + delta * 60000),
      );
      d.slot = {
        ...original,
        endDate: new Date(end).toISOString().slice(0, 10),
        endTime: new Date(end).toISOString().slice(11, 16),
      };
    } else {
      const start = Math.min(
        1410 -
          Math.min(810, (bounds(original)[1] - bounds(original)[0]) / 60000),
        Math.max(
          600,
          minutes(original.startTime) + (original.allDay ? 0 : delta),
        ),
      );
      const date = addDays(original.date, days);
      d.slot = movedSlot(original, date, timeString(start));
    }
    setPreview({ id: d.lesson.id, slot: d.slot });
  }
  function dragEnd() {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (!d.moved) {
      openLesson(d.lesson);
      return;
    }
    if (d.lesson.seriesId) {
      setPreview(null);
      openLesson(d.lesson, d.slot);
      return;
    }
    void save(`/lessons/${d.lesson.id}`, "PATCH", { ...d.slot, scope: "one" });
  }
  const days = Array.from({ length: 21 }, (_, i) => addDays(week, i - 7));
  const today = schoolToday();
  const current = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Baku",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(clock));
  const displayed = lessons.filter(
    (l) =>
      (!student || l.enrollment.studentId === student) &&
      (!teacher || l.teacherId === teacher) &&
      (!course || l.enrollment.courseId === course),
  );
  const visibleSlot = (l: Lesson) =>
    preview?.id === l.id ? preview.slot : normalize(l);
  const teachers = teacherChoices.map((t) => [t.id, name(t.profile)]);
  const courses = courseChoices
    .filter((c) => c.active)
    .map((c) => [c.id, c.name]);
  const selected = draft?.id
    ? lessons.find((l) => l.id === draft.id)
    : undefined;
  const readOnly = !editable || (!!draft && draft.status !== "scheduled");
  function card(l: Lesson, style: React.CSSProperties = {}, allDay = false) {
    const slot = visibleSlot(l);
    const label = `${name(l.enrollment.student.profile)}, ${l.enrollment.course.name}, ${slot.date}, ${slot.allDay ? "all day" : slot.startTime + " to " + slot.endTime}, ${l.status}`;
    return (
      <div
        key={l.id}
        role="button"
        tabIndex={0}
        aria-label={label}
        title={label}
        data-lesson-id={l.id}
        className={`cal-card ${allDay ? "all-day-card" : ""} ${l.status !== "scheduled" ? "is-terminal" : ""} ${l.status === "cancelled" ? "is-cancelled" : ""} ${preview?.id === l.id ? "is-dragging" : ""}`}
        style={{ ...color(l.enrollment.courseId, l.color), ...style }}
        onContextMenu={(e) => {
          e.preventDefault();
          setContextLesson(l);
        }}
        onPointerDown={(e) => startDrag(e, l)}
        onClick={() => {
          if (!editable || l.status !== "scheduled") openLesson(l);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openLesson(l);
          }
        }}
      >
        <strong>
          {name(l.enrollment.student.profile)}
          {l.seriesId ? " ↻" : ""}
        </strong>
        <small>{l.enrollment.course.name}</small>
        <small>
          {allDay ? "All day" : `${slot.startTime}–${slot.endTime}`}
        </small>
        <small>{name(l.teacher.profile)}</small>
        {l.status === "scheduled" && l.rescheduledAt && <small>Rescheduled</small>}
        {!allDay && editable && l.status === "scheduled" && (
          <span
            className="cal-resize"
            aria-hidden="true"
            onPointerDown={(e) => startDrag(e, l, true)}
          />
        )}
      </div>
    );
  }
  function dayCards(date: string) {
    const start = dayNumber(date);
    const segments = displayed
      .filter((l) => !visibleSlot(l).allDay)
      .map((l) => {
        const [a, b] = bounds(visibleSlot(l));
        return {
          l,
          start: Math.max(600, (a - start) / 60000),
          end: Math.min(1410, (b - start) / 60000),
          lane: 0,
          lanes: 1,
        };
      })
      .filter((s) => s.start < s.end)
      .sort((a, b) => a.start - b.start || b.end - a.end);
    let group: typeof segments = [],
      groupEnd = -1;
    const finish = () => {
      const lanes = Math.max(1, ...group.map((s) => s.lane + 1));
      group.forEach((s) => (s.lanes = lanes));
    };
    for (const segment of segments) {
      if (segment.start >= groupEnd) {
        finish();
        group = [];
        groupEnd = -1;
      }
      const used = new Set(
        group.filter((s) => s.end > segment.start).map((s) => s.lane),
      );
      while (used.has(segment.lane)) segment.lane++;
      group.push(segment);
      groupEnd = Math.max(groupEnd, segment.end);
    }
    finish();
    return segments.map((s) =>
      card(s.l, {
        top: s.start - 600,
        height: Math.max(18, s.end - s.start - 2),
        left: `calc(${(s.lane / s.lanes) * 100}% + 3px)`,
        width: `calc(${100 / s.lanes}% - 6px)`,
      }),
    );
  }
  return (
    <section
      className="school-calendar lesson-calendar-full"
      aria-label="Lesson calendar"
    >
      <style>{calendarCSS}</style>
      <div className="cal-heading">
        <div>
          <span className="cal-eyebrow">
            {staff ? "SCHOOL ADMINISTRATION" : "YOUR TIMETABLE"}
          </span>
          <h1>Lesson calendar</h1>
        </div>
        {editable && (
          <button
            className="cal-button cal-primary"
            disabled={saving}
            onClick={() => openNew()}
          >
            + Schedule a lesson
          </button>
        )}
      </div>
      <p className="cal-subtitle">
        A clear view of the week ahead. All times in Asia/Baku.
      </p>
      <div className="cal-toolbar">
        <div className="cal-actions">
          <button
            className="cal-button"
            disabled={saving}
            onClick={() => navigateWeek(monday(today))}
          >
            Today
          </button>
          <span className="cal-range" data-week={week}>
            {pretty(week, { day: "numeric", month: "short" })} –{" "}
            {pretty(addDays(week, 6), {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </span>
        </div>
        <div className="cal-actions">
          <select
            aria-label="Filter by student"
            value={student}
            onChange={(e) => setStudent(e.target.value)}
          >
            <option value="">All students</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {name(s.profile)}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter by teacher"
            value={teacher}
            onChange={(e) => setTeacher(e.target.value)}
          >
            <option value="">All teachers</option>
            {teachers.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter by course"
            value={course}
            onChange={(e) => setCourse(e.target.value)}
          >
            <option value="">All courses</option>
            {courses.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
          <button
            className="cal-button"
            disabled={saving || loading}
            onClick={() => {
              setError("");
              void load();
              void loadDirectory();
            }}
          >
            Refresh
          </button>
        </div>
      </div>
      {error && !draft && (
        <div role="alert" className="cal-message cal-error">
          {error}
        </div>
      )}
      {notice && (
        <div role="status" className="cal-message">
          {notice}
        </div>
      )}
      <div role="status" aria-live="polite">
        {loading
          ? "Loading schedule…"
          : saving
            ? "Saving schedule…"
            : !displayed.length
              ? "No lessons this week. Choose a time to get started."
              : ""}
      </div>
      <p className="cal-scroll-help">
        Drag day headers sideways or hold Shift while scrolling. Keep scrolling
        to explore earlier or later weeks.
      </p>
      <div
        className="cal-scroll"
        ref={scroller}
        aria-label="Weekly lesson schedule"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
            e.preventDefault();
            e.currentTarget.scrollLeft += e.key === "ArrowRight" ? 240 : -240;
          }
        }}
        aria-busy={loading || saving}
      >
        <div className="cal-grid">
          <div className="cal-day-header">GMT+4</div>
          {days.map((date) => (
            <div
              key={date}
              data-header-date={date}
              className={`cal-day-header ${date === today ? "cal-today" : ""}`}
              onPointerDown={startPan}
              onPointerMove={movePan}
              onPointerUp={() => {
                panAnchor.current = null;
              }}
              onPointerCancel={() => {
                panAnchor.current = null;
              }}
            >
              {pretty(date, { weekday: "short", month: "short" })}
              <strong>{Number(date.slice(8))}</strong>
            </div>
          ))}
          <div className="cal-allday-label">ALL DAY</div>
          {days.map((date) => (
            <div className="cal-allday" key={date}>
              {displayed
                .filter((l) => {
                  const s = visibleSlot(l);
                  return (
                    s.allDay && s.date <= date && (s.endDate || s.date) >= date
                  );
                })
                .map((l) => card(l, {}, true))}
            </div>
          ))}
          <div className="cal-hours">
            {Array.from({ length: 14 }, (_, hour) => (
              <span
                key={hour}
                className="cal-hour"
                style={{ top: hour * 60 + (hour ? 0 : 8) }}
              >
                {String(hour + 10).padStart(2, "0")}:00
              </span>
            ))}
            <span className="cal-hour" style={{ top: 802 }}>
              23:30
            </span>
          </div>
          {days.map((date) => (
            <div
              key={date}
              className={`cal-day ${date === today ? "is-today" : ""}`}
              data-date={date}
              aria-label={date}
              onPointerDown={(e) => selectStart(e, date)}
              onPointerMove={selectMove}
              onPointerUp={selectEnd}
              onPointerCancel={() => {
                selectionAnchor.current = null;
                setSelection(null);
              }}
              onDoubleClick={(e) => {
                if ((e.target as HTMLElement).closest(".cal-card")) return;
                const minute = Math.min(
                  1350,
                  Math.max(
                    600,
                    600 +
                      Math.floor(
                        (e.clientY -
                          e.currentTarget.getBoundingClientRect().top) /
                          15,
                      ) *
                        15,
                  ),
                );
                openNew(date, timeString(minute));
              }}
            >
              {dayCards(date)}
              {selection?.date === date && (
                <div
                  className="cal-selection"
                  style={{
                    top: selection.start - 600,
                    height: selection.end - selection.start,
                  }}
                >
                  {timeString(selection.start)}–
                  {selection.end === 1440 ? "24:00" : timeString(selection.end)}
                </div>
              )}
              {date === today &&
                minutes(current) >= 600 &&
                minutes(current) <= 1410 && (
                  <div
                    className="cal-now"
                    style={{ top: minutes(current) - 600 }}
                  />
                )}
            </div>
          ))}
        </div>
      </div>
      <div className="cal-footer">
        Right-click a lesson to change its status.
      </div>
      {contextLesson && (
        <div
          className="lesson-context-backdrop"
          onKeyDown={(e) => {
            if (e.key === "Escape") setContextLesson(null);
          }}
          onClick={() => setContextLesson(null)}
        >
          <div
            role="menu"
            aria-label="Lesson actions"
            className="lesson-context-menu"
          >
            <button
              role="menuitem"
              autoFocus
              onClick={() => openLesson(contextLesson)}
            >
              Edit lesson
            </button>
            {(["completed", "cancelled", "deleted"] as const).map((status) => (
              <button
                role="menuitem"
                key={status}
                disabled={
                  saving ||
                  (status !== "deleted" && contextLesson.status !== "scheduled")
                }
                onClick={() =>
                  setStatusAction({
                    id: contextLesson.id,
                    status,
                    seriesId: contextLesson.seriesId,
                    label: contextLesson.enrollment.course.name,
                  })
                }
              >
                {status === "completed"
                  ? "Mark completed"
                  : status === "cancelled"
                    ? "Cancel lesson"
                    : "Delete lesson"}
              </button>
            ))}
            <button onClick={() => setContextLesson(null)}>Close</button>
          </div>
        </div>
      )}
      <dialog
        className="lesson-dialog"
        ref={dialog}
        aria-labelledby="lesson-title"
        onCancel={(e) => {
          if (saving) e.preventDefault();
          else setDraft(null);
        }}
      >
        {draft && (
          <form onSubmit={submit}>
            <div className="dialog-head">
              <h2 id="lesson-title">
                {draft.id
                  ? readOnly
                    ? "Lesson details"
                    : "Reschedule lesson"
                  : "Schedule a lesson"}
              </h2>
              <button
                type="button"
                className="close"
                aria-label="Close scheduler"
                disabled={saving}
                onClick={() => setDraft(null)}
              >
                ×
              </button>
            </div>
            {selected && (
              <p>
                {selected.enrollment.course.name} ·{" "}
                {name(selected.enrollment.student.profile)}
                <br />
                {name(selected.teacher.profile)} · {selected.status}
              </p>
            )}
            <fieldset disabled={saving || readOnly || directoryLoading}>
              {!draft.id && (
                <div className="enrollment-fields">
                  <StudentPicker
                    students={students}
                    value={draft.studentId}
                    onChange={(id) => selectEnrollment(id, draft.courseId)}
                  />
                  <label className="enrollment-label">
                    Course
                    <select
                      required
                      aria-label="Course"
                      value={draft.courseId}
                      onChange={(e) =>
                        selectEnrollment(draft.studentId, e.target.value)
                      }
                    >
                      <option value="">Select a course</option>
                      {courseChoices
                        .filter((c) => c.active)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  {directoryLoading ? (
                    <p>Loading students, teachers and courses…</p>
                  ) : (
                    draft.studentId &&
                    draft.courseId &&
                    (draft.enrollmentId ? (
                      <p>Student is enrolled in this course.</p>
                    ) : (
                      <div>
                        <p>This student is not enrolled in this course yet.</p>
                        <button
                          type="button"
                          onClick={() => void createEnrollment()}
                        >
                          Create enrollment
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}
              {staff && (
                <label className="enrollment-label teacher-select">
                  Teacher
                  <select
                    aria-label="Lesson teacher"
                    required
                    value={draft.teacherId}
                    onChange={(e) =>
                      setDraft({ ...draft, teacherId: e.target.value })
                    }
                  >
                    <option value="">Select a teacher</option>
                    {draft.teacherId &&
                      !teacherChoices.some((t) => t.id === draft.teacherId) && (
                        <option value={draft.teacherId}>
                          {selected
                            ? name(selected.teacher.profile)
                            : "Enrollment teacher"}
                        </option>
                      )}
                    {teacherChoices.map((t) => (
                      <option key={t.id} value={t.id}>
                        {name(t.profile)}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="option-row">
                Color
                <select
                  aria-label="Lesson color"
                  value={draft.color || ""}
                  onChange={(e) =>
                    setDraft({ ...draft, color: e.target.value || null })
                  }
                >
                  <option value="">Automatic (course)</option>
                  {[
                    ["#4b8a6b", "Green"],
                    ["#6d79bc", "Purple"],
                    ["#bc8841", "Amber"],
                    ["#ad6a82", "Pink"],
                    ["#5096a5", "Blue"],
                    ["#cf5757", "Red"],
                  ].map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              {draft.seriesId && (
                <p>
                  Color changes apply to all lessons you can manage in this
                  recurring series, regardless of the schedule scope.
                </p>
              )}
              <h3 className="duration-heading">Duration</h3>
              <div className="date-row">
                <label htmlFor="lesson-start-date">Start</label>
                <input
                  id="lesson-start-date"
                  aria-label="Start date"
                  type="date"
                  required
                  value={draft.date}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      date: e.target.value,
                      endDate: draft.allDay ? draft.endDate : e.target.value,
                    })
                  }
                />
                <output className="time-readout">
                  {draft.allDay ? "All day" : draft.startTime}
                </output>
              </div>
              <div className="date-row">
                <label htmlFor="lesson-end-date">End</label>
                <input
                  id="lesson-end-date"
                  aria-label="End date"
                  type="date"
                  required
                  value={draft.endDate}
                  min={draft.date}
                  max={draft.allDay ? undefined : draft.date}
                  onChange={(e) =>
                    setDraft({ ...draft, endDate: e.target.value })
                  }
                />
                <output className="time-readout">
                  {draft.allDay ? "All day" : draft.endTime}
                </output>
              </div>
              {!draft.allDay && draft.date && (
                <TimeRangePicker
                  value={draft}
                  disabled={saving || readOnly}
                  onChange={(slot) => setDraft({ ...draft, ...slot })}
                />
              )}
              <label className="toggle-row">
                All Day
                <input
                  type="checkbox"
                  role="switch"
                  checked={draft.allDay}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      allDay: e.target.checked,
                      ...(!e.target.checked
                        ? {
                            endDate: draft.date,
                            ...(minutes(draft.startTime) < 600 ||
                            minutes(draft.endTime) > 1410 ||
                            draft.endTime <= draft.startTime
                              ? { startTime: "10:00", endTime: "11:00" }
                              : {}),
                          }
                        : {}),
                    })
                  }
                />
              </label>
              <label className="option-row">
                ◷ Reminder
                <select
                  aria-label="Reminder"
                  value={draft.reminderMinutes}
                  onChange={(e) =>
                    setDraft({ ...draft, reminderMinutes: e.target.value })
                  }
                >
                  {[
                    ["", "None"],
                    ["0", "On time"],
                    ["5", "5 minutes before"],
                    ["15", "15 minutes before"],
                    ["30", "30 minutes before"],
                    ["60", "1 hour before"],
                    ["1440", "1 day before"],
                  ].map(([v, label]) => (
                    <option key={v} value={v}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="option-row">
                ↻ Repeat
                <select
                  aria-label="Repeat"
                  disabled={!!draft.id}
                  value={draft.repeat}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      repeat: e.target.value as Draft["repeat"],
                    })
                  }
                >
                  <option value="none">Does not repeat</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly / selected days</option>
                </select>
              </label>
              {draft.repeat !== "none" && !draft.id && (
                <div className="repeat-details">
                  <label>
                    Every
                    <input
                      aria-label="Repeat interval"
                      type="number"
                      required
                      min={1}
                      max={52}
                      value={draft.interval}
                      onChange={(e) =>
                        setDraft({ ...draft, interval: Number(e.target.value) })
                      }
                    />
                    {draft.repeat === "daily" ? "day(s)" : "week(s)"}
                  </label>
                  {draft.repeat === "weekly" && (
                    <div className="weekdays">
                      {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                        <button
                          type="button"
                          key={d}
                          aria-label={
                            [
                              "Sunday",
                              "Monday",
                              "Tuesday",
                              "Wednesday",
                              "Thursday",
                              "Friday",
                              "Saturday",
                            ][d]
                          }
                          aria-pressed={draft.weekdays.includes(d)}
                          onClick={() =>
                            setDraft({
                              ...draft,
                              weekdays: draft.weekdays.includes(d)
                                ? draft.weekdays.filter((x) => x !== d)
                                : [...draft.weekdays, d],
                            })
                          }
                        >
                          {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"][d]}
                        </button>
                      ))}
                    </div>
                  )}
                  <label>
                    Repeat until
                    <input
                      aria-label="Repeat until"
                      type="date"
                      required
                      min={draft.date}
                      max={draft.date ? addDays(draft.date, 366) : undefined}
                      value={draft.until}
                      onChange={(e) =>
                        setDraft({ ...draft, until: e.target.value })
                      }
                    />
                  </label>
                  <small>
                    Up to 366 lessons. Every booking is checked for conflicts.
                  </small>
                </div>
              )}
              {draft.seriesId && (
                <label className="option-row">
                  Apply to
                  <select
                    aria-label="Apply changes to"
                    value={draft.scope}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        scope: e.target.value as Draft["scope"],
                      })
                    }
                  >
                    <option value="one">This lesson</option>
                    <option value="future">This and future lessons</option>
                  </select>
                </label>
              )}
              {draft.id && draft.seriesId && (
                <p>
                  Future edits preserve the spacing between booked lessons. To
                  change repeat days, cancel the future lessons and schedule a
                  new series.
                </p>
              )}
            </fieldset>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            {!readOnly && (
              <>
                <div className="dialog-footer">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => {
                      setError("");
                      setDraft({
                        ...draft,
                        startTime: "10:00",
                        endTime: "11:00",
                        endDate: draft.date,
                        allDay: false,
                        reminderMinutes: "",
                        ...(!draft.id ? { repeat: "none" } : {}),
                      });
                    }}
                  >
                    Clear
                  </button>
                  <button
                    className="save"
                    type="submit"
                    disabled={
                      saving ||
                      directoryLoading ||
                      (!draft.id && !draft.enrollmentId)
                    }
                  >
                    {saving ? "Saving…" : "OK"}
                  </button>
                </div>
                {draft.id && (
                  <div className="status-actions">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => {
                        setError("");
                        setStatusAction({
                          id: draft.id!,
                          status: "completed",
                          seriesId: draft.seriesId,
                          label: selected
                            ? `${selected.enrollment.course.name} · ${name(selected.enrollment.student.profile)} · ${selected.date}`
                            : draft.date,
                        });
                      }}
                    >
                      Mark completed
                    </button>
                    <button
                      className="danger"
                      type="button"
                      disabled={saving}
                      onClick={() => {
                        setError("");
                        setStatusAction({
                          id: draft.id!,
                          status: "cancelled",
                          seriesId: draft.seriesId,
                          label: selected
                            ? `${selected.enrollment.course.name} · ${name(selected.enrollment.student.profile)} · ${selected.date}`
                            : draft.date,
                        });
                      }}
                    >
                      Cancel lesson
                    </button>
                  </div>
                )}
              </>
            )}
            {draft.id && editable && (
              <button
                type="button"
                className="danger"
                disabled={saving}
                onClick={() => {
                  setError("");
                  setStatusAction({
                    id: draft.id!,
                    status: "deleted",
                    seriesId: draft.seriesId,
                    label: selected
                      ? `${selected.enrollment.course.name} · ${name(selected.enrollment.student.profile)} · ${selected.date}`
                      : draft.date,
                  });
                }}
              >
                Delete lesson
              </button>
            )}
            <p>
              School time · Asia/Baku. Reminders go to the student and teacher’s
              notification inbox.
            </p>
          </form>
        )}
      </dialog>
      {statusAction && (
        <LessonStatusDialog
          key={statusAction.id + statusAction.status}
          action={statusAction}
          busy={saving}
          error={error}
          onFailure={onFailure}
          onClose={() => {
            setStatusAction(null);
            setError("");
          }}
          onConfirm={(body) =>
            body.status === "deleted"
              ? void save(
                  `/lessons/${statusAction.id}?scope=${body.scope}`,
                  "DELETE",
                  undefined,
                )
              : void save(`/lessons/${statusAction.id}`, "PATCH", body)
          }
        />
      )}
    </section>
  );
}
