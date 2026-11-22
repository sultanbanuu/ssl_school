export const courseCatalog = [
  { name: "Upgrade Your Level", price: "130", category: "General English", teachers: ["Sayad", "Sultanbanu"] },
  { name: "English in Context", price: "16", perLesson: true, category: "General English", teachers: ["Sayad"] },
  { name: "All-in-One English", price: "160", category: "Academic and Technical English", teachers: ["Sayad", "Sultanbanu"], weeklySessions: [2, 1] },
  { name: "Lean Leader", price: "130", category: "Leadership", teachers: ["Sultanbanu"] },
  { name: "Academic Exam Prep 1:1", price: "200", category: "Exam Preparation", teachers: ["Sayad"] },
] as const;

export function courseNameKey(name: string) {
  return name.toLowerCase().trim().replace(/[-‐‑–—]/g, " ").replace(/\s+/g, " ")
    .replace(/\s*\|.*$/, "").replace(/ 1\s*:\s*1$/, "");
}

const coursePositions = new Map(courseCatalog.map(({ name }, index) => [courseNameKey(name), index]));

export function coursePosition(name: string) {
  return coursePositions.get(courseNameKey(name)) ?? courseCatalog.length;
}
