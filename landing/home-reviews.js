// Real student reviews (texts are excerpts of their own words).
// Students without a photo get the default profile artwork.
const reviews = [
  { name: 'Gulshen Mukhtarli', photo: './assets/reviews/gulshen-mukhtarli.jpg', text: 'The more I speak, the more comfortable I become. I really like my teachers, and your teaching methods help me improve.', color: '#f0e2ff' },
  { name: 'Nazila', photo: './assets/reviews/nazila.jpg', text: 'I’m more confident and less afraid of making mistakes. The teachers are friendly, supportive and patient.', color: '#ffebcf' },
  { name: 'Riad Mammadov', photo: './assets/reviews/riad-mammadov.jpg', text: 'The thing I love about our lessons is speaking. The site is cool too, and it makes everything a lot easier.', color: '#e6e6ff' },
  { name: 'Turqay Alizade', photo: './assets/reviews/turqay-alizade.jpg', text: 'Əvvəlki və indiki ingilis dili səviyyəmi müqayisə etdikdə çox irəliləyiş var. İndi sadə cümlələr qura bilirəm.', color: '#e1f1eb' },
  { name: 'Nazrin Abdullayeva', photo: './assets/reviews/nazrin-abdullayeva.jpg', text: 'I soon realized that it was about much more than just learning a language. I feel very lucky to have met you.', color: '#f8e1ec' },
  { name: 'Aylin', photo: './assets/reviews/aylin.jpg', text: 'I’ve become more confident in speaking English and expressing my thoughts. I would definitely recommend you to my friends!', color: '#f0e2ff' },
  { name: 'Aynur Zulfugarli', photo: './assets/reviews/aynur-zulfugarli.jpg', text: 'I really like the teachers and your new ideas. Yes, I would definitely recommend you to a friend.', color: '#ffebcf' },
  { name: 'Ulviyya Amirova', photo: null, text: 'For me, everything is the best. You are the best teachers I have ever seen.', color: '#e6e6ff' },
  { name: 'Maryam', photo: './assets/reviews/maryam.jpg', text: 'I love my teachers. They make me happy, and I learn the lessons very well.', color: '#e1f1eb' },
  { name: 'Alirza', photo: './assets/reviews/alirza.jpg', text: 'I have learned and improved my skills in making up sentences and acquiring new vocabulary. Everything is perfect.', color: '#f8e1ec' },
  { name: 'Amil Kazimov', photo: './assets/reviews/amil-kazimov.jpg', text: 'My teachers are very kind, supportive, and professional. Thank you for motivating me.', color: '#f0e2ff' },
  { name: 'Nigar Aliyeva', photo: './assets/reviews/nigar-aliyeva.jpg', text: 'You are the best teachers I have ever had, and I can see how much effort you put into improving your lessons every day.', color: '#ffebcf' },
  { name: 'Aytekin Abdullayeva', photo: './assets/reviews/aytekin-abdullayeva.jpg', text: 'Our lessons became more than just something I had to do, they turned into something I genuinely looked forward to.', color: '#e6e6ff' },
  { name: 'Emine Agayeva', photo: null, text: 'I loved the topics we discussed. They were different from the typical topics you usually come across in language courses.', color: '#e1f1eb' },
  { name: 'Kamala Abdulrazagova', photo: './assets/reviews/kamala-abdulrazagova.jpg', text: 'Thanks to you, I can speak English more fluently and confidently. The skills I gained are still very useful to me today.', color: '#f8e1ec' },
  { name: 'Leyla Ahmadova', photo: null, text: 'I became more comfortable speaking English and sharing my thoughts without being afraid of making mistakes.', color: '#f0e2ff' },
  { name: 'Xedice Abulzade', photo: null, text: 'I have recommended SSL to many people around me, including friends and family members, and several of them have joined.', color: '#ffebcf' },
  { name: 'Fidan Amiraslanova', photo: './assets/reviews/fidan-amiraslanova.jpg', text: 'I felt happy and special during our lessons. You are both my teachers and my friends.', color: '#e6e6ff' },
  { name: 'Mehri Jafarli', photo: null, text: 'I’ve improved a lot and feel much more confident in English. I loved the teachers and the friendly atmosphere.', color: '#e1f1eb' },
  { name: 'Aysel Safarli', photo: null, text: 'Thank you for helping me believe in myself and showing me that speaking English isn’t as impossible as I once thought.', color: '#f8e1ec' },
  { name: 'Nazrin Rahimli', photo: './assets/reviews/nazrin-rahimli.jpg', text: 'I enjoyed every class so much that sometimes I didn’t even notice how quickly the time passed.', color: '#f0e2ff' },
  { name: 'Valentina Asgarova', photo: './assets/reviews/valentina-asgarova.jpg', text: 'Your positivity and strategy boosted my confidence. Every single lesson felt like therapy.', color: '#ffebcf' },
  { name: 'Narmina Agayeva', photo: './assets/reviews/narmina-agayeva.jpg', text: 'One of my favourite things was that the lessons never felt like ordinary classes, they were more like deep conversations.', color: '#e6e6ff' },
  { name: 'Fidan Gadirova', photo: './assets/reviews/fidan-gadirova.jpg', text: 'My studying time with you was one of the best experiences of my life. You changed my perspectives on many things.', color: '#e1f1eb' },
  { name: 'Ulviyya Mehraliyeva', photo: './assets/reviews/ulviyya-mehraliyeva.jpg', text: 'I made significant progress. It was a great source of motivation for me, and I am still continuing to learn English.', color: '#f8e1ec' },
  { name: 'Peyker Aliyeva', photo: './assets/reviews/peyker-aliyeva.jpg', text: 'Choosing SSL School was one of the best decisions I’ve made. Many of my friends became SSL students after me.', color: '#f0e2ff' },
  { name: 'Amin Bagirov', photo: './assets/reviews/amin-bagirov.jpg', text: 'Before, I used to overthink things, worrying that I might say a word incorrectly, but now I feel completely at ease.', color: '#ffebcf' },
  { name: 'Aylin Azizova', photo: './assets/reviews/aylin-azizova.jpg', text: 'Within just four months, I became much more comfortable talking to my professors in English.', color: '#e6e6ff' },
  { name: 'Aydan Mammadova', photo: './assets/reviews/aydan-mammadova.jpg', text: 'One of the things I appreciated most was being listened to without being judged.', color: '#e1f1eb' },
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
