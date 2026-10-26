import React from "react";
import { minutes, timeString, type Schedule } from "../src/scheduling";

export function TimeRangePicker({ value, disabled, onChange }: { value: Schedule; disabled: boolean; onChange: (value: Schedule) => void }) {
  const start = minutes(value.startTime);
  const end = minutes(value.endTime);
  function changeStart(next: number) {
    onChange({ ...value, startTime: timeString(next), endDate: value.date, endTime: timeString(Math.min(1410, Math.max(next + 15, end))) });
  }
  function changeEnd(next: number) {
    onChange({ ...value, startTime: timeString(Math.max(600, Math.min(start, next - 15))), endDate: value.date, endTime: timeString(next) });
  }
  return <div className="time-picker" aria-label="Drag to choose lesson time">
    <div className="time-picker-heading"><strong>Choose time</strong><span>Drag · 15-minute steps</span></div>
    <label className="time-slider-label" htmlFor="start-time-slider">Start <output>{value.startTime}</output></label>
    <input id="start-time-slider" aria-label="Start time" aria-valuetext={value.startTime} type="range" min={600} max={1395} step={15} value={start} disabled={disabled} onChange={e => changeStart(Number(e.target.value))} />
    <div className="time-ticks"><span>10:00</span><span>14:00</span><span>18:00</span><span>23:15</span></div>
    <label className="time-slider-label" htmlFor="end-time-slider">End <output>{value.endTime}</output></label>
    <input id="end-time-slider" aria-label="End time" aria-valuetext={value.endTime} type="range" min={615} max={1410} step={15} value={end} disabled={disabled} onChange={e => changeEnd(Number(e.target.value))} />
    <div className="time-ticks"><span>10:15</span><span>14:00</span><span>18:00</span><span>23:30</span></div>
    <small>School hours: 10:00–23:30. Use the arrow keys for precise adjustments.</small>
  </div>;
}
