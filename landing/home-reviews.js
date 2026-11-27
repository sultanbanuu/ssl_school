const reviewSamples = [
  { name: 'Nümunə tələbə A', topic: 'Danışıq', text: 'Gündəlik mövzularda söhbət etdikcə fikrimi demək daha rahat oldu.', color: '#f0e2ff' },
  { name: 'Nümunə tələbə B', topic: 'Söz ehtiyatı', text: 'Yeni sözləri öz cümlələrimdə işlətmək məşqi xoşuma gəldi.', color: '#ffebcf' },
  { name: 'Nümunə tələbə C', topic: 'Cümlə quruluşu', text: 'Cümləni quranda harada çətinlik çəkdiyimi daha aydın gördüm.', color: '#e6e6ff' },
  { name: 'Nümunə tələbə D', topic: 'Dinləmə', text: 'Qısa dinləmə məşqlərindən sonra eşitdiklərimə cavab verməyi sınadım.', color: '#e1f1eb' },
  { name: 'Nümunə tələbə E', topic: 'Dərs cədvəli', text: 'Mənə uyğun saatı seçmək dərslərə vaxt ayırmağı asanlaşdırdı.', color: '#f8e1ec' },
];

function reviewGallery() {
  return `<section id="reyler" class="home-section home-feedback" aria-labelledby="feedback-title" data-home-sky="reviews">
    <div class="wrap review-intro" data-reveal>
      <h2 id="feedback-title">Tələbələrimiz <em>nə deyir?</em></h2>
      <a class="text-link" href="https://www.instagram.com/sslschool.az/" target="_blank" rel="noopener">Rəyləri Instagram-da oxu</a>
    </div>
    <div id="review-collection" class="review-collection">
      <div class="review-stage" tabindex="0" role="group" aria-label="Nümunə rəy kartları">
        <ol class="review-list" role="list">
          ${reviewSamples.map((review, index) => `<li class="review-slide" style="--review-paper:${review.color}">
            <figure class="review-card">
              <span class="review-topic">Nümunə · ${review.topic}</span>
              <blockquote class="review-text">${review.text}</blockquote>
              <figcaption class="review-identity">
                <span class="review-portrait" aria-hidden="true" style="--portrait-column:${index % 3};--portrait-row:${Math.floor(index / 3)}"></span>
                <span>${review.name}</span>
              </figcaption>
            </figure>
          </li>`).join('')}
        </ol>
      </div>
      <div class="review-navigation">
        <button type="button" data-review-step="-1" aria-label="Əvvəlki rəy">←</button>
        <span class="review-count">1 / ${reviewSamples.length}</span>
        <button type="button" data-review-step="1" aria-label="Növbəti rəy">→</button>
      </div>
    </div>
  </section>`;
}

function setupReviews(animationsPaused) {
  const section = document.querySelector('.home-feedback');
  const collection = section.querySelector('.review-collection');
  const stage = collection.querySelector('.review-stage');
  const slides = [...stage.querySelectorAll('.review-slide')];
  const count = collection.querySelector('.review-count');
  const size = slides.length;
  const half = size / 2;
  let position = 0;
  let current = -1;
  let visible = !('IntersectionObserver' in window);
  let hovered = false;
  let frame = 0;
  let previousTime = 0;
  let gesture;

  function showCards() {
    slides.forEach((slide, index) => {
      const offset = (index - position + size + half) % size - half;
      const angle = offset * 0.66;
      const distance = Math.abs(offset);
      slide.style.setProperty('--review-x', Math.sin(angle));
      slide.style.setProperty('--review-z', Math.cos(angle) - 1);
      slide.style.setProperty('--review-yaw', `${angle}rad`);
      slide.style.setProperty('--review-distance', distance);
      slide.style.zIndex = Math.round(100 - distance * 20);
    });
    const front = Math.round(position) % size;
    if (front === current) return;
    current = front;
    count.textContent = `${current + 1} / ${size}`;
  }

  function spin(time) {
    if (previousTime) position = (position + Math.min(46, time - previousTime) / 4000) % size;
    previousTime = time;
    showCards();
    frame = requestAnimationFrame(spin);
  }

  function syncSpin() {
    const playing = visible && !hovered && !gesture && !stage.matches(':focus-visible') && !document.hidden && !animationsPaused();
    stage.classList.toggle('is-spinning', playing);
    if (playing && !frame) frame = requestAnimationFrame(spin);
    if (!playing && frame) {
      cancelAnimationFrame(frame);
      frame = 0;
      previousTime = 0;
    }
  }

  function move(step) {
    position = (current + step + size) % size;
    showCards();
  }

  collection.querySelectorAll('[data-review-step]').forEach(control => {
    control.addEventListener('click', () => move(Number(control.dataset.reviewStep)));
  });

  stage.addEventListener('keydown', event => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    move(event.key === 'ArrowLeft' ? -1 : 1);
  });

  stage.addEventListener('pointerenter', event => {
    if (event.pointerType === 'touch') return;
    hovered = true;
    syncSpin();
  });
  stage.addEventListener('pointerleave', () => {
    hovered = false;
    syncSpin();
  });
  stage.addEventListener('focus', syncSpin);
  stage.addEventListener('blur', syncSpin);

  stage.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0) return;
    gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, active: false };
    stage.setPointerCapture(event.pointerId);
    syncSpin();
  });

  stage.addEventListener('pointermove', event => {
    if (gesture?.id !== event.pointerId) return;
    const distance = event.clientX - gesture.x;
    if (!gesture.active && Math.abs(distance) > Math.max(9, Math.abs(event.clientY - gesture.y))) {
      gesture.active = true;
      stage.classList.add('is-dragging');
    }
    if (gesture.active && !animationsPaused()) {
      stage.style.setProperty('--review-drag', `${Math.max(-90, Math.min(90, distance * 0.5))}px`);
    }
  });

  function finishDrag(event) {
    if (gesture?.id !== event.pointerId) return;
    const distance = event.clientX - gesture.x;
    const changedCard = gesture.active && event.type === 'pointerup' && Math.abs(distance) > 32;
    gesture = undefined;
    stage.classList.remove('is-dragging');
    stage.style.removeProperty('--review-drag');
    if (changedCard) move(distance > 0 ? -1 : 1);
    syncSpin();
  }

  stage.addEventListener('pointerup', finishDrag);
  stage.addEventListener('pointercancel', finishDrag);
  stage.addEventListener('lostpointercapture', finishDrag);
  document.addEventListener('visibilitychange', syncSpin);
  new MutationObserver(syncSpin).observe(document.documentElement, { attributeFilter: ['class'] });
  if ('IntersectionObserver' in window) {
    const visibility = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      syncSpin();
    });
    visibility.observe(stage);
  }
  showCards();
}
