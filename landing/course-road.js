const courseHeights = [355, 305, 368, 295, 342];
const courseHills = [415, 249, 424, 271];
const redGlassesTeacher = { image: 'teacher-felt-red', width: 558 };
const blackGlassesTeacher = { image: 'teacher-felt-book', width: 434 };
const courseEncounters = {
  'english-in-context': {
    description: 'Tələbə yolda qırmızı eynəkli müəllimlə görüşür.',
    teachers: [redGlassesTeacher],
  },
  'all-in-one-english': {
    description: 'Tələbə burada Sayad və Sultanbanu ilə görüşür.',
    teachers: [redGlassesTeacher, blackGlassesTeacher],
  },
  'lean-leader': {
    description: 'Tələbə qara eynəkli müəllimlə görüşür.',
    teachers: [blackGlassesTeacher],
  },
  'academic-prep': {
    description: 'Tələbə imtahan hazırlığı yolunda Sayad və Sultanbanu ilə görüşür.',
    teachers: [redGlassesTeacher, blackGlassesTeacher],
  },
};

function courseRoad() {
  const encounters = schoolCourses.map((course, stop) => {
    const encounter = courseEncounters[course.id];
    if (!encounter) return '';
    return `<div class="course-encounter" data-teacher-stop="${stop}">
      ${encounter.teachers.map(({ image, width }) => `<div class="course-teacher">
        <img src="./assets/${image}.webp" width="${width}" height="826" alt="">
      </div>`).join('')}
    </div>`;
  });
  return `<section class="course-journey" aria-labelledby="course-road-title">
    <canvas class="course-sky" aria-hidden="true"></canvas>
    <h1 class="wrap course-road-title" id="course-road-title">Kurslar</h1>
    <div class="wrap course-copy-list">
      ${schoolCourses.map((course, index) => `<article class="course-copy"${index ? ' hidden' : ''}>
        <p class="course-category">${course.category}</p>
        <h2 lang="en">${course.title}</h2>
        <p class="course-description">${course.summary}</p>
        ${courseEncounters[course.id] ? `<p class="sr-only">${courseEncounters[course.id].description}</p>` : ''}
        <a class="text-link" href="./?page=kurs&amp;kurs=${course.id}" data-course-detail="${course.id}" aria-haspopup="dialog" aria-label="${course.title} · Kurs haqqında">Kurs haqqında</a>
      </article>`).join('')}
    </div>
    <div class="course-stage">
      <div class="course-scroller" id="course-scroller" tabindex="0" aria-label="Kurs yolu. Sağa və sola sürüşdür.">
        <div class="course-world" style="--course-intervals:${schoolCourses.length - 1}">
          <svg class="course-trail" viewBox="0 0 720 500" preserveAspectRatio="none" aria-hidden="true">
            <path vector-effect="non-scaling-stroke"/>
          </svg>
          <div class="course-teachers" aria-hidden="true">${encounters.join('')}</div>
        </div>
      </div>
      ${courseWalker()}
    </div>
    <div class="wrap course-steps" role="group" aria-label="Kurslar arasında keçid">
        <button type="button" data-course-step="-1" aria-controls="course-scroller" disabled>Əvvəlki kurs</button>
        <button type="button" data-course-step="1" aria-controls="course-scroller">Növbəti kurs</button>
    </div>
  </section>`;
}

function courseTrail(width, step) {
  const middle = width / 2;
  const points = [[0, 418], [middle * .48, 395]];
  courseHeights.forEach((height, index) => {
    const x = middle + index * step;
    points.push([x, height]);
    if (index < courseHills.length) points.push([x + step * (.43 + (index % 2) * .08), courseHills[index]]);
  });
  points.push([middle + (courseHeights.length - 1) * step + middle * .52, 389], [width + (courseHeights.length - 1) * step, 373]);
  return points;
}

function setupCourseRoad(initialStop = 0) {
  const sky = document.querySelector('.course-sky');
  const stage = document.querySelector('.course-stage');
  const scroller = stage.querySelector('.course-scroller');
  const svg = stage.querySelector('.course-trail');
  const line = svg.querySelector('path');
  const walker = stage.querySelector('.course-walker');
  const paintSky = createCourseSky(sky);
  const updateGait = createCourseGait(walker);
  const captions = [...document.querySelectorAll('.course-copy')];
  const encounters = [...stage.querySelectorAll('.course-encounter')].map(element => ({
    element,
    stop: Number(element.dataset.teacherStop),
    teachers: [...element.children].map(element => ({ element, offset: 0 })),
  }));
  const lastCourse = captions.length - 1;
  const [previous, next] = document.querySelectorAll('[data-course-step]');
  let step = 0;
  let stageHeight = 0;
  let points = [];
  let frame = 0;
  let index = 0;
  let lastLeft = 0;
  let direction = 1;
  let drag;

  function trailAt(x) {
    const nextPoint = points.findIndex(([pointX]) => pointX >= x);
    const segment = nextPoint < 0 ? points.length - 1 : Math.max(1, nextPoint);
    const [[startX, startY], [endX, endY]] = [points[segment - 1], points[segment]];
    const fraction = clampUnit((x - startX) / (endX - startX));
    return {
      height: (startY + (endY - startY) * smoothUnit(fraction)) / 5,
      slope: (endY - startY) / (endX - startX) * 6 * fraction * (1 - fraction) * stageHeight / 500,
    };
  }

  function drawEncounters(left, middle) {
    let upcoming;
    let distance = Infinity;
    for (const encounter of encounters) {
      const ahead = (encounter.stop * step - left) * direction;
      if (ahead > .5 && ahead < distance) {
        upcoming = encounter;
        distance = ahead;
      }
    }

    for (const encounter of encounters) {
      const { element, stop, teachers, arrivalDistance, visibleDistance, fadeDistance } = encounter;
      if (encounter !== upcoming) {
        element.style.opacity = '0';
        continue;
      }
      // Reveal the whole group together and fade it as the first teacher is reached.
      const enter = smoothUnit(clampUnit((visibleDistance - distance) / fadeDistance));
      const arrive = smoothUnit(clampUnit((distance - arrivalDistance) / fadeDistance));
      element.style.opacity = (enter * arrive).toFixed(3);
      if (!enter || !arrive) continue;

      const meetingPoint = middle + stop * step;
      element.style.setProperty('--teacher-facing', -direction);
      for (const teacher of teachers) {
        const x = meetingPoint + direction * teacher.offset;
        teacher.element.style.left = `${x}px`;
        teacher.element.style.top = `${trailAt(x).height}%`;
      }
    }
  }

  function draw() {
    frame = 0;
    if (!step) return;
    const left = scroller.scrollLeft;
    const position = left / step;
    const current = Math.max(0, Math.min(lastCourse, Math.round(position)));
    const middle = scroller.clientWidth / 2;
    const { height, slope } = trailAt(left + middle);
    walker.style.top = `${height}%`;

    const delta = left - lastLeft;
    if (Math.abs(delta) >= .2) direction = Math.sign(delta);
    drawEncounters(left, middle);
    updateGait(delta, slope, direction);
    lastLeft = left;
    paintSky(position);

    if (current !== index) {
      captions[index].hidden = true;
      captions[current].hidden = false;
      previous.disabled = current === 0;
      next.disabled = current === lastCourse;
      index = current;
    }
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(draw);
  }

  function layout() {
    const position = step ? scroller.scrollLeft / step : initialStop;
    const width = scroller.clientWidth;
    const world = scroller.scrollWidth;
    step = (world - width) / lastCourse;
    if (!step) return;
    stageHeight = stage.clientHeight;
    const walkerBounds = walker.getBoundingClientRect();
    const teacherGap = Math.max(6, walkerBounds.height * .13);
    for (const encounter of encounters) {
      let farEdge = 0;
      for (const [index, teacher] of encounter.teachers.entries()) {
        const radius = teacher.element.getBoundingClientRect().width / 2;
        teacher.offset = index ? farEdge + teacherGap + radius : 0;
        farEdge = teacher.offset + radius;
        if (!index) encounter.arrivalDistance = walkerBounds.width / 2 + radius - 3;
      }
      encounter.visibleDistance = width / 2 - farEdge - 5;
      encounter.fadeDistance = Math.max(1, Math.min(walkerBounds.height * .4,
        (encounter.visibleDistance - encounter.arrivalDistance) / 3));
    }
    points = courseTrail(width, step);
    svg.setAttribute('viewBox', `0 0 ${world} 500`);
    let path = `M ${points[0].join(' ')}`;
    for (let i = 1; i < points.length; i++) {
      const [x1, y1] = points[i - 1];
      const [x2, y2] = points[i];
      const handle = (x2 - x1) / 3;
      path += ` C ${x1 + handle} ${y1} ${x2 - handle} ${y2} ${x2} ${y2}`;
    }
    line.setAttribute('d', path);
    scroller.scrollLeft = position * step;
    lastLeft = scroller.scrollLeft;
    schedule();
  }

  function moveCourse(change) {
    const target = Math.max(0, Math.min(lastCourse, index + change));
    const behavior = document.documentElement.classList.contains('motion-playing') ? 'smooth' : 'instant';
    scroller.scrollTo({ left: target * step, behavior });
  }

  previous.addEventListener('click', () => moveCourse(-1));
  next.addEventListener('click', () => moveCourse(1));
  scroller.addEventListener('scroll', schedule, { passive: true });
  scroller.addEventListener('wheel', event => {
    if (event.ctrlKey || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
    const scale = event.deltaMode === 1 ? 18 : event.deltaMode === 2 ? step : 1;
    const delta = event.deltaY * scale;
    const max = scroller.scrollWidth - scroller.clientWidth;
    if ((delta < 0 && scroller.scrollLeft <= 1) || (delta > 0 && scroller.scrollLeft >= max - 1)) return;
    event.preventDefault();
    scroller.scrollLeft += delta;
  }, { passive: false });

  scroller.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.pointerType !== 'mouse' || event.button !== 0) return;
    drag = { id: event.pointerId, start: event.clientX, left: scroller.scrollLeft };
    scroller.setPointerCapture(event.pointerId);
  });
  scroller.addEventListener('pointermove', event => {
    if (drag?.id !== event.pointerId) return;
    scroller.scrollLeft = drag.left + drag.start - event.clientX;
  });
  scroller.addEventListener('lostpointercapture', () => { drag = undefined; });

  document.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.defaultPrevented || event.target.closest?.('dialog')) return;
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    scroller.scrollLeft += (event.key === 'ArrowLeft' ? -1 : 1) * Math.max(22, step * .075);
  });
  new ResizeObserver(layout).observe(scroller);
  new ResizeObserver(schedule).observe(sky);
  layout();
}
