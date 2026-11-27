const main = document.querySelector('main');
const params = new URLSearchParams(window.location.search);
const instagram = 'https://www.instagram.com/sslschool.az/';
const vocabularyPost = `${instagram}p/DgE3CHfDOi_/`;
const courseCalls = {
  'upgrade-your-level': { asset: 'call-1', teacher: teacherNames.sayad, student: 'Nazila Rzayeva' },
  'english-in-context': { asset: 'call-3', teacher: teacherNames.sayad, student: 'Hamid Aliyev', studentPhoto: 'call-3-hamid.png' },
  'all-in-one-english': { asset: 'call-2', teacher: teacherNames.sultanbanu, student: 'Aygul Mehdiyeva' },
  'lean-leader': { asset: 'call-4', teacher: teacherNames.sultanbanu, student: 'Nəzrin Abdullayeva' },
  'academic-prep': { asset: 'call-5', teacher: teacherNames.sultanbanu, student: 'Vali Valiyev', teacherPhoto: 'call-5-sultanbanu.png' },
};

function courseDetail(course) {
  const call = courseCalls[course.id];
  return `<div class="course-detail" style="--course-accent: ${course.color}">
    <header class="course-detail-intro">
      <p class="course-detail-category">${course.category}</p>
      <h2 id="course-detail-title" lang="en">${course.title}</h2>
      <p class="course-detail-summary">${course.summary}</p>
    </header>
    ${call ? lessonCall(call.asset, call.teacher, call.student, call) : ''}
    <dl class="course-detail-facts">
      <div><dt>Format</dt><dd>Onlayn · Fərdi</dd></div>
      <div><dt>Cədvəl</dt><dd>${course.cadence}</dd></div>
      ${course.level ? `<div><dt>Səviyyə</dt><dd>${course.level}</dd></div>` : ''}
      <div class="course-detail-teachers">
        <dt>${course.teachers.length > 1 ? 'Müəllimlər' : 'Müəllim'}</dt>
        <dd>${course.teachers.map(teacher => `<span>${teacher}</span>`).join('')}</dd>
      </div>
    </dl>
    <h3>Dərsdə nə edəcəksən?</h3>
    <ul class="course-detail-topics">
      ${course.topics.map(([title, text]) => `<li><h4>${title}</h4><p>${text}</p></li>`).join('')}
    </ul>
    <a class="course-detail-action" href="./?kurs=${encodeURIComponent(course.id)}#elaqe">Bu kursu istəyirəm</a>
  </div>`;
}

function setupCourseDetails() {
  const drawer = main.querySelector('.course-drawer');
  const details = drawer.querySelector('.course-drawer-content');

  function syncDetail() {
    const query = new URLSearchParams(location.search);
    const course = query.get('page') === 'kurs' && schoolCourses.find(item => item.id === query.get('kurs'));
    if (!course) {
      if (drawer.open) drawer.close();
      document.title = 'Kurslar · SSL School';
      return;
    }
    details.innerHTML = courseDetail(course);
    if (!drawer.open) drawer.showModal();
    drawer.scrollTop = 0;
    document.title = `${course.title} · SSL School`;
  }

  function dismiss() {
    if (history.state?.courseDrawer) {
      history.back();
    } else {
      history.replaceState(history.state, '', './?page=kurslar');
      syncDetail();
    }
  }

  main.addEventListener('click', event => {
    const link = event.target.closest('a[data-course-detail]');
    if (!link || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    history.pushState({ courseDrawer: true }, '', link.href);
    syncDetail();
  });
  drawer.querySelector('.course-drawer-close').addEventListener('click', dismiss);
  drawer.addEventListener('cancel', event => {
    event.preventDefault();
    dismiss();
  });
  drawer.addEventListener('click', event => {
    if (event.target !== drawer) return;
    const bounds = drawer.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dismiss();
  });
  window.addEventListener('popstate', syncDetail);
  syncDetail();
}

function setupStudioMenu() {
  const nav = document.querySelector('.studio-navigation');
  const toggle = nav.querySelector('.studio-menu-toggle');
  const links = nav.querySelector('.studio-nav-links');
  const pageContent = [document.querySelector('.skip'), main, document.querySelector('.site-footer')];
  const compact = window.matchMedia('(max-width: 1024px), (max-width: 1366px) and (hover: none) and (pointer: coarse)');

  function setMenu(open) {
    toggle.setAttribute('aria-expanded', open);
    toggle.setAttribute('aria-label', open ? 'Menyunu bağla' : 'Menyunu aç');
    links.inert = compact.matches && !open;
    for (const element of pageContent) element.inert = open;
  }

  const menuOpen = () => toggle.getAttribute('aria-expanded') === 'true';
  toggle.addEventListener('click', () => setMenu(!menuOpen()));
  links.addEventListener('click', event => {
    if (menuOpen() && event.target.closest('a')) setMenu(false);
  });
  document.addEventListener('click', event => {
    if (menuOpen() && !nav.contains(event.target)) setMenu(false);
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !menuOpen()) return;
    setMenu(false);
    toggle.focus();
  });
  compact.addEventListener('change', () => setMenu(false));
  setMenu(false);
}

function lesson() {
  return `<section class="page-intro lesson-intro">
    <p class="eyebrow">Nümunə dərs · 3 sual</p>
    <h1 lang="en">Look back.<br><em>Look ahead.</em></h1>
    <p>Keçmiş təcrübə haqqında danış və gələcək planları ifadə et.</p>
  </section>
  <section class="lesson-grid" aria-label="İnteraktiv ingilis dili məşqi">
    <div class="lesson-guide">
      <div class="guide-character"><img src="./assets/studio-cast.webp" alt="" width="1440" height="816"><span aria-hidden="true">✦</span></div>
      <div class="guide-copy">
        <p class="eyebrow">Müəllimin qeydi</p>
        <dl>
          <dt lang="en">look back on</dt><dd>Keçmişdəki bir hadisəni xatırlayıb onun haqqında düşünmək.</dd>
          <dt lang="en">look ahead to</dt><dd>Gələcəkdəki bir hadisə haqqında düşünmək.</dd>
        </dl>
        <a class="text-link" href="${vocabularyPost}">Instagram paylaşımı</a>
      </div>
    </div>
    <div class="exercise" id="exercise"></div>
  </section>`;
}

const legacyCourseLink = !params.has('page') && location.hash === '#kurslar';
const page = legacyCourseLink ? 'kurslar' : params.get('page');
const selectedCourse = schoolCourses.find(course => course.id === params.get('kurs'));
if (legacyCourseLink) history.replaceState(history.state, '', './?page=kurslar');

if (page === 'ders') {
  main.innerHTML = lesson();
  document.title = 'Nümunə dərs · SSL School';
  setupExercise();
} else if (page === 'kurslar' || page === 'kurs') {
  document.body.classList.add('course-page');
  main.classList.remove('wrap');
  main.innerHTML = `${courseRoad()}
    <dialog class="course-drawer" aria-labelledby="course-detail-title">
      <div class="course-drawer-toolbar">
        <button class="course-drawer-close" type="button" aria-label="Kurs məlumatını bağla" autofocus></button>
      </div>
      <div class="course-drawer-content"></div>
    </dialog>`;
  document.querySelector('[data-nav="kurslar"]').setAttribute('aria-current', 'page');
  setupCourseRoad(page === 'kurs' && selectedCourse ? schoolCourses.indexOf(selectedCourse) : 0);
  setupCourseDetails();
} else {
  document.body.classList.add('desktop-home');
  main.classList.remove('wrap');
  main.innerHTML = home();
  setupDesktop(() => motionPaused);
  setupJourney(() => motionPaused);
  setupReviews(() => motionPaused);
  setupPaperArt();
  setupContact(location.hash === '#elaqe' ? selectedCourse?.title : undefined);
}
setupStudioMenu();
setupPageFade();

// The page content is rendered: fade it in (index.html hides it until now).
function setupPageFade() {
  const root = document.documentElement;
  requestAnimationFrame(() => root.classList.remove('page-entering'));

  // A link to another page: fade the content out while the browser loads the next page.
  // The navigation itself is never delayed.
  document.addEventListener('click', event => {
    const link = event.target.closest('a[href]');
    if (!link || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    if (link.target && link.target !== '_self' || link.hasAttribute('download')) return;
    const url = new URL(link.href, location.href);
    if (url.origin !== location.origin || (url.pathname === location.pathname && url.search === location.search)) return;
    root.classList.add('page-leaving');
  });
  // Coming back with the browser's back button can restore this page as it was left.
  window.addEventListener('pageshow', event => {
    if (event.persisted) root.classList.remove('page-leaving');
  });
}

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let motionPaused;

function applyMotion() {
  motionPaused = reducedMotion.matches;
  document.documentElement.classList.toggle('motion-paused', motionPaused);
  document.documentElement.classList.toggle('motion-playing', !motionPaused);
  const help = document.querySelector('#puppet-help');
  if (help) help.textContent = motionPaused ? 'Personaja toxun.' : 'Personaja toxun və ya onu çək.';
}

reducedMotion.addEventListener('change', applyMotion);
applyMotion();

function setupExercise() {
  const exercise = document.querySelector('#exercise');
  let step = 0;
  let score = 0;

  function render(focusHeading = false) {
    if (step === lessonQuestions.length) {
      exercise.innerHTML = `<div class="lesson-result">
        <span class="result-star" aria-hidden="true">✦</span>
        <p class="eyebrow">${score} / ${lessonQuestions.length} düzgün cavab</p>
        <h2 tabindex="-1">Məşqi bitirdin!</h2>
        <p>Özün haqqında iki cümlə de. Birində <span lang="en">“look back on”</span>, digərində <span lang="en">“look ahead to”</span> ifadəsini işlət.</p>
        <div class="text-actions"><button type="button" class="text-link" data-restart>Yenidən başla</button><a class="text-link" href="./?page=kurslar">Kurslara bax</a></div>
      </div>`;
    } else {
      const question = lessonQuestions[step];
      exercise.innerHTML = `<div class="exercise-progress"><span>Sual ${step + 1} / ${lessonQuestions.length}</span><progress value="${step + 1}" max="${lessonQuestions.length}" aria-label="Məşqin gedişi"></progress></div>
        <p class="exercise-instruction">${step === lessonQuestions.length - 1 ? 'Cümlənin fikrini ən yaxşı ifadə edən cavabı seç.' : 'Boşluğa uyğun ifadəni seç.'}</p>
        <h2 tabindex="-1" lang="en">${question.prompt}</h2>
        <div class="answers" role="group" aria-label="Cavab variantları">
          ${question.options.map((option, index) => `<button type="button" class="answer" data-option="${index}" lang="en"><span class="answer-letter" aria-hidden="true">${index === 0 ? 'A' : 'B'}</span><span>${option}</span><span class="answer-symbol" aria-hidden="true"></span></button>`).join('')}
        </div>
        <details class="hint"><summary>İpucu</summary><p>${question.hint}</p></details>
        <p class="feedback" role="status"></p>
        <button type="button" class="text-link" data-next hidden>${step === lessonQuestions.length - 1 ? 'Nəticəyə bax' : 'Növbəti sual'}</button>`;
    }
    if (focusHeading) exercise.querySelector('h2').focus();
  }

  exercise.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.hasAttribute('data-restart')) {
      step = 0;
      score = 0;
      render(true);
    } else if (button.hasAttribute('data-next')) {
      step += 1;
      render(true);
    } else if (button.hasAttribute('data-option') && button.getAttribute('aria-disabled') !== 'true') {
      const question = lessonQuestions[step];
      const correct = Number(button.dataset.option) === question.correct;
      score += Number(correct);
      for (const option of exercise.querySelectorAll('[data-option]')) {
        option.setAttribute('aria-disabled', 'true');
        if (Number(option.dataset.option) === question.correct) {
          option.classList.add('is-correct');
          option.querySelector('.answer-symbol').textContent = '✓';
        }
      }
      if (!correct) {
        button.classList.add('is-incorrect');
        button.querySelector('.answer-symbol').textContent = '×';
      }
      const feedback = exercise.querySelector('.feedback');
      feedback.textContent = `${correct ? 'Doğrudur!' : 'Düzgün cavab işarələnib.'} ${question.explanation}`;
      feedback.classList.add('has-feedback');
      exercise.querySelector('[data-next]').hidden = false;
    }
  });

  render();
}

const motionObserver = new IntersectionObserver(entries => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    entry.target.classList.add('in-view');
    motionObserver.unobserve(entry.target);
  }
}, { threshold: 0.16 });
document.querySelectorAll('.course-card, [data-reveal]').forEach(item => motionObserver.observe(item));
