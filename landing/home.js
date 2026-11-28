function studioPuppet(character, label, line, width, height) {
  return `<div class="puppet-mount mount-${character}">
    <p class="desktop-speech" id="${character}-speech" lang="en">${line}</p>
    <button type="button" class="desktop-puppet" aria-label="${label}" data-puppet="${character}" aria-describedby="puppet-help">
      <img src="./assets/${character}.webp" alt="" width="${width}" height="${height}" draggable="false">
    </button>
  </div>`;
}

function desktopHero() {
  return `<section class="desktop-hero" aria-label="İnteraktiv dərs səhnəsi" data-home-sky="hero">
    <div class="desktop-wallpaper" aria-hidden="true"></div>
    <div class="desktop-inner wrap">
      <div class="desktop-cast" role="group" aria-label="İnteraktiv müəllim və tələbə">
        ${studioPuppet('teacher-felt-red', 'Birinci müəllimlə danış', 'What do you think?', 558, 826)}
        ${studioPuppet('teacher-felt-book', 'İkinci müəllimlə danış', 'How would you say it?', 434, 826)}
        ${studioPuppet('student-felt', 'Tələbə ilə danış', 'Let me try!', 600, 826)}
        <p id="puppet-help">Personaja toxun və ya onu çək.</p>
        <span id="puppet-message" class="sr-only" role="status" lang="en"></span>
      </div>
    </div>
  </section>`;
}

function homeStatement() {
  return `<section class="home-section home-statement" aria-labelledby="home-title" data-home-sky="statement">
    <div class="wrap statement-copy">
      <p class="statement-label">Fərdi onlayn ingilis dili</p>
      <h1 id="home-title"><span>İngiliscə düşün.</span> <em>Özün kimi danış.</em></h1>
      <p class="desktop-intro">Müəlliminlə söhbət et, fikrini ifadə et və öyrəndiklərini gündəlik danışıqda sına.</p>
      <div class="text-actions">
        <a class="text-link" href="#elaqe">Konsultasiya üçün müraciət et</a>
      </div>
    </div>
  </section>`;
}

function home() {
  return `${desktopHero()}<div class="story-flow">${homeStatement()}${languageStory()}
  ${reviewGallery()}
  ${learningRoadmap()}
  ${homeFAQs()}
  ${homeConsultation()}</div>`;
}

function homeConsultation() {
  return `<section id="elaqe" class="home-section home-contact" aria-labelledby="contact-title" data-home-sky="contact">
    <div class="paper-flight">
      <div class="wrap section-split paper-scene">
        <div>
          <h2 id="contact-title">Konsultasiya üçün <em>müraciət et</em></h2>
          <p class="section-intro">Məqsədini və səviyyəni birlikdə müəyyənləşdirək.</p>
        </div>
        <div class="contact-paper" data-paper-area>
          <svg class="contact-folder-back" viewBox="0 0 560 190" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <linearGradient id="folder-back-blue" x2="0" y2="1">
                <stop stop-color="#20bcf1"/><stop offset="1" stop-color="#006aba"/>
              </linearGradient>
            </defs>
            <path fill="url(#folder-back-blue)" d="M0 25 Q0 0 25 0 H142 C169 0 169 25 196 25 H534 Q560 25 560 51 V168 Q560 190 536 190 H24 Q0 190 0 168 Z"/>
            <rect x="22" y="46" width="516" height="31" rx="9" fill="#f4fbff"/>
          </svg>
          <div class="contact-paper-track">
            <form class="contact-form paper-sheet">
              <div class="contact-fields">
                <label>Ad və soyad<input name="name" autocomplete="name" maxlength="100" required></label>
                <label>Telefon nömrəsi<input name="phone" type="tel" autocomplete="tel" maxlength="35" required></label>
                <label class="contact-trap" aria-hidden="true">Website<input name="website" tabindex="-1" autocomplete="off"></label>
                <label>Qeyd<textarea name="note" rows="2" maxlength="500"></textarea></label>
                <button class="text-link yellow-underline" type="submit" lang="en">Done</button>
                <div class="contact-message" hidden>
                  <label>Instagram üçün mesaj<textarea readonly rows="5"></textarea></label>
                  <div class="text-actions">
                    <button type="button" class="text-link" data-copy>Mesajı kopyala</button>
                    <a class="text-link" href="https://www.instagram.com/sslschool.az/" target="_blank" rel="noopener">Instagram-ı aç</a>
                  </div>
                </div>
              </div>
              <div class="contact-sent" hidden>
                <span class="contact-sent-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.6 4.5L19 7.5"/></svg>
                </span>
                <h3 class="contact-sent-title" tabindex="-1">Müraciətin göndərildi</h3>
                <p class="contact-sent-intro">Tezliklə səninlə əlaqə saxlayacağıq.</p>
                <dl class="contact-sent-details">
                  <div><dt>Ad və soyad</dt><dd data-sent="name"></dd></div>
                  <div><dt>Telefon</dt><dd data-sent="phone"></dd></div>
                  <div data-sent-row="note"><dt>Qeyd</dt><dd data-sent="note"></dd></div>
                </dl>
                <button type="button" class="text-link yellow-underline" data-again>Yeni müraciət yarat</button>
              </div>
              <p class="contact-status" role="status"></p>
            </form>
          </div>
          <div class="contact-folder-front" aria-hidden="true"></div>
          <button type="button" class="paper-open contact-folder-open" hidden><span>Kağızı çıxar</span></button>
        </div>
      </div>
    </div>
  </section>`;
}

function setupDesktop(animationsPaused) {
  const desktop = document.querySelector('.desktop-hero');
  const wallpaper = desktop.querySelector('.desktop-wallpaper');
  const narrator = desktop.querySelector('#puppet-message');
  const dialogue = {
    'teacher-felt-red': ['Can you give an example?', 'Why do you think that?', 'What do you think?'],
    'teacher-felt-book': ['Can you tell me more?', 'What would you say next?', 'How would you say it?'],
    'student-felt': ['In my experience…', 'Here’s what I mean.', 'I think…', 'Let me try!'],
  };

  function resetWallpaper() {
    wallpaper.style.translate = '';
  }

  desktop.addEventListener('pointermove', event => {
    if (animationsPaused() || event.pointerType !== 'mouse') return;
    const coords = desktop.getBoundingClientRect();
    const x = ((event.clientX - coords.left) / coords.width - 0.5) * 23;
    const y = ((event.clientY - coords.top) / coords.height - 0.5) * 19;
    wallpaper.style.translate = `${x}px ${y}px`;
  });
  desktop.addEventListener('pointerleave', resetWallpaper);

  for (const puppet of desktop.querySelectorAll('[data-puppet]')) {
    const mount = puppet.parentElement;
    const character = puppet.dataset.puppet;
    const speech = desktop.querySelector(`#${character}-speech`);
    let nextLine = 0;
    let gesture;
    let spring;
    let justDragged = false;

    function respond(x = 0, y = 0) {
      const words = dialogue[character][nextLine];
      nextLine = (nextLine + 1) % dialogue[character].length;
      speech.textContent = words;
      narrator.textContent = words;
      spring?.cancel();
      if (animationsPaused()) return;
      spring = mount.animate([
        { translate: `${x}px ${y}px`, rotate: `${x / 11}deg` },
        { translate: `${-x / 5}px ${-Math.max(12, y / 4)}px`, rotate: `${-x / 15}deg`, offset: 0.57 },
        { translate: '0px 0px', rotate: '0deg' },
      ], { duration: 620, easing: 'cubic-bezier(.22,.74,.3,1)' });
    }

    function resetDrag() {
      gesture = undefined;
      mount.style.translate = '';
      mount.style.rotate = '';
    }

    puppet.addEventListener('pointerdown', event => {
      if (!event.isPrimary || event.button !== 0) return;
      justDragged = false;
      if (animationsPaused()) return;
      spring?.cancel();
      gesture = { id: event.pointerId, left: event.clientX, top: event.clientY, x: 0, y: 0, moved: false };
      puppet.setPointerCapture(event.pointerId);
    });

    puppet.addEventListener('pointermove', event => {
      if (gesture?.id !== event.pointerId) return;
      const dx = event.clientX - gesture.left;
      const dy = event.clientY - gesture.top;
      gesture.moved ||= Math.hypot(dx, dy) > 5;
      if (!gesture.moved) return;
      const limit = Math.min(desktop.clientWidth * 0.1, 100);
      gesture.x = Math.max(-limit, Math.min(limit, dx * 0.87));
      gesture.y = Math.max(-92, Math.min(92, dy * 0.87));
      mount.style.translate = `${gesture.x}px ${gesture.y}px`;
      mount.style.rotate = `${gesture.x / 11}deg`;
    });

    puppet.addEventListener('pointerup', event => {
      if (gesture?.id !== event.pointerId) return;
      const { x, y, moved } = gesture;
      resetDrag();
      justDragged = moved;
      if (moved) respond(x, y);
    });
    puppet.addEventListener('pointercancel', resetDrag);
    puppet.addEventListener('lostpointercapture', resetDrag);
    puppet.addEventListener('click', event => {
      if (event.detail === 0 || !justDragged) respond();
      justDragged = false;
    });
  }
}

function setupContact(courseTitle) {
  const form = document.querySelector('.contact-form');
  const message = form.querySelector('.contact-message');
  const field = message.querySelector('textarea');
  const status = form.querySelector('.contact-status');
  const noteField = form.elements.namedItem('note');
  if (courseTitle && !noteField.value) noteField.value = `“${courseTitle}” kursu ilə maraqlanıram.`;

  form.addEventListener('input', event => {
    if (event.target === field) return;
    message.hidden = true;
    status.textContent = '';
  });

  const submit = form.querySelector('button[type="submit"]');
  const fields = form.querySelector('.contact-fields');
  const sent = form.querySelector('.contact-sent');
  const again = sent.querySelector('[data-again]');
  const api = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? 'http://localhost:3000' : 'https://api.sslschool.az';

  // Mirrors the API limit (4 attempts an hour) so a visitor hears about it before sending.
  const attemptLimit = 4;
  const attemptWindow = 60 * 60 * 1000;
  const attemptsKey = 'ssl-consultation-attempts';
  let blockedUntil = 0;

  function recentAttempts() {
    try {
      const saved = JSON.parse(localStorage.getItem(attemptsKey) || '[]');
      return Array.isArray(saved) ? saved.filter(at => Date.now() - at < attemptWindow) : [];
    } catch {
      return [];
    }
  }
  function rememberAttempt() {
    try { localStorage.setItem(attemptsKey, JSON.stringify([...recentAttempts(), Date.now()])); } catch {}
  }
  function waitUntil() {
    const attempts = recentAttempts();
    const local = attempts.length >= attemptLimit ? attempts[attempts.length - attemptLimit] + attemptWindow : 0;
    return Math.max(local, blockedUntil);
  }
  function limitMessage(until) {
    const minutes = Math.max(1, Math.ceil((until - Date.now()) / 60000));
    return `Çox sayda cəhd etdin. ${minutes} dəqiqə sonra yenidən yoxla və ya Instagram-da yaz.`;
  }
  function refreshAgain() {
    const until = waitUntil();
    const limited = until > Date.now();
    again.disabled = limited;
    again.textContent = limited ? limitMessage(until) : 'Yeni müraciət yarat';
  }

  function showSent(request) {
    for (const key of ['name', 'phone', 'note']) sent.querySelector(`[data-sent="${key}"]`).textContent = request[key];
    sent.querySelector('[data-sent-row="note"]').hidden = !request.note;
    status.textContent = '';
    fields.hidden = true;
    sent.hidden = false;
    form.classList.remove('is-new-sheet');
    void form.offsetWidth;
    form.classList.add('is-new-sheet');
    refreshAgain();
    sent.querySelector('.contact-sent-title').focus({ preventScroll: true });
  }

  again.addEventListener('click', () => {
    if (waitUntil() > Date.now()) return refreshAgain();
    // Keep the previous answers so the visitor only edits what changed.
    sent.hidden = true;
    fields.hidden = false;
    form.classList.remove('is-new-sheet');
    void form.offsetWidth;
    form.classList.add('is-new-sheet');
    form.elements.namedItem('name').focus({ preventScroll: true });
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (submit.disabled) return;
    const values = new FormData(form);
    const request = {
      name: values.get('name').trim(),
      phone: values.get('phone').trim(),
      note: values.get('note').trim(),
      website: values.get('website'),
    };
    message.hidden = true;
    const until = waitUntil();
    if (until > Date.now()) {
      status.textContent = limitMessage(until);
      return;
    }
    submit.disabled = true;
    status.textContent = 'Göndərilir…';
    try {
      rememberAttempt();
      const response = await fetch(`${api}/api/consultation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });
      if (response.status === 422) {
        status.textContent = 'Telefon nömrəsini yoxla: yalnız rəqəmlər, məsələn +994 50 123 45 67.';
        return;
      }
      if (response.status === 429) {
        const seconds = Number(response.headers.get('retry-after')) || 3600;
        blockedUntil = Date.now() + seconds * 1000;
        status.textContent = limitMessage(blockedUntil);
        return;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      showSent(request);
    } catch {
      // Email delivery is down: fall back to a ready-made Instagram message.
      field.value = [
        'Salam, SSL School!',
        'Konsultasiya üçün müraciət etmək istərdim.',
        `Ad və soyad: ${request.name}`,
        `Telefon: ${request.phone}`,
        request.note && `Qeyd: ${request.note}`,
      ].filter(Boolean).join('\n');
      message.hidden = false;
      status.textContent = 'Müraciəti göndərmək alınmadı. Mesajı kopyala və Instagram-da göndər.';
      field.focus();
    } finally {
      submit.disabled = false;
    }
  });

  form.querySelector('[data-copy]').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(field.value);
      status.textContent = 'Mesaj kopyalandı.';
    } catch {
      field.focus();
      field.select();
      status.textContent = 'Mətn seçildi. Kopyalamaq üçün cihazının kopyalama düyməsindən istifadə et.';
    }
  });
}
