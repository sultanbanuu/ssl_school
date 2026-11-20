type LessonSchedule = {
  date: string;
  endDate?: string;
  startTime: string;
  endTime: string | null;
  allDay?: boolean;
};

export function studentName(profile: { firstName: string | null; lastName: string | null }) {
  return [profile.firstName, profile.lastName].map(part => part?.trim()).filter(Boolean).join(" ") || "Student";
}

export function lessonSchedule(slot: LessonSchedule) {
  const endDate = slot.endDate && slot.endDate !== slot.date ? slot.endDate : "";
  if (slot.allDay) return `${slot.date}${endDate ? `–${endDate}` : ""} · All day (Asia/Baku)`;
  return `${slot.date} · ${slot.startTime}${slot.endTime ? `–${endDate ? `${endDate} ` : ""}${slot.endTime}` : " (end time not set)"} (Asia/Baku)`;
}
