import { expect, test } from "bun:test";
import { lessonTimeOptions } from "../mobile/lesson-time-options";

test("rescheduling displays only exact lesson durations inside free ranges", () => {
  const ranges = [{ startsAt: "2026-11-03T16:00:00+04:00", endsAt: "2026-11-03T18:00:00+04:00" }, { startsAt: "2026-11-03T10:00:00+04:00", endsAt: "2026-11-03T11:00:00+04:00" }];
  for (const minutes of [60, 90]) {
    const choices = lessonTimeOptions(ranges, minutes);
    expect(choices).toHaveLength(minutes === 60 ? 4 : 2);
    for (const choice of choices) {
      expect([0, 30]).toContain(new Date(choice.startsAt).getUTCMinutes());
      expect(Date.parse(choice.endsAt) - Date.parse(choice.startsAt)).toBe(minutes * 60000);
      expect(ranges.some(range => Date.parse(choice.startsAt) >= Date.parse(range.startsAt) && Date.parse(choice.endsAt) <= Date.parse(range.endsAt))).toBe(true);
    }
  }
  expect(lessonTimeOptions(ranges, 0)).toEqual([]);
  expect(lessonTimeOptions([{ startsAt: "2026-11-03T16:15:00+04:00", endsAt: "2026-11-03T18:00:00+04:00" }], 90)).toEqual([{ startsAt: "2026-11-03T12:30:00.000Z", endsAt: "2026-11-03T14:00:00.000Z" }]);
});
