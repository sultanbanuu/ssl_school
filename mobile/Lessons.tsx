import { LessonBadge } from "./StatusBadge";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { schoolRequest, SessionExpiredError } from "./auth-client";
import { StudentLessons } from "./StudentLessons";

type Lesson = {
  id: string;
  seriesId?: string | null;
  date: string;
  endDate?: string;
  allDay?: boolean;
  startTime: string;
  endTime: string | null;
  status: "scheduled" | "cancelled" | "completed";
  rescheduledAt?: string | null;
  enrollment: {
    course: { name: string };
    student: { profile: { firstName: string | null; lastName: string | null } };
  };
  teacher: { profile: { firstName: string | null; lastName: string | null } };
};
type Enrollment = {
  id: string;
  studentId: string;
  courseId: string;
  course: { name: string };
  student: { profile: { firstName: string | null; lastName: string | null } };
};
const pageSize = 25;
export function Lessons({
  role,
  onFailure,
}: {
  role: string;
  onFailure: (error: unknown) => void;
}) {
  return role === "student" ? (
    <StudentLessons onFailure={onFailure} />
  ) : (
    <StaffLessons role={role} onFailure={onFailure} />
  );
}
function StaffLessons({
  role,
  onFailure,
}: {
  role: string;
  onFailure: (error: unknown) => void;
}) {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [enrollmentId, setEnrollmentId] = useState("");
  const [date, setDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [startTime, setStart] = useState("");
  const [endTime, setEnd] = useState("");
  const staff = role === "admin" || role === "manager";
  async function load(page: number) {
    setBusy(true);
    setError("");
    try {
      setLessons(
        await schoolRequest<Lesson[]>(
          `/lessons?limit=${pageSize}&offset=${page}`,
        ),
      );
      setOffset(page);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load lessons");
      if (e instanceof SessionExpiredError) onFailure(e);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load(0);
  }, []);
  async function mutate(path: string, method: string, body: unknown) {
    setBusy(true);
    setError("");
    try {
      await schoolRequest(path, method, body);
      setEditing(null);
      await load(offset);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save lesson");
      if (e instanceof SessionExpiredError) onFailure(e);
    } finally {
      setBusy(false);
    }
  }
  async function confirmStatus(
    lesson: Lesson,
    status: "cancelled" | "completed",
  ) {
    setBusy(true);
    setError("");
    try {
      const options = await schoolRequest<{
        seriesCount: number;
        earlier: { id: string; date: string; startTime: string }[];
      }>(`/lessons/${lesson.id}/status-options`);
      const apply = (scope: "one" | "all") => {
        const save = (includeEarlier: boolean) =>
          void mutate(`/lessons/${lesson.id}`, "PATCH", {
            status,
            scope,
            ...(status === "completed" ? { includeEarlier } : {}),
          });
        if (status === "completed" && options.earlier.length)
          Alert.alert(
            "Earlier unfinished lessons",
            `${options.earlier.length} earlier lessons for this student and course have ended but are still scheduled.\n${options.earlier
              .slice(0, 5)
              .map((row) => `${row.date} ${row.startTime}`)
              .join("\n")}\nComplete them too?`,
            [
              { text: "Go back", style: "cancel" },
              { text: "Skip earlier lessons", onPress: () => save(false) },
              {
                text: "Complete earlier lessons too",
                onPress: () => save(true),
              },
            ],
          );
        else save(false);
      };
      Alert.alert(
        status === "completed" ? "Complete lessons?" : "Cancel lessons?",
        "Choose which scheduled lessons to update. All means this recurring series, including earlier and future dates.",
        [
          { text: "Go back", style: "cancel" },
          { text: "Just this lesson", onPress: () => apply("one") },
          ...(options.seriesCount > 1
            ? [
                {
                  text: `All ${options.seriesCount} lessons in this series`,
                  onPress: () => apply("all"),
                },
              ]
            : []),
        ],
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to check related lessons",
      );
      if (e instanceof SessionExpiredError) onFailure(e);
    } finally {
      setBusy(false);
    }
  }
  async function newLesson() {
    setBusy(true);
    setError("");
    try {
      const all: Enrollment[] = [];
      for (let skip = 0; ; skip += 100) {
        const page = await schoolRequest<Enrollment[]>(
          `/enrollments?limit=100&offset=${skip}`,
        );
        all.push(...page);
        if (page.length < 100) break;
      }
      setEnrollments(all);
      setEnrollmentId("");
      setEditing("new");
      setDate("");
      setEndDate("");
      setAllDay(false);
      setStart("");
      setEnd("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load enrollments");
      if (e instanceof SessionExpiredError) onFailure(e);
    } finally {
      setBusy(false);
    }
  }
  const button = (label: string, action: () => void) => (
    <Pressable
      accessibilityRole="button"
      disabled={busy}
      onPress={action}
      style={{ paddingVertical: 9 }}
    >
      <Text style={{ color: "#f5f5f3", fontWeight: "600" }}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={{ gap: 12 }}>
      <Text style={{ fontSize: 22, color: "#f5f5f3", fontWeight: "600" }}>
        {role === "teacher"
          ? "Your teaching schedule"
          : staff
            ? "School lessons"
            : "Your lessons"}
      </Text>
      <Text style={{ color: "#b5b5b5" }}>
        Dates and times use the school’s local time (Asia/Baku).
      </Text>
      {button("Refresh lessons", () => {
        void load(offset);
      })}
      {(staff || role === "teacher") &&
        button("Schedule a lesson", () => {
          void newLesson();
        })}
      {busy && <ActivityIndicator color="#245e50" />}
      {!!error && !editing && (
        <Text accessibilityRole="alert" style={{ color: "#ff9b90" }}>
          {error}
        </Text>
      )}
      {!busy && !lessons.length && <Text style={{ color: "#f5f5f3" }}>No lessons on this page.</Text>}
      {editing && (
        <View
          style={{
            gap: 10,
            padding: 14,
            borderWidth: 1,
            borderColor: "#3d3d3d",
            borderRadius: 10,
          }}
        >
          <Text style={{ color: "#f5f5f3", fontWeight: "600" }}>
            {editing === "new" ? "New lesson" : "Reschedule lesson"}
          </Text>
          {editing === "new" && (
            <>
              <Text style={{ color: "#f5f5f3" }}>Select an enrollment (student / course)</Text>
              {enrollments.length === 0 && (
                <Text style={{ color: "#f5f5f3" }}>Create an enrollment before scheduling a lesson.</Text>
              )}
              {enrollments.map((e) => (
                <Pressable
                  key={e.id}
                  disabled={busy}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: enrollmentId === e.id }}
                  onPress={() => setEnrollmentId(e.id)}
                  style={{
                    padding: 8,
                    backgroundColor:
                      enrollmentId === e.id ? "#d9e8d4" : "#f6f5ef",
                  }}
                >
                  <Text style={{ color: "#f5f5f3" }}>
                    {[e.student.profile.firstName, e.student.profile.lastName]
                      .filter(Boolean)
                      .join(" ") || e.studentId}{" "}
                    / {e.course.name}
                  </Text>
                </Pressable>
              ))}
            </>
          )}
          {(
            [
              ["Date (YYYY-MM-DD)", date, setDate],
              ["End date (blank for same day)", endDate, setEndDate],
              ["Start (HH:MM)", startTime, setStart],
              ["End (HH:MM)", endTime, setEnd],
            ] as const
          ).map(([label, value, update]) => (
            <View key={label}>
              <Text style={{ color: "#f5f5f3" }}>{label}</Text>
              <TextInput
                accessibilityLabel={label}
                editable={!busy}
                value={value}
                onChangeText={update}
                placeholder={label}
                style={{
                  padding: 10,
                  borderWidth: 1,
                  borderColor: "#3d3d3d",
                  borderRadius: 6,
                }}
              />
            </View>
          ))}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Text style={{ color: "#f5f5f3" }}>All day</Text>
            <Switch
              accessibilityLabel="All day"
              disabled={busy}
              value={allDay}
              onValueChange={setAllDay}
            />
          </View>
          {!!error && (
            <Text accessibilityRole="alert" style={{ color: "#ff9b90" }}>
              {error}
            </Text>
          )}
          {button("Save lesson", () => {
            if (
              !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
              (endDate &&
                (!/^\d{4}-\d{2}-\d{2}$/.test(endDate) || endDate < date)) ||
              (!allDay &&
                (!/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime) ||
                  !/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime) ||
                  ((endDate || date) === date && endTime <= startTime))) ||
              (editing === "new" && !enrollmentId)
            ) {
              setError(
                "Select an enrollment and enter a valid date and time range.",
              );
              return;
            }
            void mutate(
              editing === "new" ? "/lessons" : `/lessons/${editing}`,
              editing === "new" ? "POST" : "PATCH",
              {
                date,
                endDate: endDate || date,
                allDay,
                startTime: allDay ? "00:00" : startTime,
                endTime: allDay ? "00:00" : endTime,
                ...(editing === "new" ? { enrollmentId } : {}),
              },
            );
          })}
          {button("Close", () => setEditing(null))}
        </View>
      )}
      {lessons.map((lesson) => (
        <View
          key={lesson.id}
          style={{
            padding: 14,
            backgroundColor: "#272727",
            borderRadius: 10,
            gap: 6,
          }}
        >
          <Text style={{ color: "#f5f5f3", fontWeight: "600" }}>
            {lesson.enrollment.course.name}
          </Text>
          <Text style={{ color: "#f5f5f3" }}>
            {lesson.date}
            {lesson.endDate && lesson.endDate !== lesson.date
              ? ` – ${lesson.endDate}`
              : ""}{" "}
            ·{" "}
            {lesson.allDay
              ? "All day"
              : `${lesson.startTime}–${lesson.endTime || "End unspecified"}`}
          </Text>
          <Text style={{ color: "#f5f5f3" }}>
            Student:{" "}
            {[
              lesson.enrollment.student.profile.firstName,
              lesson.enrollment.student.profile.lastName,
            ]
              .filter(Boolean)
              .join(" ") || "Student"}
          </Text>
          <Text style={{ color: "#f5f5f3" }}>
            Teacher:{" "}
            {[lesson.teacher.profile.firstName, lesson.teacher.profile.lastName]
              .filter(Boolean)
              .join(" ") || "Teacher"}
          </Text>
          <LessonBadge lesson={lesson} />
          {button("Delete lesson", () =>
            Alert.alert(
              "Delete lesson?",
              "Permanently remove this lesson or every lesson you can manage in its recurring series? Lessons with progress records, performance evaluations, or rescheduling history cannot be deleted.",
              [
                { text: "Go back", style: "cancel" },
                {
                  text: "Just this lesson",
                  style: "destructive",
                  onPress: () => {
                    void mutate(
                      `/lessons/${lesson.id}?scope=one`,
                      "DELETE",
                      undefined,
                    );
                  },
                },
                ...(lesson.seriesId
                  ? [
                      {
                        text: "All lessons in this series",
                        style: "destructive" as const,
                        onPress: () => {
                          void mutate(
                            `/lessons/${lesson.id}?scope=all`,
                            "DELETE",
                            undefined,
                          );
                        },
                      },
                    ]
                  : []),
              ],
            ),
          )}
          {role !== "student" && lesson.status === "scheduled" && (
            <View>
              {button("Reschedule", () => {
                setEditing(lesson.id);
                setDate(lesson.date);
                setEndDate(lesson.endDate || lesson.date);
                setAllDay(!!lesson.allDay);
                setStart(lesson.startTime);
                setEnd(lesson.endTime || "");
              })}
              {button("Mark completed", () => {
                void confirmStatus(lesson, "completed");
              })}
              {button("Cancel lesson", () => {
                void confirmStatus(lesson, "cancelled");
              })}
            </View>
          )}
        </View>
      ))}
      <View style={{ flexDirection: "row", gap: 20 }}>
        {offset > 0 &&
          button("Previous", () => {
            void load(Math.max(0, offset - pageSize));
          })}
        {lessons.length === pageSize &&
          button("Next", () => {
            void load(offset + pageSize);
          })}
      </View>
    </View>
  );
}
