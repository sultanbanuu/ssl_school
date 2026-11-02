import React, { useEffect, useRef, useState } from "react";
import {
  AppState,
  Platform,
} from "react-native";
import { schoolRequest, SessionExpiredError } from "./auth-client";

import { StudentLessonViews, type StudentLesson } from "./StudentLessonViews";

// Both native and web students read the same scoped records edited by staff.
export function StudentLessons({
  onFailure,
}: {
  onFailure: (error: unknown) => void;
}) {
  const [lessons, setLessons] = useState<StudentLesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const onFailureRef = useRef(onFailure);
  onFailureRef.current = onFailure;
  const refresh = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    let disposed = false,
      pending = false;
    async function load() {
      if (
        disposed ||
        pending ||
        AppState.currentState === "background" ||
        AppState.currentState === "inactive"
      )
        return;
      pending = true;
      try {
        const all: StudentLesson[] = [];
        for (let offset = 0; ; offset += 100) {
          const page = await schoolRequest<StudentLesson[]>(
            `/lessons?limit=100&offset=${offset}`,
          );
          if (disposed) return;
          all.push(...page);
          if (page.length < 100) break;
        }
        setLessons([...new Map(all.map((row) => [row.id, row])).values()]);
        setError("");
      } catch (e) {
        if (!disposed) {
          setError(
            e instanceof Error
              ? e.message
              : "Unable to refresh lessons. Please try again.",
          );
          if (e instanceof SessionExpiredError) onFailureRef.current(e);
        }
      } finally {
        pending = false;
        if (!disposed) setLoading(false);
      }
    }
    refresh.current = load;
    void load();
    const timer = setInterval(() => void load(), 15000);
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void load();
    });
    const focus = () => {
      void load();
    };
    if (Platform.OS === "web") window.addEventListener("focus", focus);
    return () => {
      disposed = true;
      clearInterval(timer);
      sub.remove();
      if (Platform.OS === "web") window.removeEventListener("focus", focus);
    };
  }, []);
  return <StudentLessonViews lessons={lessons} loading={loading} error={error} refresh={() => void refresh.current()} />;
}

