// Calendar arithmetic uses civil dates, independent of the browser/server timezone.
export const DAY = 86400000;
export type Schedule = {
  date: string;
  endDate?: string;
  startTime: string;
  endTime: string;
  allDay?: boolean;
};
export type RepeatRule = {
  frequency: "daily" | "weekly";
  interval: number;
  weekdays?: number[];
  until: string;
};
export const dayNumber = (date: string) => Date.parse(`${date}T00:00:00Z`);
export const addDays = (date: string, days: number) =>
  new Date(dayNumber(date) + days * DAY).toISOString().slice(0, 10);
export const minutes = (time: string) =>
  Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
export const timeString = (value: number) =>
  `${Math.floor(value / 60)
    .toString()
    .padStart(2, "0")}:${(value % 60).toString().padStart(2, "0")}`;
export function bounds(slot: Schedule): [number, number] {
  return slot.allDay
    ? [dayNumber(slot.date), dayNumber(addDays(slot.endDate || slot.date, 1))]
    : [
        dayNumber(slot.date) + minutes(slot.startTime) * 60000,
        dayNumber(slot.endDate || slot.date) + minutes(slot.endTime) * 60000,
      ];
}
export function occurrences(slot: Schedule, rule?: RepeatRule): Schedule[] {
  if (!rule) return [slot];
  const span =
    (dayNumber(slot.endDate || slot.date) - dayNumber(slot.date)) / DAY;
  const result: Schedule[] = [];
  const startDay = new Date(dayNumber(slot.date)).getUTCDay();
  for (
    let date = slot.date, i = 0;
    date <= rule.until;
    date = addDays(date, 1), i++
  ) {
    const weekday = new Date(dayNumber(date)).getUTCDay();
    const week = Math.floor((i + ((startDay + 6) % 7)) / 7);
    if (
      rule.frequency === "daily"
        ? i % rule.interval === 0
        : week % rule.interval === 0 &&
          (rule.weekdays || [startDay]).includes(weekday)
    ) {
      result.push({ ...slot, date, endDate: addDays(date, span) });
      if (result.length > 366)
        throw new Error("A series may contain at most 366 lessons");
    }
  }
  return result;
}
export function movedSlot(
  slot: Schedule,
  date: string,
  startTime: string,
): Schedule {
  const [start, end] = bounds(slot);
  if (slot.allDay)
    return { ...slot, date, endDate: addDays(date, (end - start) / DAY - 1) };
  const finish = dayNumber(date) + minutes(startTime) * 60000 + end - start;
  return {
    ...slot,
    date,
    startTime,
    endDate: new Date(finish).toISOString().slice(0, 10),
    endTime: new Date(finish).toISOString().slice(11, 16),
  };
}
