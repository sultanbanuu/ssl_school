const questionCards = [
  { text: 'sözləri bilirsən, cümlədə işlətmək çətindir?', paper: '#f6d87d' },
  { text: 'Və ya sözləri yadda saxlamaq?', paper: '#edc4ed' },
  { text: 'Cümlə qurmaqda özgüvənli deyilsən?', paper: '#d8d0fa' },
  { text: 'Özünü digərlərinə başqa dildə ifadə etmək çətin gəlir?', paper: '#f7c4b0' },
  { text: 'Dinləyirsən, başa düşürsən, amma cavab verə bilmirsən?', paper: '#c8e8de' },
  { text: 'Dərsə vaxt ayıra bilməmək, gedişatı izləyə bilməmək və daha bir çoxu…', paper: '#cbdfff' },
  { text: 'Dil öyrənmək bu qədər problemidir bəyəm…?', paper: '#f8d486' },
  {
    text: 'Amma unutma ki, hər problemin bir həll yolu var',
    mission: 'İşimiz elə budur:',
    support: 'Sənin dil öyrənmə yolunda sənə dəstək olmaq, özünü ifadə ilə bağlı ən komfortlu mühit yaratmaq',
    paper: '#d5c3fa',
  },
];

const roadmapStart = [
  { title: '15 dəqiqəlik tanışlıq', text: 'Qısa onlayn dərsə qoşulursan. Müəllim səviyyəni müəyyənləşdirir və məqsədini öyrənir.' },
  { title: 'Dərs cədvəli', text: 'Müəllimlə sənə uyğun günləri və saatları seçirsiniz.' },
  { title: 'Platformada qeydiyyat', text: 'SSL School-da qeydiyyatdan keçirsən. Dərslərini və irəliləyişini oradan izləyirsən.' },
];

const roadmapStudent = 'Riad Mammadov';
const roadmapWeek = [
  {
    day: 'Bazar ertəsi', time: '16:00', teacher: teacherNames.sayad, image: 'lesson-1', title: 'Söhbətlə başlayırsan',
    summary: 'Sayadla gündəlik mövzuda söhbət edirsən. Çətinlik çəkdiyin cümlələri birlikdə qurur, sonra yeni quruluşu oxu, dinləmə və danışıqda sınayırsan.',
    takeaway: 'Dərsin sonunda ev tapşırığını və PDF qeydlərini alırsan.',
  },
  {
    day: 'Çərşənbə', time: '16:00', teacher: teacherNames.sultanbanu, image: 'lesson-3', title: 'Öyrəndiklərini möhkəmləndirirsən',
    summary: 'Ev tapşırığını Sultanbanu ilə yoxlayırsan. A1–A2-də söz və cümlə quruluşunu, B1–B2-də dinləmə və danışığı məşq edirsən.',
    takeaway: 'Yeni cümlə quruluşunu danışıq suallarına cavab verərkən işlədirsən.',
  },
  {
    day: 'Cümə', time: '17:00', teacher: teacherNames.sayad, image: 'lesson-2', title: 'Öz cümlələrini qurursan',
    summary: 'Sayadla dərs materialından faydalı cümlə quruluşlarını seçir və nümunələr üzərində məşq edirsən.',
    takeaway: 'Eyni quruluşu bu dəfə öz fikrini ifadə etmək üçün işlədirsən.',
  },
];

const lessonCallIcons = [
  '<rect x="9" y="3" width="6" height="12" rx="3"/><path d="M6 11a6 6 0 0 0 12 0m-6 6v4m-3 0h6"/>',
  '<rect x="3" y="6" width="12" height="12" rx="2"/><path d="m15 10 6-3v10l-6-3"/>',
  '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4m-3-9 3-3 3 3"/>',
  '<path d="M3 15v-2c0-5 18-5 18 0v2a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1v-2a15 15 0 0 0-8 0v2a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z"/>',
];

function lessonCall(asset, teacher, student, { teacherPhoto, studentPhoto } = {}) {
  return `<div class="lesson-call">
    <div class="lesson-call-tiles">
      <div class="lesson-call-tile lesson-call-teacher">
        <img${teacherPhoto ? ' class="lesson-call-portrait"' : ''} src="./assets/${teacherPhoto ?? `${asset}-teacher.jpg`}" alt="${teacher} onlayn dərsdə" width="960" height="720" loading="lazy" decoding="async">
        <span aria-hidden="true">${teacher}</span>
      </div>
      <div class="lesson-call-tile">
        <img${studentPhoto ? ' class="lesson-call-portrait"' : ''} src="./assets/${studentPhoto ?? `${asset}-student.jpg`}" alt="${student} onlayn dərsdə" width="960" height="720" loading="lazy" decoding="async">
        <span aria-hidden="true">${student}</span>
      </div>
    </div>
    <div class="lesson-call-toolbar" aria-hidden="true">
      ${lessonCallIcons.map(icon => `<span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">${icon}</svg></span>`).join('')}
    </div>
  </div>`;
}

const roadmapAdvantages = [
  { title: 'Dərs vaxtını dəyişdir', text: 'Dərslər sənin cədvəlinə uyğun təyin olunur. Vaxtı dəyişmək istəyəndə platformada müəllimin boş saatlarına baxıb uyğun vaxt üçün müraciət edə bilərsən.', icon: 'schedule' },
  { title: 'Sərfəli qiymət', text: 'Fərdi dərs paketlərini müqayisə edib büdcənə uyğun proqramı seçə bilərsən.', icon: 'price' },
  { title: 'İnkişafını vizual gör', text: 'Danışıq, dinləmə, söz ehtiyatı və cümlə quruluşu üzrə irəliləyişini ölçürük. Beləcə, hansı bacarığa daha çox vaxt ayırmalı olduğunu görürsən.', icon: 'progress' },
  { title: 'Bir tələbə, iki müəllim', text: 'Seçilmiş proqramlarda iki müəllimlə çalışırsan. Məsələn, All-in-One English-də Sayadla akademik, Sultanbanu ilə texniki ingilis dilini məşq edirsən.', icon: 'teachers' },
  { title: 'Danışıq yönümlü dərslər', text: 'Dərsin əsas hissəsi danışığa ayrılır. Sözləri və qrammatikanı real söhbətlərdə işlədərək məşq edirsən.', icon: 'speaking' },
  { title: 'Səviyyə yoxlamaları', text: 'Bir səviyyədən digərinə keçəndə qısa yoxlama ilə bacarıqlarını dəyərləndiririk.', icon: 'assessment' },
];

function languageStory() {
  return `<section class="home-section question-deck" aria-labelledby="questions-title" style="--deck-slides:${questionCards.length}">
    <div class="deck-track" id="tanisdir"><div class="deck-pin">
      <h2 id="questions-title" class="wrap">Sənə <em>tanışdır?</em></h2>
      <div class="question-stage">
        <canvas class="deck-tunnel" aria-hidden="true"></canvas>
        <ol class="deck-stack" aria-label="Dil öyrənmə kartları" role="list">
          ${questionCards.map(item => `<li class="deck-slide" style="--paper-ink:${item.paper}">
            <article class="deck-card${item.support ? ' deck-card-answer' : ''}">
              <span class="deck-text">${item.text}</span>
              ${item.mission ? `<p class="deck-mission">${item.mission}</p><p class="deck-support">${item.support}</p>` : ''}
            </article>
          </li>`).join('')}
        </ol>
      </div>
      <div class="wrap deck-bottom">
        <a class="text-link deck-road-link" href="#dersin-gedisi">Yol xəritəsinə keç <span aria-hidden="true">↓</span></a>
      </div>
    </div></div>
  </section>`;
}

function learningRoadmap() {
  return `<section class="home-section roadmap" id="dersin-gedisi" aria-labelledby="flow-title">
    <div class="wrap road-surface">
      <svg class="road-ink" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id="road-ink-gradient" x2="0%" y2="100%">
            <stop offset="0" stop-color="var(--road-lilac)"/>
            <stop offset=".52" stop-color="var(--road-rose)"/>
            <stop offset="1" stop-color="var(--road-peach)"/>
          </linearGradient>
          <mask id="road-progress-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="100%" height="100%">
            <path class="road-draw-mask"/>
          </mask>
        </defs>
        <path class="road-ink-base"/>
        <path class="road-ink-drawn" mask="url(#road-progress-mask)"/>
        <g class="road-traveller" visibility="hidden">
          <circle class="road-traveller-halo" r="14"/>
          <circle class="road-traveller-ring" r="8"/>
          <circle class="road-traveller-core" r="4"/>
        </g>
      </svg>
      <header class="roadmap-heading">
        <h2 id="flow-title">Dərs <em>necə keçir?</em></h2>
        <p class="section-intro">İlk tanışlıqdan ilk həftəyə qədər.</p>
      </header>
      <ol class="road-start" aria-label="Başlanğıc addımları" role="list">
        ${roadmapStart.map(({ title, text }, index) => `<li class="road-stop" data-road-stop>
          <span class="road-pin road-number" aria-hidden="true">${index + 1}</span>
          <div class="road-reveal"><h3>${title}</h3><p>${text}</p></div>
        </li>`).join('')}
      </ol>
      <section class="road-week-group" id="ilk-hefte" aria-labelledby="week-title">
        <div class="road-week" data-road-stop>
          <span class="road-pin" aria-hidden="true">✦</span>
          <div class="road-reveal"><h3 id="week-title">İlk həftə</h3><p>Nümunə dərs cədvəli</p></div>
        </div>
        <div class="week-track">
          <div class="week-stage">
            <ol class="week-lessons" aria-label="İlk həftənin dərsləri" role="list">
              ${roadmapWeek.map((lesson, index) => `<li class="week-lesson" id="week-lesson-${index + 1}">
                <div class="week-photo">${lessonCall(lesson.image, lesson.teacher, roadmapStudent)}</div>
                <div class="week-copy">
                  <p class="road-meta"><span>${lesson.day} · ${lesson.time}</span><span>${lesson.teacher}</span></p>
                  <h4>${lesson.title}</h4>
                  <p>${lesson.summary}</p>
                  <p class="week-takeaway">${lesson.takeaway}</p>
                </div>
              </li>`).join('')}
            </ol>
            <nav class="week-checkpoints" aria-label="Nümunə cədvəldə dərs seç">
              <svg class="week-path" viewBox="0 0 1000 48" preserveAspectRatio="none" aria-hidden="true">
                <path d="M20 34 C55 34 86 27 120 24 C238 14 365 42 500 32 S764 3 880 14 C919 18 950 24 980 23"/>
              </svg>
              ${roadmapWeek.map((lesson, index) => `<button class="week-checkpoint" type="button" aria-controls="week-lesson-${index + 1}"><span>${lesson.day}</span></button>`).join('')}
              <span class="week-traveller" aria-hidden="true"></span>
            </nav>
          </div>
        </div>
        <span class="week-route-exit" aria-hidden="true"></span>
      </section>
      <section class="road-advantages" id="ustunlukler" aria-labelledby="benefits-title">
        <div class="roadmap-heading" data-road-stop><div class="road-reveal"><h2 id="benefits-title">Yol boyu <em>üstünlüklər.</em></h2></div></div>
        <ul class="road-benefits" role="list">
          ${roadmapAdvantages.map(({ title, text, icon }) => `<li class="road-benefit" data-road-stop>
            <span class="road-pin road-benefit-mark" aria-hidden="true">
              <img class="road-benefit-icon road-benefit-icon-light" src="./assets/roadmap-icons/${icon}-light.svg" alt="" width="24" height="24" loading="lazy" decoding="async">
              <img class="road-benefit-icon road-benefit-icon-dark" src="./assets/roadmap-icons/${icon}-dark.svg" alt="" width="24" height="24" loading="lazy" decoding="async">
            </span>
            <div class="road-reveal"><h3>${title}</h3><p>${text}</p></div>
          </li>`).join('')}
        </ul>
        <div class="text-actions road-actions"><a class="text-link" href="./?page=kurslar">Kurslara bax</a></div>
      </section>
    </div>
  </section>`;
}

function setupJourney(animationsPaused) {
  const deck = document.querySelector('.question-deck');
  const track = deck.querySelector('.deck-track');
  const pin = deck.querySelector('.deck-pin');
  const stage = deck.querySelector('.question-stage');
  const slides = [...deck.querySelectorAll('.deck-slide')];
  const paintTunnel = createQuestionTunnel(deck.querySelector('.deck-tunnel'));
  const roadmap = document.querySelector('.roadmap');
  const paintRoute = createJourneyRoute(roadmap, animationsPaused);
  const paintWeek = createWeekJourney(roadmap, animationsPaused);
  const canPin = window.matchMedia('(min-height: 390px)');
  let scheduled = false;

  function renderDeck() {
    if (animationsPaused() || !canPin.matches) return;
    const bounds = track.getBoundingClientRect();
    const runway = track.clientHeight - pin.offsetHeight;
    const pinTop = pin.getBoundingClientRect().top;
    if (pinTop > innerHeight || pinTop + pin.offsetHeight < 0 || runway <= 0) return;

    const width = stage.clientWidth;
    const height = stage.clientHeight;
    const compact = width < 760;
    const dwell = compact ? 0.24 : 0.31;
    const time = clampUnit(-bounds.top / runway) * slides.length;
    const beat = Math.min(slides.length - 1, Math.floor(time));
    const position = Math.min(slides.length - 1, beat + smoothUnit((time - beat - dwell) / (1 - dwell)));
    const hole = [width * (compact ? 0.25 : 0.24), height * (compact ? 0.28 : 0.48)];
    const release = smoothUnit(position - (slides.length - 2));
    const cardRoom = Math.max(0, (height - slides.at(-1).offsetHeight - 28) / 2);
    const restY = Math.min(height * (compact ? 0.14 : 0.025), cardRoom);

    slides.forEach((slide, index) => {
      const offset = position - index;
      const answer = index === slides.length - 1;
      const lean = compact ? 3 : 5;
      const tilt = answer ? 0 : index % 2 ? lean : -lean;
      const restX = width * (compact ? 0.008 : answer ? 0.085 : 0.168);
      const arrival = clampUnit(-offset);
      const pull = clampUnit(offset);
      const arc = pull ** 1.28;
      const x = restX + width * 0.56 * arrival ** 1.18 + (hole[0] - width / 2 - restX) * arc;
      const y = restY + height * 0.36 * arrival + (hole[1] - height / 2 - restY) * arc
        - height * (compact ? 0.045 : 0.12) * Math.sin(arc * Math.PI);
      const roll = tilt + 26 * arrival - 67 * pull ** 1.15;
      const yaw = -45 * arrival + 50 * pull;
      const scale = 1 - 0.18 * arrival - 0.96 * pull ** 1.18;
      slide.style.transform = `translate3d(${x}px,${y}px,0) rotate(${roll}deg) rotateY(${yaw}deg) scale(${scale})`;
      slide.style.opacity = 1 - Math.max(smoothUnit((arrival - 0.44) / 0.52), smoothUnit((pull - 0.54) / 0.43));
    });

    paintTunnel(width, height, hole, time, release);
    pin.style.setProperty('--deck-release', release);
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      renderDeck();
      paintWeek();
      paintRoute();
    });
  }

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-revealed');
        observer.unobserve(entry.target);
      }
    }, { threshold: 0.11, rootMargin: '0px 0px -8% 0px' });
    roadmap.classList.add('road-animated');
    roadmap.querySelectorAll('[data-road-stop]').forEach(stop => {
      if (!stop.querySelector('.road-pin')) observer.observe(stop);
    });

    const compactReveal = new IntersectionObserver(entries => {
      if (canPin.matches) return;
      for (const { target, intersectionRatio } of entries) {
        if (intersectionRatio < .18) continue;
        target.classList.add('is-deck-in');
        compactReveal.unobserve(target);
      }
    }, { threshold: 0.18 });
    const observeCards = () => {
      compactReveal.disconnect();
      if (!canPin.matches) slides.forEach(slide => compactReveal.observe(slide));
    };
    canPin.addEventListener('change', observeCards);
    observeCards();
  }

  deck.classList.add('deck-ready');
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  window.visualViewport?.addEventListener('resize', schedule);
  const layout = new ResizeObserver(schedule);
  layout.observe(stage);
  layout.observe(roadmap.querySelector('.road-surface'));
  new MutationObserver(schedule).observe(document.documentElement, { attributeFilter: ['class'] });
  schedule();
}
