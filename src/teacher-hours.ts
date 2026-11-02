export const BAKU_OFFSET = 4 * 3600000;
export type TimeRange = { startsAt: Date; endsAt: Date };
export const hasWorkingHours = (name: string | null | undefined) =>
  ["sayad", "sultanbanu"].includes(name?.trim().toLowerCase() || "");

export function workingMinutes(
  firstName: string | null | undefined,
  date: string,
): [number, number][] {
  const name = firstName?.trim().toLowerCase();
  if (!hasWorkingHours(firstName)) return [];
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  if (name === "sultanbanu")
    return day === 0 || day === 3
      ? []
      : day === 6
        ? [[960, 1320]]
        : [
            [600, 660],
            [960, 1320],
          ];
  return day === 0
    ? []
    : day === 6
      ? [[750, 1410]]
      : [
          [600, 660],
          [900, 1410],
        ];
}
export function workingRanges(
  firstName: string | null | undefined,
  date: string,
): TimeRange[] {
  const midnight = Date.parse(`${date}T00:00:00+04:00`);
  return workingMinutes(firstName, date).map(([start, end]) => ({
    startsAt: new Date(midnight + start * 60000),
    endsAt: new Date(midnight + end * 60000),
  }));
}
export function subtractBookings(
  windows: TimeRange[],
  bookings: TimeRange[],
  minimumMinutes: number,
  now: Date,
): TimeRange[] {
  const result: TimeRange[] = [];
  const busy = [...bookings].sort((a, b) => +a.startsAt - +b.startsAt);
  for (const window of windows) {
    // Start choices use a quarter-hour grid and must be strictly in the future.
    let cursor = Math.max(+window.startsAt, +now + 1);
    const add = (end: number) => {
      const start = Math.ceil(cursor / 900000) * 900000;
      if (end - start >= minimumMinutes * 60000)
        result.push({ startsAt: new Date(start), endsAt: new Date(end) });
    };
    for (const block of busy) {
      if (+block.endsAt <= cursor || +block.startsAt >= +window.endsAt)
        continue;
      if (+block.startsAt > cursor)
        add(Math.min(+block.startsAt, +window.endsAt));
      cursor = Math.max(cursor, +block.endsAt);
      if (cursor >= +window.endsAt) break;
    }
    if (cursor < +window.endsAt) add(+window.endsAt);
  }
  return result;
}
