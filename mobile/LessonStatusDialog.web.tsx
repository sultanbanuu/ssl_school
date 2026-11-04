import React, { useEffect, useRef, useState } from "react";
import { schoolRequest, SessionExpiredError } from "./auth-client";

export type StatusAction = {
  id: string;
  status: "cancelled" | "completed" | "deleted";
  seriesId?: string | null;
  label: string;
};
type Earlier = {
  id: string;
  date: string;
  startTime: string;
  endTime: string | null;
  allDay?: boolean;
  seriesId?: string | null;
};
export function LessonStatusDialog({
  action,
  busy,
  error,
  onClose,
  onConfirm,
  onFailure,
}: {
  action: StatusAction;
  busy: boolean;
  error: string;
  onClose: () => void;
  onConfirm: (body: {
    status: "cancelled" | "completed" | "deleted";
    scope: "one" | "all";
    includeEarlier?: boolean;
  }) => void;
  onFailure: (error: unknown) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [scope, setScope] = useState<"one" | "all">("one");
  const [includeEarlier, setIncludeEarlier] = useState(false);
  const [options, setOptions] = useState<{
    earlier: Earlier[];
    seriesCount: number;
    deleteCount?: number;
  } | null>(null);
  const [loadError, setLoadError] = useState("");
  const [revision, setRevision] = useState(0);
  const onFailureRef = useRef(onFailure);
  onFailureRef.current = onFailure;
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  useEffect(() => {
    let disposed = false;
    setLoadError("");
    setOptions(null);
    schoolRequest<{
      earlier: Earlier[];
      seriesCount: number;
      deleteCount?: number;
    }>(`/lessons/${action.id}/status-options`)
      .then((result) => {
        if (!disposed) setOptions(result);
      })
      .catch((e) => {
        if (!disposed) {
          setLoadError(
            e instanceof Error ? e.message : "Unable to check related lessons",
          );
          if (e instanceof SessionExpiredError) onFailureRef.current(e);
        }
      });
    return () => {
      disposed = true;
    };
  }, [action.id, revision]);
  const deleting = action.status === "deleted";
  const count = deleting
    ? options?.deleteCount || 0
    : options?.seriesCount || 0;
  const completing = action.status === "completed";
  const earlier = (options?.earlier || []).filter(
    (row) => scope !== "all" || row.seriesId !== action.seriesId,
  );
  return (
    <dialog
      ref={dialog}
      className="lesson-dialog status-dialog"
      aria-labelledby="status-title"
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else onClose();
      }}
    >
      <div className="dialog-head">
        <h2 id="status-title">
          {deleting
            ? "Delete lessons?"
            : completing
              ? "Complete lessons?"
              : "Cancel lessons?"}
        </h2>
        <button
          type="button"
          className="close"
          aria-label="Close confirmation"
          disabled={busy}
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <p>{action.label}</p>
      {deleting && (
        <p>
          Deletion is permanent and removes the selected lessons from student
          cards too.
        </p>
      )}
      {!options && !loadError && <p role="status">Checking related lessons…</p>}
      {loadError && (
        <div role="alert">
          <p className="error">{loadError}</p>
          <button type="button" onClick={() => setRevision((v) => v + 1)}>
            Retry checking lessons
          </button>
        </div>
      )}
      {options && (
        <fieldset disabled={busy}>
          <legend>Apply this action to</legend>
          <label className="status-choice">
            <input
              type="radio"
              name="status-scope"
              checked={scope === "one"}
              onChange={() => setScope("one")}
            />
            Just this lesson
          </label>
          {!!action.seriesId && count > 1 && (
            <>
              <label className="status-choice">
                <input
                  type="radio"
                  name="status-scope"
                  checked={scope === "all"}
                  onChange={() => setScope("all")}
                />
                All {count} {deleting ? "lessons" : "scheduled lessons"} in this
                series
              </label>
              <p>
                {deleting
                  ? "Permanently deletes every lesson you can manage in this series, including earlier, future, completed and cancelled lessons. If any has progress records, performance evaluations, or rescheduling history, nothing is deleted."
                  : "This includes earlier and future dates in this recurring series. Completed and cancelled lessons stay unchanged."}
              </p>
            </>
          )}
          {completing && earlier.length > 0 && (
            <div className="unfinished-lessons">
              <h3>
                {earlier.length} earlier unfinished{" "}
                {earlier.length === 1 ? "lesson" : "lessons"}
              </h3>
              <p>
                These lessons for the same student and course have already ended
                but are still marked scheduled.
              </p>
              <ul>
                {earlier.map((row) => (
                  <li key={row.id}>
                    {row.date} ·{" "}
                    {row.allDay
                      ? "All day"
                      : `${row.startTime}–${row.endTime || "End unspecified"}`}
                  </li>
                ))}
              </ul>
              <label className="status-choice">
                <input
                  type="radio"
                  name="earlier-action"
                  checked={!includeEarlier}
                  onChange={() => setIncludeEarlier(false)}
                />
                Skip earlier lessons
              </label>
              <label className="status-choice">
                <input
                  type="radio"
                  name="earlier-action"
                  checked={includeEarlier}
                  onChange={() => setIncludeEarlier(true)}
                />
                Complete all these earlier lessons too
              </label>
            </div>
          )}
          {completing && !earlier.length && (
            <p>
              No other earlier unfinished lessons for this student and course.
            </p>
          )}
        </fieldset>
      )}
      {!!error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="dialog-footer">
        <button type="button" disabled={busy} onClick={onClose}>
          Go back
        </button>
        <button
          type="button"
          className={completing ? "save" : "danger"}
          disabled={busy || !options}
          onClick={() =>
            onConfirm({
              status: action.status,
              scope,
              ...(completing
                ? { includeEarlier: includeEarlier && earlier.length > 0 }
                : {}),
            })
          }
        >
          {busy
            ? "Saving…"
            : deleting
              ? "Confirm deletion"
              : completing
                ? "Confirm completion"
                : "Confirm cancellation"}
        </button>
      </div>
    </dialog>
  );
}
