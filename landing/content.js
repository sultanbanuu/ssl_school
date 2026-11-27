const teacherNames = {
  sayad: 'Sayad Mahyaddinova',
  sultanbanu: 'Sultanbanu Ahmadli',
};

const schoolCourses = [
  {
    id: 'upgrade-your-level', title: 'Upgrade Your Level',
    category: 'Ümumi ingilis dili', color: '#d7c9fb',
    summary: 'Bildiyin sözlərlə cümlə qur və gündəlik dialoqlarda daha rahat danış.',
    cadence: 'Həftədə 3 dərs · 50–60 dəqiqə', level: 'Bütün səviyyələr', teachers: [teacherNames.sayad, teacherNames.sultanbanu],
    topics: [
      ['Dinlə və izah et', 'Oxuduğunu və eşitdiyini öz sözlərinlə danış.'],
      ['Fikrini aydın ifadə et', 'Yeni sözləri və qrammatikanı gündəlik dialoqlarda tətbiq et.'],
      ['Dərsdə geribildirim al', 'Müəllimlə cümlələrini nəzərdən keçir və yenidən izah etməyə çalış.'],
    ],
  },
  {
    id: 'english-in-context', title: 'English in Context',
    category: 'Ümumi ingilis dili', color: '#cbe8d9',
    summary: 'Müsahibə, səfər və iş görüşü kimi real situasiyalarda ingiliscə danışmağı məşq et.',
    cadence: 'Cədvəl fərdi proqrama uyğun seçilir', teachers: [teacherNames.sayad, teacherNames.sultanbanu],
    topics: [
      ['Məqsədinə uyğun proqram', 'Öyrənmək istədiyin mövzuları seç. İlk dərsdən dialoqlar və rol oyunları ilə danışmağa başla.'],
      ['İş və müsahibə', 'Müsahibə suallarına cavab ver, sahənə uyğun terminləri işlət və iş görüşünə hazırlaş.'],
      ['Səyahət və gündəlik ünsiyyət', 'Hava limanından otelə qədər səyahətdə rastlaşdığın dialoqları məşq et.'],
    ],
  },
  {
    id: 'all-in-one-english', title: 'All-in-One English',
    category: 'Akademik və texniki ingilis dili', color: '#ffe098',
    summary: 'Mətnləri öz sözlərinlə izah et, sahənə aid terminləri müzakirədə işlət.',
    cadence: 'Həftədə 3 dərs · 50–60 dəqiqə', level: 'B1 və yuxarı', teachers: [teacherNames.sayad, teacherNames.sultanbanu],
    topics: [
      ['Akademik ingilis dili', 'Sayadla həftədə iki dəfə mətnin əsas fikrini müəyyənləşdir və onu öz sözlərinlə müzakirə et.'],
      ['Texniki ingilis dili', 'Sultanbanu ilə həftədə bir dəfə sahənə aid terminləri işlət və texniki prosesi ingiliscə izah et.'],
      ['Fərdi geribildirim', 'Mövzuları müəllimlə söhbətdə tətbiq et və fikrini daha dəqiq ifadə etməyi məşq et.'],
    ],
  },
  {
    id: 'lean-leader', title: 'Lean Leader',
    category: 'Liderlik', color: '#f4c2b3',
    summary: 'Komanda idarəçiliyini, qərarverməni və liderliyi müzakirə və simulyasiyalarla məşq et.',
    cadence: 'Həftədə 2 dərs · 60 dəqiqə', level: 'B1 və yuxarı', teachers: [teacherNames.sultanbanu],
    topics: [
      ['Oxu və müzakirə et', 'Seçilmiş kitablar əsasında komandalar və qərarlar haqqında yeni ideyaları araşdır.'],
      ['Situasiyaları canlandır', 'Komanda idarəçiliyi ilə bağlı qərarları simulyasiyalarda sına və fikrini əsaslandır.'],
    ],
  },
  {
    id: 'academic-prep', title: 'Academic Exam Prep 1:1',
    category: 'İmtahan hazırlığı', color: '#c3dbfc',
    summary: 'IELTS, Aptis və Duolingo English Test üçün imtahan tipli tapşırıqlarla hazırlaş.',
    cadence: 'Həftədə 2 dərs · 2 saat', teachers: [teacherNames.sayad, teacherNames.sultanbanu],
    topics: [
      ['Vaxtla məşq et', 'Sınaq imtahanlarında hər bölməyə nə qədər vaxt ayıracağını müəyyənləşdir.'],
      ['Cavabını səsləndir', 'İmtahan tipli suallara səsli cavab ver və müəllimdən geribildirim al.'],
      ['Çətin mövzulara qayıt', 'Oxu, dinləmə, yazı və danışıq üzrə çətinlik çəkdiyin tapşırıqları məşq et.'],
    ],
  },
];

const lessonQuestions = [
  {
    prompt: '“When I ___ my first English lesson, I can see how much I’ve learned.”',
    hint: 'Cümlədə danışan şəxs ilk dərsini xatırlayır.',
    options: ['look ahead to', 'look back on'], correct: 1,
    explanation: '“Look back on” keçmişdə baş vermiş bir hadisəni xatırlayıb onun haqqında düşünməkdir.',
  },
  {
    prompt: '“At our meeting, we’ll ___ next month’s trip and make a plan.”',
    hint: 'Səfər gələn ay baş tutacaq.',
    options: ['look ahead to', 'look back on'], correct: 0,
    explanation: '“Look ahead to” gələcəkdə baş verəcək bir hadisə haqqında düşünməkdir.',
  },
  {
    prompt: '“Looking back on my first lesson helps me plan my next one.”',
    hint: 'Keçmiş təcrübə gələcək planı necə dəyişə bilər?',
    options: ['I can use what I learned to set a new goal.', 'I have to repeat the same lesson every time.'], correct: 0,
    explanation: 'Keçmişdə nə öyrəndiyini düşünmək növbəti addımın üçün daha aydın məqsəd qoymağa kömək edir.',
  },
];
