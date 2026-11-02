import { expect, test } from "bun:test";
import { workingMinutes, workingRanges, subtractBookings } from "../src/teacher-hours";
import { calendarOpenings } from "../src/modules/rescheduling/calendar";
import { dates } from "../src/modules/lessons/service";

test("Sayad working windows follow weekdays, Saturday, Sunday in Baku", () => {
  expect(workingMinutes("Sayad", "2026-11-02")).toEqual([[600, 660], [900, 1410]]);
  expect(workingMinutes("Sayad", "2026-11-07")).toEqual([[750, 1410]]);
  expect(workingMinutes("Sayad", "2026-11-08")).toEqual([]);
  expect(workingMinutes("Other teacher", "2026-11-02")).toEqual([]);
  expect(workingRanges("Sayad", "2026-11-07")[0]!.startsAt.toISOString()).toBe("2026-11-07T08:30:00.000Z");
});
test("Sultanbanu works configured Baku hours except Wednesday and Sunday", () => {
  for (const date of ["2026-11-02", "2026-11-03", "2026-11-05", "2026-11-06"]) expect(workingMinutes("Sultanbanu", date)).toEqual([[600, 660], [960, 1320]]);
  expect(workingMinutes("Sultanbanu", "2026-11-07")).toEqual([[960, 1320]]);
  for (const date of ["2026-11-04", "2026-11-08"]) expect(workingMinutes("Sultanbanu", date)).toEqual([]);
});

test("Sultanbanu calendar automatically exposes time released by a booking", async () => {
  let lessons = [{ ...dates({ date: "2026-11-02", startTime: "16:00", endTime: "18:00" }) }];
  const db: any = {
    teacher: { findUnique: async () => ({ profile: { firstName: "Sultanbanu" } }) },
    lesson: { findMany: async (args: any) => { expect(args.where.OR[0]).toEqual({ teacherId: "sultanbanu" }); return lessons; } },
    trialRequest: { findMany: async () => [] },
  };
  const read = () => calendarOpenings(db, "sultanbanu", "student", 60, 0, new Date("2026-11-02T00:00:00+04:00"));
  const before = await read();
  expect(before.scheduleConfigured).toBe(true);
  expect(before.items.filter(i => i.startsAt.toISOString().startsWith("2026-11-02")).map(i => i.startsAt.toISOString())).toEqual(["2026-11-02T06:00:00.000Z", "2026-11-02T14:00:00.000Z"]);
  expect(before.items.some(i => ["2026-11-04", "2026-11-08"].includes(i.startsAt.toISOString().slice(0, 10)))).toBe(false);
  lessons = [];
  const after = await read();
  expect(after.items[1]!.startsAt.toISOString()).toBe("2026-11-02T12:00:00.000Z");
  expect(after.items[1]!.endsAt.toISOString()).toBe("2026-11-02T18:00:00.000Z");
});

test("calendar subtraction merges overlapping bookings and keeps only full-hour gaps", () => {
  const range = (a: string, b: string) => ({ startsAt: new Date(`2026-11-02T${a}:00+04:00`), endsAt: new Date(`2026-11-02T${b}:00+04:00`) });
  const free = subtractBookings(workingRanges("Sayad", "2026-11-02"), [range("15:00", "16:00"), range("15:30", "16:30"), range("18:00", "18:45"), range("22:30", "23:30")], 60, new Date("2026-11-02T00:00:00+04:00"));
  expect(free).toEqual([range("10:00", "11:00"), range("16:30", "18:00"), range("18:45", "22:30")]);
  expect(subtractBookings(workingRanges("Sayad", "2026-11-02"), [], 120, new Date("2026-11-02T15:06:00+04:00"))).toEqual([range("15:15", "23:30")]);
});
test("calendar free ranges come from lessons and held trials without availability-slot reads", async () => {
  const db: any = {
    teacher: { findUnique: async () => ({ profile: { firstName: "Sayad" } }) },
    lesson: { findMany: async (args: any) => {
      expect(args.where.status.notIn).toContain("cancelled");
      expect(args.where.OR).toEqual([{ teacherId: "teacher" }, { enrollment: { studentId: "student" } }]);
      return [{ ...dates({ date: "2026-11-02", startTime: "15:00", endTime: "17:00" }) }];
    } },
    trialRequest: { findMany: async (args: any) => { expect(args.where.status.in).toEqual(["pending", "approved"]); return [{ slot: { startsAt: new Date("2026-11-02T18:00:00+04:00"), endsAt: new Date("2026-11-02T18:15:00+04:00") } }]; } },
    availabilitySlot: { findMany: async () => { throw new Error("Manual publishing must not be required"); } },
  };
  const result = await calendarOpenings(db, "teacher", "student", 60, 0, new Date("2026-11-02T00:00:00+04:00"));
  const monday = result.items.filter(i => i.startsAt.toISOString().startsWith("2026-11-02"));
  expect(monday).toHaveLength(3);
  expect(monday.map(i => i.startsAt.toISOString())).toEqual(["2026-11-02T06:00:00.000Z", "2026-11-02T13:00:00.000Z", "2026-11-02T14:15:00.000Z"]);
  expect(result.items.some(i => i.startsAt.toISOString().startsWith("2026-11-08"))).toBe(false);
  expect(result.hasMore).toBe(true); expect(result.nextOffset).toBe(7);
});
