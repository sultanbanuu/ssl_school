import type { PrismaClient } from "./generated/prisma/client";
import { scheduleLock, serialize, storedBounds } from "./lessons";

export async function deliverLessonReminders(db: PrismaClient, now = new Date()) {
  return db.$transaction(async tx => {
    await scheduleLock(tx);
    const due = await tx.lesson.findMany({ where: { status: "scheduled", reminderAt: { lte: now }, reminderSentAt: null }, include: { enrollment: { include: { student: true, course: true } }, teacher: true }, take: 100, orderBy: { reminderAt: "asc" } });
    let delivered = 0;
    for (const lesson of due) {
      if (storedBounds(lesson)[1] - 4 * 3600000 > now.getTime()) {
        const slot = serialize(lesson);
        const recipients = [...new Set([lesson.enrollment.student.profileId, lesson.teacher.profileId])];
        await tx.notification.createMany({ data: recipients.map(userId => ({ userId, type: "lesson_reminder", title: `Lesson reminder: ${lesson.enrollment.course.name}`, message: `${slot.date} · ${lesson.allDay ? "All day" : `${slot.startTime}–${slot.endTime}`} (Asia/Baku)` })) });
        delivered += recipients.length;
      }
      await tx.lesson.update({ where: { id: lesson.id }, data: { reminderSentAt: now } });
    }
    return delivered;
  }, { isolationLevel: "ReadCommitted", timeout: 30000 });
}
export function startLessonReminders(db: PrismaClient) {
  let running = false;
  let lastError = "";
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await deliverLessonReminders(db);
      if (lastError) console.info("Lesson reminder delivery recovered");
      lastError = "";
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? String(error.code) : "unknown";
      const message = code === "P2021" || code === "P2022"
        ? "Calendar database schema is missing. Run bun run db:migrate, then restart the API."
        : "Check database connectivity and permissions. Delivery will retry in 30 seconds.";
      const signature = `${code}:${message}`;
      // Keep actionable diagnostics without logging connection strings or repeating
      // the same error every 30 seconds while an operator fixes the database.
      if (signature !== lastError) console.error(`Lesson reminder delivery failed (${code}). ${message}`);
      lastError = signature;
    }
    finally { running = false; }
  };
  void tick();
  const timer = setInterval(() => void tick(), 30000);
  return () => clearInterval(timer);
}
