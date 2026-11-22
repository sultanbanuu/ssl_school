import { createDatabase } from "../src/db";
import { courseCatalog, courseNameKey } from "../src/shared/course-catalog";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");
const db = createDatabase(url);

try {
  const result = await db.$transaction(async (tx) => {
    // Keep the catalog snapshot stable while deciding which records can be deleted.
    await tx.$executeRaw`LOCK TABLE courses IN SHARE ROW EXCLUSIVE MODE`;
    const existing = await tx.course.findMany({
      select: {
        id: true, name: true, active: true,
        _count: { select: { enrollments: true, payments: true, paymentUploads: true, availability: true } },
      },
      orderBy: [{ active: "desc" }, { createdAt: "asc" }, { id: "asc" }],
    });
    const catalogIds = new Set<string>();
    const added: string[] = [];
    const archived: string[] = [];
    const deleted: string[] = [];

    for (const item of courseCatalog) {
      const match = existing.find((course) => courseNameKey(course.name) === courseNameKey(item.name));
      if (match) {
        catalogIds.add(match.id);
        if (!match.active || match.name !== item.name) {
          await tx.course.update({ where: { id: match.id }, data: { name: item.name, active: true } });
        }
        continue;
      }

      const teachers = await Promise.all(item.teachers.map(async (firstName, index) => {
        const matches = await tx.teacher.findMany({
          where: { profile: { firstName: { equals: firstName, mode: "insensitive" } } },
          select: { id: true },
        });
        if (matches.length !== 1) throw new Error(`Expected one teacher named ${firstName}`);
        return { teacherId: matches[0]!.id, weeklySessions: "weeklySessions" in item ? item.weeklySessions[index] : undefined };
      }));
      await tx.course.create({
        data: {
          name: item.name, category: item.category, price: item.price,
          perLesson: "perLesson" in item && item.perLesson,
          teacherId: teachers[0]!.teacherId, teachers: { create: teachers },
        },
      });
      added.push(item.name);
    }

    for (const course of existing) {
      if (catalogIds.has(course.id)) continue;
      if (Object.values(course._count).some((count) => count > 0)) {
        if (course.active) {
          await tx.course.update({ where: { id: course.id }, data: { active: false } });
          archived.push(course.name);
        }
      } else {
        await tx.course.delete({ where: { id: course.id } });
        deleted.push(course.name);
      }
    }
    return { added, archived, deleted };
  });
  console.log(JSON.stringify(result, null, 2));
} finally {
  await db.$disconnect();
}
