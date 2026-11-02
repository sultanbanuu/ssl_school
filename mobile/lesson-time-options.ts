export function lessonTimeOptions(ranges: { startsAt: string; endsAt: string }[], minutes: number) {
  if (!Number.isFinite(minutes) || minutes <= 0) return [];
  const duration = minutes * 60000;
  return ranges.flatMap(range => {
    const first = Math.ceil(Date.parse(range.startsAt) / 1800000) * 1800000;
    const last = Date.parse(range.endsAt) - duration;
    return Array.from({ length: Math.max(0, Math.floor((last - first) / 1800000) + 1) }, (_, i) => {
      const start = first + i * 1800000;
      return { startsAt: new Date(start).toISOString(), endsAt: new Date(start + duration).toISOString() };
    });
  });
}
