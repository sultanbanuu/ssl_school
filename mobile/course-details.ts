import type { CourseIconName } from "./CourseIcon";
import type React from "react";
import type { GlassIcon } from "./GlassIcon";
import { courseNameKey } from "../src/shared/course-catalog";

type Icon = React.ComponentProps<typeof GlassIcon>["name"];
const teacherSyllabi = [
  { file: "sayad.pdf", label: "Sayad müəllimin sillabusu" },
  { file: "sultanbanu.pdf", label: "Sultanbanu müəllimin sillabusu" },
];

type Detail = {
  accent: string;
  icon: Icon;
  intro: string;
  subtitle?: string;
  sections: { icon: CourseIconName; title: string; body: string }[];
  facts: { label: string; value: string }[];
  syllabi?: { file: string; label: string }[];
  syllabusNote?: string;
  price?: string;
  custom?: boolean;
};

const details: Record<string, Detail> = {
  "upgrade your level": {
    accent: "#bdb7ff",
    icon: "chatbubbles-outline",
    intro: "Sözləri bilirsən, amma danışanda cümlən yarımçıq qalır? Upgrade Your Level kursunda bildiyin sözlərlə cümlə qurmağı və həmin cümlələri gündəlik dialoqlarda işlətməyi məşq edirsən.",
    sections: [
      { icon: "headphones-purple", title: "Sayad müəllimlə", body: "Oxuduğunu və eşitdiyini öz sözlərinlə danışırsan, qrammatikanı isə söhbətdə tətbiq edirsən." },
      { icon: "puzzle-purple", title: "Sultanbanu müəllimlə", body: "Sözləri düzgün sıralamağı və fikrini aydın cümlələrlə ifadə etməyi məşq edirsən." },
      { icon: "person-purple", title: "Fərdi dərslər", body: "Qrupda növbə gözləmədən danışmağa başlayırsan. Sən təki cümləyə başla, ardı gələcək. Müəllim səhvlərini elə dərsdə izah edir." },
    ],
    facts: [
      { label: "Səviyyə", value: "Bütün səviyyələr" },
      { label: "Cədvəl", value: "Həftədə 3 dərs · 50–60 dəqiqə" },
      { label: "Qiymət", value: "130 ₼" },
    ],
    price: "130 ₼",
    syllabi: teacherSyllabi,
  },
  "english in context": {
    accent: "#bce6d1",
    icon: "compass-outline",
    intro: "İngiliscə başa düşürsən, amma müsahibədə, səfərdə və ya iş görüşündə fikrini ifadə etməkdə çətinlik çəkirsən? Dərsdə məhz bu vəziyyətləri məşq edirik.",
    sections: [
      { icon: "person-green", title: "Məqsədinə uyğun fərdi proqram", body: "Proqram məqsədinə, vaxtına və büdcənə uyğundur. İlk dərsdən dialoqlar, rol oyunları və real situasiyalar üzərində danışmağa başlayırsan. Mövzuları məqsədinə görə seçib birləşdirə bilərsən." },
      { icon: "school-green", title: "Akademik ingilis dili", body: "Akademik söz ehtiyatını genişləndir və cümlə quruluşunu məşq et." },
      { icon: "tools-green", title: "Texniki ingilis dili", body: "İxtisasına uyğun terminləri və işdə istifadə etdiyin dili öyrən." },
      { icon: "plane-green", title: "Səyahət üçün ingilis dili", body: "Hava limanından otelə qədər, səyahətdə rastlaşdığın gündəlik situasiyalar üçün dialoqları məşq et." },
      { icon: "briefcase-green", title: "Müsahibə və HR", body: "Müsahibə suallarına cavab verməyi, namizədlərlə ünsiyyət qurmağı və işə qəbulda istifadə olunan ifadələri məşq et." },
      { icon: "flash-green", title: "İntensiv proqram", body: "Qısa müddətdə işinə yarayan sözləri öyrən və onlarla cümlə qur." },
    ],
    facts: [],
    custom: true,
    syllabi: teacherSyllabi,
  },
  "all in one english": {
    accent: "#ffd991",
    icon: "library-outline",
    subtitle: "Academic & Technical English",
    intro: "Understand what you read but get stuck when it’s your turn to speak? Know the technical terms but struggle to recall them in meetings?",
    sections: [
      { icon: "book-yellow", title: "Academic English · Twice a week with Sayad", body: "Read or listen, then explain the main idea in your own words. Put new vocabulary and grammar to work in discussion." },
      { icon: "tools-yellow", title: "Technical English · Once a week with Sultanbanu", body: "Learn the terms used in your field. Practise explaining a process, discussing a technical problem or answering a colleague’s question." },
      { icon: "mic-yellow", title: "One-to-one lessons", body: "Spend more time speaking, work through topics in conversation and get feedback as you go." },
    ],
    facts: [
      { label: "English level", value: "B1 and above" },
      { label: "Schedule", value: "3 lessons a week · 50–60 minutes each" },
      { label: "Price", value: "160 ₼ for both Academic and Technical English" },
    ],
    price: "160 ₼",
    syllabusNote: "Ask your teacher for the syllabus during your free trial lesson.",
  },
  "lean leader": {
    accent: "#f4bfae",
    icon: "navigate-outline",
    intro: "Leadership starts with how you think and act. The Lean Leader course helps you develop the skills to lead a team, make better decisions and grow a business.",
    sections: [
      { icon: "book-coral", title: "Reading, discussion and practice", body: "Learn through guided reading, wide-ranging discussions, research and hands-on simulations. The selected books will help you explore new ideas and sharpen your critical thinking." },
    ],
    facts: [
      { label: "English level", value: "B1 and above" },
      { label: "Schedule", value: "Twice a week · 60 minutes per session" },
      { label: "Price", value: "130 ₼" },
    ],
    price: "130 ₼",
    syllabi: [{ file: "lean-leader.pdf", label: "Lean Leader syllabus" }],
  },
  "academic exam prep": {
    accent: "#b4d8ff",
    icon: "school-outline",
    subtitle: "IELTS · Aptis · Duolingo English Test",
    intro: "Running out of time on practice tests? Freezing when it’s your turn to speak?",
    sections: [
      { icon: "timer-blue", title: "Practise under time pressure", body: "Work through timed mock tests and learn how to pace each section." },
      { icon: "mic-blue", title: "Get more speaking time", body: "Answer exam-style prompts out loud and get feedback as you go." },
      { icon: "writing-blue", title: "Focus on what costs you points", body: "Use targeted exercises to improve your reading, listening, writing and speaking." },
      { icon: "person-blue", title: "One-to-one lessons", body: "Get more time to speak, ask questions and practise the tasks you find difficult." },
    ],
    facts: [
      { label: "Schedule", value: "Twice a week · 2 hours per lesson" },
      { label: "Price", value: "200 ₼" },
    ],
    price: "200 ₼",
    syllabusNote: "Ask your teacher for the syllabus during your free trial lesson.",
  },
};

export function courseDetails(name: string): Detail | undefined {
  const key = courseNameKey(name);
  return Object.hasOwn(details, key) ? details[key] : undefined;
}
