function createWeekJourney(roadmap, animationsPaused) {
  const week = roadmap.querySelector('.road-week-group');
  const track = week.querySelector('.week-track');
  const stage = week.querySelector('.week-stage');
  const scenes = [...week.querySelectorAll('.week-lesson')];
  const checkpoints = [...week.querySelectorAll('.week-checkpoint')];
  const trail = week.querySelector('.week-path path');
  const motion = window.matchMedia('(min-width: 681px) and (min-height: 500px), (min-width: 320px) and (min-height: 535px)');
  const endTime = scenes.length - 0.06;
  let chapter = -1;
  let lastTime;
  let lastArrival;
  let lastExit;
  let stopDistances;

  function markChapter(next) {
    if (next === chapter) return;
    chapter = next;
    scenes.forEach((scene, index) => { scene.inert = next >= 0 && index !== next; });
    checkpoints.forEach((button, index) => {
      if (index === next) button.setAttribute('aria-current', 'step');
      else button.removeAttribute('aria-current');
    });
  }

  function distanceAtX(x, length) {
    let low = 0;
    let high = length;
    for (let i = 0; i < 16; i += 1) {
      const mid = (high + low) / 2;
      if (trail.getPointAtLength(mid).x < x) low = mid;
      else high = mid;
    }
    return (high + low) / 2;
  }

  function scrollStep() {
    return (track.clientHeight - stage.offsetHeight) / endTime;
  }

  checkpoints.forEach((button, index) => button.addEventListener('click', () => {
    const top = parseFloat(getComputedStyle(stage).top);
    window.scrollTo({
      top: window.scrollY + track.getBoundingClientRect().top - top + index * scrollStep(),
      behavior: 'smooth',
    });
  }));

  week.style.setProperty('--week-count', scenes.length);
  week.classList.add('week-ready');
  if (location.hash === '#ilk-hefte') {
    requestAnimationFrame(() => {
      if (location.hash === '#ilk-hefte') week.scrollIntoView({ block: 'start', behavior: 'instant' });
    });
  }

  return function paintWeek() {
    if (animationsPaused() || !motion.matches) {
      markChapter(-1);
      lastTime = undefined;
      return;
    }
    const bounds = track.getBoundingClientRect();
    if (bounds.top >= innerHeight || bounds.bottom <= 0) return;
    const top = parseFloat(getComputedStyle(stage).top);
    const step = scrollStep();
    if (step <= 0) return;

    const time = clampUnit((top - bounds.top) / (step * endTime)) * endTime;
    const arrival = smoothUnit((innerHeight * 0.88 - bounds.top) / (innerHeight * 0.44));
    const stageHeight = stage.offsetHeight;
    const exit = smoothUnit((top + stageHeight - bounds.bottom) / (stageHeight * 0.46));
    if (time === lastTime && arrival === lastArrival && exit === lastExit) return;
    lastTime = time;
    lastArrival = arrival;
    lastExit = exit;

    markChapter(Math.min(scenes.length - 1, Math.floor(time + 0.18)));
    scenes.forEach((scene, index) => {
      const offset = time - index;
      const enter = index === 0 ? arrival : smoothUnit((offset + 0.18) / 0.18);
      const leave = index === scenes.length - 1 ? exit : smoothUnit((offset - 0.62) / 0.20);
      scene.style.setProperty('--week-opacity', enter * (1 - leave));
      scene.style.setProperty('--week-drift', `${(1 - enter) * 24 - leave * 19}px`);
    });

    if (!stopDistances) {
      const length = trail.getTotalLength();
      stopDistances = [120, 500, 880, 980].map(x => distanceAtX(x, length));
    }
    const leg = Math.floor(time);
    const ride = smoothUnit((time - leg - 0.37) / (leg === scenes.length - 1 ? 0.54 : 0.63));
    const start = stopDistances[leg];
    const point = trail.getPointAtLength(start + (stopDistances[leg + 1] - start) * ride);
    stage.style.setProperty('--week-dot-x', `${point.x / 10}%`);
    stage.style.setProperty('--week-dot-y', `${point.y}px`);
  };
}
