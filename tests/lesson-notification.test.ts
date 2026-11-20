import { expect, test } from "bun:test";
import { lessonSchedule, studentName } from "../src/shared/lesson-notification";

test("notification names handle missing surnames and trim whitespace", () => {
  expect(studentName({ firstName: " Aysel ", lastName: " Aliyeva " })).toBe("Aysel Aliyeva");
  expect(studentName({ firstName: "Aysel", lastName: null })).toBe("Aysel");
});

test("notification schedules distinguish overnight, all-day and open-ended lessons", () => {
  const slot = { date: "2026-11-20", endDate: "2026-11-21", startTime: "23:00", endTime: "01:00" };
  expect(lessonSchedule(slot)).toBe("2026-11-20 · 23:00–2026-11-21 01:00 (Asia/Baku)");
  expect(lessonSchedule({ ...slot, allDay: true })).toBe("2026-11-20–2026-11-21 · All day (Asia/Baku)");
  expect(lessonSchedule({ ...slot, endTime: null })).toContain("end time not set");
});
