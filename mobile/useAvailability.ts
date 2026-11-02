import { useCallback, useEffect, useRef, useState } from "react";
import { schoolRequest, SessionExpiredError } from "./auth-client";
import { addDays, dayNumber } from "../src/scheduling";

export type PersonName = { firstName: string | null; lastName: string | null };
export const fullName = (p: PersonName) =>
  [p.firstName, p.lastName].filter(Boolean).join(" ") || "Unnamed";
export const schoolToday = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Baku",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export const weekStart = (date: string) =>
  addDays(date, -((new Date(dayNumber(date)).getUTCDay() + 6) % 7));
export const civil = (timestamp: string) =>
  new Date(new Date(timestamp).getTime() + 4 * 3600000).toISOString();
export type AvailabilitySlot = {
  id: string;
  teacherId: string;
  courseId: string;
  startsAt: string;
  endsAt: string;
  active: boolean;
  conflict?: boolean;
  teacher: { id: string; profile: PersonName };
  course: { id: string; name: string };
  reservation?: {
    id: string;
    status: string;
    student: { profile: PersonName };
  } | null;
};
export type Trial = {
  id: string;
  status: string;
  slot: AvailabilitySlot;
  student: { profile: PersonName };
};
export type AvailabilityDraft = {
  id?: string;
  teacherId: string;
  courseId: string;
  date: string;
  startTime: string;
  endTime: string;
};
export const slotDraft = (slot: AvailabilitySlot): AvailabilityDraft => ({
  id: slot.id,
  teacherId: slot.teacherId,
  courseId: slot.courseId,
  date: civil(slot.startsAt).slice(0, 10),
  startTime: civil(slot.startsAt).slice(11, 16),
  endTime: civil(slot.endsAt).slice(11, 16),
});
export function useAvailability(
  role: string,
  onFailure: (error: unknown) => void,
) {
  const [week, setWeek] = useState(() => weekStart(schoolToday()));
  const [calendarMonth, setCalendarMonth] = useState(
    () => schoolToday().slice(0, 7) + "-01",
  );
  const [assigned, setAssigned] = useState<boolean | null>(null);
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [trials, setTrials] = useState<Trial[]>([]);
  const [teachers, setTeachers] = useState<
    { id: string; profile: PersonName }[]
  >([]);
  const [courses, setCourses] = useState<
    { id: string; name: string; teacherId: string; active: boolean }[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const version = useRef(0),
    locked = useRef(false),
    failure = useRef(onFailure);
  failure.current = onFailure;
  const managing = role !== "student";
  const fail = useCallback((e: unknown) => {
    setError(e instanceof Error ? e.message : "Unable to load availability");
    if (e instanceof SessionExpiredError) failure.current(e);
  }, []);
  async function pages<T>(path: string) {
    const rows: T[] = [];
    for (let offset = 0; ; offset += 100) {
      const page = await schoolRequest<T[]>(
        `${path}?limit=100&offset=${offset}`,
      );
      rows.push(...page);
      if (page.length < 100) return rows;
    }
  }
  const load = useCallback(async () => {
    const ticket = ++version.current;
    setLoading(true);
    try {
      // Load the visible month's calendar, including its leading/trailing days.
      const from = weekStart(calendarMonth);
      const to = addDays(from, 41);
      const all: AvailabilitySlot[] = [];
      for (let offset = 0; ; offset += 100) {
        const page = await schoolRequest<{
          items: AvailabilitySlot[];
          hasMore: boolean;
        }>(`/availability?from=${from}&to=${to}&limit=100&offset=${offset}`);
        all.push(...page.items);
        if (!page.hasMore) break;
      }
      const requests = await pages<Trial>("/trial-requests");
      if (role === "student") {
        const enrollments = await pages<{ id: string }>("/enrollments");
        if (ticket === version.current) setAssigned(enrollments.length > 0);
      }
      if (ticket === version.current) {
        setSlots(all);
        setTrials(requests);
      }
    } catch (e) {
      if (ticket === version.current) fail(e);
    } finally {
      if (ticket === version.current) setLoading(false);
    }
  }, [week, calendarMonth, role, fail]);
  useEffect(() => {
    setSlots([]);
    void load();
    const timer = setInterval(() => {
      if (!locked.current) void load();
    }, 15000);
    return () => {
      clearInterval(timer);
      version.current++;
    };
  }, [load]);
  useEffect(() => {
    if (!managing) return;
    let disposed = false;
    void Promise.all([
      pages<{ id: string; profile: PersonName }>("/teachers"),
      pages<{ id: string; name: string; teacherId: string; active: boolean }>(
        "/courses",
      ),
    ])
      .then(([people, subjects]) => {
        if (!disposed) {
          setTeachers(people);
          setCourses(subjects);
        }
      })
      .catch(fail);
    return () => {
      disposed = true;
    };
  }, [managing, role, fail]);
  async function mutate(
    path: string,
    method: string,
    body: unknown,
    message: string,
  ) {
    if (locked.current) return false;
    locked.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await schoolRequest(path, method, body);
      setNotice(message);
      await load();
      return true;
    } catch (e) {
      fail(e);
      await load();
      return false;
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  return {
    assigned,
    week,
    setWeek,
    setCalendarMonth,
    slots,
    trials,
    teachers,
    courses,
    loading,
    busy,
    error,
    setError,
    notice,
    managing,
    load,
    mutate,
  };
}
