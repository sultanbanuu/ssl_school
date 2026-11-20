// Keep the original teacher as the default for older clients and enrollments.
export function hasCourseTeacher(
  course: { teacherId: string; teachers?: { teacherId: string }[] } | null | undefined,
  teacherId: string,
) {
  return !!course && (course.teacherId === teacherId ||
    !!course.teachers?.some((assignment) => assignment.teacherId === teacherId));
}

export function teacherCourseScope(teacherId: string) {
  return { OR: [{ teacherId }, { teachers: { some: { teacherId } } }] };
}
