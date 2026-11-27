// Real student reviews (texts are excerpts of their own words).
// Students without a photo get the default profile artwork.
const reviews = [
  { name: 'Gulshen Mukhtarli', photo: './assets/reviews/gulshen-mukhtarli.jpg', topic: 'Müəllimlər', text: 'I really like my teachers, and your teaching methods help me improve.', color: '#f0e2ff' },
  { name: 'Nazila', photo: './assets/reviews/nazila.jpg', topic: 'Tövsiyə', text: 'I really like the teachers because they are friendly, supportive and patient. I would definitely recommend them to my friends!', color: '#ffebcf' },
  { name: 'Riad Mammadov', photo: './assets/reviews/riad-mammadov.jpg', topic: 'Danışıq', text: 'The thing I love about our lessons is speaking. The site is cool too, and it makes everything a lot easier.', color: '#e6e6ff' },
  { name: 'Turqay Alizade', photo: './assets/reviews/turqay-alizade.jpg', topic: 'İnkişaf', text: 'Dərslərə başlamazdan əvvəl A0 səviyyədə idim. İndi sadə cümlələr qura bilirəm və daha çox söz öyrənmişəm.', color: '#e1f1eb' },
  { name: 'Nazrin Abdullayeva', photo: './assets/reviews/nazrin-abdullayeva.jpg', topic: 'Hisslər', text: 'I soon realized that it was about much more than just learning a language. I feel very lucky to have met you.', color: '#f8e1ec' },
  { name: 'Aylin', photo: './assets/reviews/aylin.jpg', topic: 'Tövsiyə', text: 'I’ve become more confident in speaking English and expressing my thoughts. I would definitely recommend you to my friends!', color: '#f0e2ff' },
  { name: 'Aynur Zulfugarli', photo: './assets/reviews/aynur-zulfugarli.jpg', topic: 'Müəllimlər', text: 'I really like the teachers and your new ideas. Yes, I would definitely recommend you to a friend.', color: '#ffebcf' },
  { name: 'Ulviyya Amirova', photo: null, topic: 'Müəllimlər', text: 'You are the best teachers I have ever seen.', color: '#e6e6ff' },
  { name: 'Maryam', photo: './assets/reviews/maryam.jpg', topic: 'Hisslər', text: 'I love my teachers. They make me happy, and I learn the lessons very well.', color: '#e1f1eb' },
  { name: 'Alirza', photo: './assets/reviews/alirza.jpg', topic: 'İnkişaf', text: 'I have improved my skills in making up sentences and acquiring new vocabulary. Everything is perfect.', color: '#f8e1ec' },
  { name: 'Amil Kazimov', photo: './assets/reviews/amil-kazimov.jpg', topic: 'Müəllimlər', text: 'My teachers are very kind, supportive, and professional. Thank you for motivating me and helping me learn English.', color: '#f0e2ff' },
  { name: 'Nigar Aliyeva', photo: './assets/reviews/nigar-aliyeva.jpg', topic: 'Tövsiyə', text: 'You are the best teachers I have ever had, and of course I have recommended you to my friends.', color: '#ffebcf' },
  { name: 'Aytekin Abdullayeva', photo: './assets/reviews/aytekin-abdullayeva.jpg', topic: 'Hisslər', text: 'Our lessons became more than just something I had to do. They turned into something I genuinely looked forward to.', color: '#e6e6ff' },
  { name: 'Emine Agayeva', photo: null, topic: 'Tövsiyə', text: 'My biggest progress was not only in English but also in my personal development. I already recommended you to my own sister.', color: '#e1f1eb' },
  { name: 'Kamala Abdulrazagova', photo: './assets/reviews/kamala-abdulrazagova.jpg', topic: 'Kömək', text: 'Thanks to you, I can speak English more fluently and confidently. I have happily recommended your lessons to my friends!', color: '#f8e1ec' },
  { name: 'Leyla Ahmadova', photo: null, topic: 'Müəllimlər', text: 'I became comfortable sharing my thoughts without being afraid of making mistakes. The teachers were friendly, kind, and supportive.', color: '#f0e2ff' },
  { name: 'Xedice Abulzade', photo: null, topic: 'Tövsiyə', text: 'I have recommended SSL to many friends and family members, and several of them have joined.', color: '#ffebcf' },
  { name: 'Fidan Amiraslanova', photo: './assets/reviews/fidan-amiraslanova.jpg', topic: 'Hisslər', text: 'I felt happy and special during our lessons. You are both my teachers and my friends.', color: '#e6e6ff' },
  { name: 'Mehri Jafarli', photo: null, topic: 'Hisslər', text: 'I’ve improved a lot and feel much more confident in English. I’d definitely recommend it to a friend!', color: '#e1f1eb' },
  { name: 'Aysel Safarli', photo: null, topic: 'Kömək', text: 'Thank you for helping me believe in myself and showing me that speaking English isn’t as impossible as I once thought.', color: '#f8e1ec' },
  { name: 'Nazrin Rahimli', photo: './assets/reviews/nazrin-rahimli.jpg', topic: 'Hisslər', text: 'I enjoyed every class so much that sometimes I didn’t even notice how quickly the time passed.', color: '#f0e2ff' },
  { name: 'Valentina Asgarova', photo: './assets/reviews/valentina-asgarova.jpg', topic: 'Hisslər', text: 'Your positivity and strategy boosted my confidence. Every single lesson felt like therapy.', color: '#ffebcf' },
  { name: 'Narmina Agayeva', photo: './assets/reviews/narmina-agayeva.jpg', topic: 'Müəllimlər', text: 'The lessons never felt like ordinary classes; they were more like deep conversations. I would definitely recommend you to a friend.', color: '#e6e6ff' },
  { name: 'Fidan Gadirova', photo: './assets/reviews/fidan-gadirova.jpg', topic: 'Tövsiyə', text: 'My studying time with you was one of the best experiences of my life. I still recommend you to everyone around me.', color: '#e1f1eb' },
  { name: 'Ulviyya Mehraliyeva', photo: './assets/reviews/ulviyya-mehraliyeva.jpg', topic: 'Kömək', text: 'I made significant progress. Thank you for your time, support, and dedication.', color: '#f8e1ec' },
  { name: 'Peyker Aliyeva', photo: './assets/reviews/peyker-aliyeva.jpg', topic: 'Tövsiyə', text: 'Choosing SSL School was one of the best decisions I’ve made. Many of my friends became SSL students after me.', color: '#f0e2ff' },
  { name: 'Amin Bagirov', photo: './assets/reviews/amin-bagirov.jpg', topic: 'Kömək', text: 'You taught me how to be very relaxed when speaking. Now I can even communicate comfortably with foreigners.', color: '#ffebcf' },
  { name: 'Aylin Azizova', photo: './assets/reviews/aylin-azizova.jpg', topic: 'Kömək', text: 'Within just four months, I became much more comfortable talking to my professors in English and regained my confidence.', color: '#e6e6ff' },
  { name: 'Aydan Mammadova', photo: './assets/reviews/aydan-mammadova.jpg', topic: 'Hisslər', text: 'One of the things I appreciated most was being listened to without being judged.', color: '#e1f1eb' },
];
const defaultReviewPhoto = './assets/reviews/default-profile.svg';

function reviewGallery() {
  return `<section id="reyler" class="home-section home-feedback" aria-labelledby="feedback-title" data-home-sky="reviews">
    <div class="wrap review-intro" data-reveal>
      <h2 id="feedback-title">Tələbələrimiz <em>nə deyir?</em></h2>
      <a class="text-link" href="https://www.instagram.com/sslschool.az/" target="_blank" rel="noopener">Rəyləri Instagram-da oxu</a>
    </div>
    <div id="review-collection" class="review-collection">
      <div class="review-stage" tabindex="0" role="group" aria-label="Tələbə rəyləri">
        <ol class="review-list" role="list">
          ${reviews.map(review => `<li class="review-slide" style="--review-paper:${review.color}">
            <figure class="review-card">
              <span class="review-topic">${review.topic}</span>
              <blockquote class="review-text">${review.text}</blockquote>
              <figcaption class="review-identity">
                <img class="review-portrait${review.photo ? '' : ' is-default'}" src="${review.photo || defaultReviewPhoto}" alt="" width="45" height="45" loading="lazy" decoding="async" draggable="false">
                <span>${review.name}</span>
              </figcaption>
            </figure>
          </li>`).join('')}
        </ol>
      </div>
      <div class="review-navigation">
        <button type="button" data-review-step="-1" aria-label="Əvvəlki rəy">←</button>
        <span class="review-count">1 / ${reviews.length}</span>
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
