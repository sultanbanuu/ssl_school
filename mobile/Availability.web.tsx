import React, { useEffect, useRef, useState } from "react";
import { timeString } from "../src/scheduling";
import { calendarCSS } from "./calendar-style";
import { AppointmentPicker } from "./AppointmentPicker";
import { StudentLessons } from "./StudentLessons";
import { TimeRangePicker } from "./TimeRangePicker.web";
import {
  civil,
  fullName,
  schoolToday,
  slotDraft,
  useAvailability,
  type AvailabilityDraft,
  type AvailabilitySlot,
} from "./useAvailability";

export function Availability({
  role,
  onFailure,
}: {
  role: string;
  onFailure: (error: unknown) => void;
}) {
  const state = useAvailability(role, onFailure);
  const [teacher, setTeacher] = useState("");
  const [selected, setSelected] = useState<AvailabilitySlot | null>(null);
  const [draft, setDraft] = useState<AvailabilityDraft | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const { week, setWeek, managing, busy } = state;
  const visible = state.slots.filter(
    (slot) => slot.active && (!teacher || slot.teacherId === teacher),
  );
  const people = managing
    ? state.teachers
    : [
        ...new Map(
          state.slots.map((slot) => [slot.teacherId, slot.teacher]),
        ).values(),
      ];
  useEffect(() => {
    if (selected || draft) dialog.current?.showModal();
    else dialog.current?.close();
  }, [selected, draft]);
  function close() {
    if (!busy) {
      setSelected(null);
      setDraft(null);
      state.setError("");
    }
  }
  function newSlot(date = schoolToday(), start = 600, end = 615) {
    const teacherId =
      teacher || (role === "teacher" ? state.teachers[0]?.id || "" : "");
    state.setError("");
    setSelected(null);
    setDraft({
      teacherId,
      courseId: "",
      date,
      startTime: timeString(start),
      endTime: timeString(end),
    });
  }
  function selectSlot(slot: AvailabilitySlot) {
    state.setError("");
    setSelected(slot);
    setDraft(managing ? slotDraft(slot) : null);
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!draft) return;
    const { id: draftId, ...body } = draft;
    const id = draftId?.startsWith("auto:") ? undefined : draftId;
    body.endTime = timeString(
      Number(body.startTime.slice(0, 2)) * 60 +
        Number(body.startTime.slice(3)) +
        15,
    );
    if (
      await state.mutate(
        id ? `/availability/${id}` : "/availability",
        id ? "PATCH" : "POST",
        body,
        id ? "Availability updated." : "Availability published.",
      )
    ) {
      setDraft(null);
      setSelected(null);
    }
  }
  async function remove() {
    const id = draft?.id;
    if (!id || busy) return;
    if (
      !window.confirm(
        selected?.reservation
          ? "Delete this availability and cancel its pending or confirmed trial? Trial history will be kept."
          : "Delete this availability? Students will no longer be able to request this time.",
      )
    )
      return;
    if (
      await state.mutate(
        `/availability/${encodeURIComponent(id)}`,
        "DELETE",
        undefined,
        "Availability deleted.",
      )
    ) {
      setDraft(null);
      setSelected(null);
    }
  }
  async function decide(id: string, status: string) {
    if (
      await state.mutate(
        `/trial-requests/${id}`,
        "PATCH",
        { status },
        status === "approved"
          ? "Trial confirmed."
          : status === "declined"
            ? "Trial request declined."
            : "Trial cancelled.",
      )
    ) {
      setSelected(null);
      setDraft(null);
    }
  }
  if (role === "student" && state.assigned === null)
    return <p role="status">{state.error || "Loading your schedule..."}</p>;
  if (role === "student" && state.assigned)
    return <StudentLessons onFailure={onFailure} />;
  return (
    <section className="school-calendar" aria-label="Teacher Availability">
      <style>{calendarCSS + availabilityCSS}</style>
      <div className="cal-heading">
        <div>
          <span className="cal-eyebrow">
            {managing ? "TRIAL LESSON SCHEDULING" : "YOUR FIRST LESSON"}
          </span>
          <h1>Teacher Availability</h1>
        </div>
      </div>
      <p className="cal-subtitle">
        {managing
          ? "Publish trial times, then review student requests. Choose Add availability to create a 15-minute slot."
          : "Meet your teacher before enrolling. Choose an available time and request a trial lesson."}{" "}
        All times are Azerbaijan time (GMT+4).
      </p>
      {state.error && !selected && !draft && (
        <p className="cal-message cal-error" role="alert">
          {state.error}
        </p>
      )}
      {state.notice && (
        <p role="status" className="cal-message">
          {state.notice}
        </p>
      )}
      <label className="availability-mobile-filter">
        Teacher
        <select
          aria-label="Filter availability teacher"
          value={teacher}
          onChange={(e) => setTeacher(e.target.value)}
        >
          <option value="">All teachers</option>
          {people.map((person) => (
            <option key={person.id} value={person.id}>
              {fullName(person.profile)}
            </option>
          ))}
        </select>
      </label>
      {managing && (
        <button
          type="button"
          className="cal-button cal-primary"
          disabled={busy}
          onClick={() => newSlot()}
        >
          Add availability
        </button>
      )}
      <AppointmentPicker
        onMonth={state.setCalendarMonth}
        week={week}
        onWeek={setWeek}
        slots={visible}
        onSelect={selectSlot}
        busy={busy}
        loading={state.loading}
      />
      <section className="trial-section" aria-label="Trial requests">
        <h2>{managing ? "Trial requests" : "My trial requests"}</h2>
        <p>
          {managing
            ? "Approve or decline pending trials. Confirmed trials reserve the teacher’s time."
            : "Pending requests need teacher approval. Approved requests are confirmed trial lessons."}
        </p>
        {!state.trials.length && <p>No trial requests yet.</p>}
        <div className="trial-cards">
          {state.trials.map((trial) => (
            <article
              className="trial-card"
              key={trial.id}
              data-trial-id={trial.id}
            >
              <div className="cal-actions">
                <strong>
                  {managing
                    ? fullName(trial.student.profile)
                    : fullName(trial.slot.teacher.profile)}
                </strong>
                <span className={`trial-status ${trial.status}`}>
                  {trial.status === "approved"
                    ? "Confirmed"
                    : trial.status === "pending"
                      ? "Awaiting approval"
                      : trial.status}
                </span>
              </div>
              <p>
                {trial.slot.course.name} ·{" "}
                {civil(trial.slot.startsAt).slice(0, 10)} ·{" "}
                {civil(trial.slot.startsAt).slice(11, 16)}–
                {civil(trial.slot.endsAt).slice(11, 16)}
              </p>
              {managing && (
                <p>Teacher: {fullName(trial.slot.teacher.profile)}</p>
              )}
              <div className="cal-actions">
                {managing && trial.status === "pending" && (
                  <>
                    <button
                      className="cal-button cal-primary"
                      disabled={busy}
                      onClick={() => void decide(trial.id, "approved")}
                    >
                      Approve trial
                    </button>
                    <button
                      className="cal-button"
                      disabled={busy}
                      onClick={() => void decide(trial.id, "declined")}
                    >
                      Decline
                    </button>
                  </>
                )}
                {["pending", "approved"].includes(trial.status) && (
                  <button
                    className="cal-button"
                    disabled={busy}
                    onClick={() => {
                      if (
                        window.confirm(
                          "Cancel this trial request? The time will become available again.",
                        )
                      )
                        void decide(trial.id, "cancelled");
                    }}
                  >
                    Cancel trial
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>
      <dialog
        className="lesson-dialog"
        ref={dialog}
        aria-labelledby="availability-dialog-title"
        onCancel={(e) => {
          if (busy) e.preventDefault();
          else close();
        }}
      >
        <div className="dialog-head">
          <h2 id="availability-dialog-title">
            {draft
              ? draft.id
                ? "Edit availability"
                : "Publish trial availability"
              : managing
                ? "Reserved trial slot"
                : "Request a trial lesson"}
          </h2>
          <button
            type="button"
            className="close"
            aria-label="Close availability editor"
            disabled={busy}
            onClick={close}
          >
            ×
          </button>
        </div>
        {draft ? (
          <form onSubmit={save}>
            <fieldset disabled={busy}>
              <label className="enrollment-label">
                Teacher
                <select
                  aria-label="Availability teacher"
                  required
                  disabled={role === "teacher"}
                  value={draft.teacherId}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      teacherId: e.target.value,
                      courseId: "",
                    })
                  }
                >
                  <option value="">Choose teacher</option>
                  {state.teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {fullName(t.profile)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="enrollment-label">
                Course
                <select
                  aria-label="Trial course"
                  required
                  value={draft.courseId}
                  onChange={(e) =>
                    setDraft({ ...draft, courseId: e.target.value })
                  }
                >
                  <option value="">Choose course</option>
                  {state.courses
                    .filter((c) => c.active && c.teacherId === draft.teacherId)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </label>
              {draft.teacherId &&
                !state.courses.some(
                  (c) => c.active && c.teacherId === draft.teacherId,
                ) && (
                  <p>
                    This teacher needs an active course before publishing
                    availability.
                  </p>
                )}
              <label>
                Date
                <input
                  aria-label="Availability date"
                  type="date"
                  required
                  min={schoolToday()}
                  value={draft.date}
                  onChange={(e) => setDraft({ ...draft, date: e.target.value })}
                />
              </label>
              <TimeRangePicker
                value={{ ...draft, endDate: draft.date, allDay: false }}
                disabled={busy}
                onChange={(value) =>
                  setDraft({
                    ...draft,
                    startTime: value.startTime,
                    endTime: value.endTime,
                  })
                }
              />
              <p>
                Trial slots last 15 minutes. Students request these times;
                approval confirms the trial.
              </p>
              <div className="dialog-footer">
                <button type="submit" className="save">
                  {busy
                    ? "Saving…"
                    : draft.id
                      ? "Save availability"
                      : "Publish availability"}
                </button>
              </div>
              {draft.id && (role === "teacher" || role === "admin") && (
                <button
                  type="button"
                  className="danger"
                  onClick={() => void remove()}
                >
                  Delete availability
                </button>
              )}
            </fieldset>
          </form>
        ) : (
          selected && (
            <>
              <p>
                <strong>{fullName(selected.teacher.profile)}</strong>
                <br />
                {selected.course.name}
                <br />
                {civil(selected.startsAt).slice(0, 10)} ·{" "}
                {civil(selected.startsAt).slice(11, 16)}–
                {civil(selected.endsAt).slice(11, 16)} · GMT+4
              </p>
              {managing ? (
                <p>
                  {selected.reservation?.status} ·{" "}
                  {selected.reservation &&
                    fullName(selected.reservation.student.profile)}
                  . Manage this request in Trial requests below.
                </p>
              ) : (
                <>
                  <p>
                    Your request will wait for teacher approval. This does not
                    enroll you in a course or create a regular schedule.
                  </p>
                  <button
                    type="button"
                    className="save"
                    disabled={busy}
                    onClick={() =>
                      void state
                        .mutate(
                          "/trial-requests",
                          "POST",
                          { slotId: selected.id },
                          "Trial requested. Waiting for teacher approval.",
                        )
                        .then((ok) => {
                          if (ok) setSelected(null);
                        })
                    }
                  >
                    {busy ? "Requesting…" : "Request trial lesson"}
                  </button>
                </>
              )}
            </>
          )
        )}
        {state.error && (
          <p className="error" role="alert">
            {state.error}
          </p>
        )}
      </dialog>
    </section>
  );
}
const availabilityCSS = `
.availability-mobile-filter{display:grid;gap:6px;max-width:320px;margin:16px 0;font-size:13px}
.availability-mobile-filter select{padding:12px;border:1px solid #dce4dd;border-radius:10px;background:white}
.school-calendar>.cal-primary{margin-bottom:14px;min-height:44px}
.trial-section{margin-top:28px}.trial-section h2{font-size:21px;margin-bottom:4px}.trial-section>p{color:#768078;font-size:12px}
.trial-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:14px}
.trial-card{border:1px solid #dce4dd;background:#fff;padding:16px;border-radius:12px}.trial-card p{font-size:12px;color:#64796b}
.trial-status{font-size:11px;padding:4px 8px;background:#edf1ee;border-radius:20px;text-transform:capitalize}.trial-status.pending{background:#faf0dd;color:#87672e}.trial-status.approved{background:#e5f0e8;color:#245d48}
@media(max-width:750px){.school-calendar .cal-actions{flex-wrap:wrap}.school-calendar .cal-button{min-height:44px}}
`;
