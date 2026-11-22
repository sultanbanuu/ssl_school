import React from "react";

type Props = { label: string; value: number; max: number; onChange: (value: number) => void };

export function LessonCountSlider({ label, value, max, onChange }: Props) {
  return (
    <input
      type="range"
      aria-label={label}
      min={1}
      max={max}
      value={value}
      onChange={(event) => onChange(Number(event.currentTarget.value))}
      style={{ display: "block", width: "100%", height: 44, margin: 0, outline: "none", accentColor: "#bce6d1", cursor: "pointer", touchAction: "pan-y" }}
    />
  );
}
