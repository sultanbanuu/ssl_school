import React, { useEffect, useId, useRef, useState } from "react";

type Student = {
  id: string;
  status: string;
  profile: { firstName: string | null; lastName: string | null };
};
const label = (student: Student) =>
  [student.profile.firstName, student.profile.lastName]
    .filter(Boolean)
    .join(" ") || "Unnamed student";
export function StudentPicker({
  students,
  value,
  onChange,
}: {
  students: Student[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(-1);
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const tokens = query.trim().toLocaleLowerCase().split(/\s+/);
  const filtered = students.filter((student) =>
    tokens.every((token) => label(student).toLocaleLowerCase().includes(token)),
  );
  const selected = students.find((student) => student.id === value);
  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);
  useEffect(() => {
    root.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);
  function choose(student: Student) {
    if (student.status !== "active") return;
    onChange(student.id);
    setOpen(false);
    trigger.current?.focus();
  }
  return (
    <div
      className="student-picker"
      ref={root}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node))
          setOpen(false);
      }}
    >
      <label id={`${id}-label`}>Student</label>
      <button
        ref={trigger}
        type="button"
        className="student-picker-trigger"
        aria-labelledby={`${id}-label ${id}-value`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        onClick={() => {
          setQuery("");
          setActive(-1);
          setOpen(!open);
        }}
      >
        <span id={`${id}-value`}>
          {selected ? label(selected) : "Select a student"}
        </span>
        <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div
          className="student-picker-menu"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              setOpen(false);
              trigger.current?.focus();
            }
          }}
        >
          <input
            ref={input}
            role="combobox"
            aria-label="Search students"
            aria-autocomplete="list"
            aria-expanded={true}
            aria-controls={`${id}-list`}
            aria-activedescendant={
              active >= 0 ? `${id}-option-${active}` : undefined
            }
            placeholder="Search name or surname…"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(-1);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                const direction = event.key === "ArrowDown" ? 1 : -1;
                for (let i = 1; i <= filtered.length; i++) {
                  const next =
                    (active + direction * i + filtered.length) %
                    filtered.length;
                  if (filtered[next].status === "active") {
                    setActive(next);
                    break;
                  }
                }
              } else if (event.key === "Enter") {
                event.preventDefault();
                if (active >= 0 && filtered[active]) choose(filtered[active]);
              }
            }}
          />
          <div
            id={`${id}-list`}
            role="listbox"
            aria-label="Students"
            className="student-picker-options"
          >
            {filtered.map((student, index) => (
              <div
                key={student.id}
                id={`${id}-option-${index}`}
                role="option"
                aria-selected={student.id === value}
                aria-disabled={student.status !== "active"}
                data-active={index === active}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(student)}
              >
                {label(student)}
                {student.status !== "active" && <small> · Inactive</small>}
              </div>
            ))}
            {!filtered.length && <p role="status">No students found.</p>}
          </div>
          <small>{filtered.length} students</small>
        </div>
      )}
    </div>
  );
}
