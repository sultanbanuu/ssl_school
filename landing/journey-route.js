function createJourneyRoute(roadmap, animationsPaused) {
  const surface = roadmap.querySelector('.road-surface');
  const svg = surface.querySelector('.road-ink');
  const path = svg.querySelector('.road-ink-base');
  const drawn = svg.querySelector('.road-ink-drawn');
  const mask = svg.querySelector('.road-draw-mask');
  const traveller = svg.querySelector('.road-traveller');
  const starts = [...surface.querySelectorAll('.road-stop .road-pin')];
  const weekPin = surface.querySelector('.road-week .road-pin');
  const weekTrack = surface.querySelector('.week-track');
  const weekCopy = weekTrack.querySelector('.week-copy');
  const weekPhoto = weekTrack.querySelector('.week-photo');
  const weekExit = surface.querySelector('.week-route-exit');
  const benefits = [...surface.querySelectorAll('.road-benefit .road-pin')];
  const pins = [...starts, weekPin, ...benefits];
  let width = 0;
  let height = 0;
  let first;
  let last;
  let stops;
  let length;
  let paintedFront;

  function rebuild(bounds) {
    width = bounds.width;
    height = bounds.height;
    svg.setAttribute('viewBox', [0, 0, width, height].join(' '));
    const point = element => {
      const rect = element.getBoundingClientRect();
      return [rect.left + rect.width / 2 - bounds.left, rect.top + rect.height / 2 - bounds.top];
    };
    stops = pins.map(pin => ({ pin, at: point(pin) }));
    const intro = stops.slice(0, starts.length + 1).map(stop => stop.at);
    const advantages = stops.slice(intro.length).map(stop => stop.at);
    const compact = getComputedStyle(surface).getPropertyValue('--road-compact').trim() === '1';
    const center = compact ? 25 : width / 2;
    first = [center, intro[0][1] - (compact ? 35 : 74)];
    last = [center, Math.min(height - 8, advantages.at(-1)[1] + (compact ? 39 : 78))];

    // Keep each crest inside the space between text and photography, or in the mobile margin.
    const exit = point(weekExit);
    const stageTop = weekTrack.getBoundingClientRect().top - bounds.top;
    const railStart = [exit[0], Math.max(intro.at(-1)[1] + 30, stageTop - 8)];
    const leftEdge = compact ? 4 : weekCopy.getBoundingClientRect().right - bounds.left;
    const rightEdge = weekPhoto.getBoundingClientRect().left - bounds.left;
    const clearance = Math.min(exit[0] - leftEdge, rightEdge - exit[0]);
    const sway = Math.max(0, Math.min(compact ? 10 : 40, clearance - (compact ? 3 : 8)));
    const railLength = exit[1] - railStart[1];
    const bends = Math.max(2, Math.round(railLength / (compact ? 175 : 205)));
    const bendSpacing = railLength / (bends - 0.5);
    // End the weekly wave on its right crest so it sweeps directly into the first benefit on the left.
    const wave = Array.from({ length: bends }, (_, index) => {
      const bendsFromExit = bends - 1 - index;
      const offset = bendsFromExit % 2 === 0 ? sway : -sway;
      return [exit[0] + offset, exit[1] - bendSpacing * bendsFromExit];
    });
    const route = [first, ...intro, railStart, ...wave, ...advantages, last];
    const commands = ['M', ...first];
    for (let i = 1; i < route.length; i += 1) {
      const [x1, y1] = route[i - 1];
      const [x2, y2] = route[i];
      const handle = (y2 - y1) * 0.46;
      commands.push('C', x1, y1 + handle, x2, y2 - handle, x2, y2);
    }
    const geometry = commands.join(' ');
    for (const layer of [path, drawn, mask]) layer.setAttribute('d', geometry);
    length = path.getTotalLength();
    paintedFront = undefined;
  }

  function distanceAtY(y) {
    let low = 0;
    let high = length;
    for (let i = 0; i < 16; i += 1) {
      const mid = (low + high) / 2;
      if (path.getPointAtLength(mid).y < y) low = mid;
      else high = mid;
    }
    return (low + high) / 2;
  }

  return function paintRoute() {
    const bounds = surface.getBoundingClientRect();
    if (!bounds.width || !bounds.height || bounds.top > innerHeight || bounds.bottom < 0) return;
    if (Math.abs(bounds.width - width) > 0.2 || Math.abs(bounds.height - height) > 0.2) rebuild(bounds);
    const front = animationsPaused() ? last[1] : Math.min(last[1], Math.max(first[1], innerHeight * 0.55 - bounds.top));
    if (front === paintedFront) return;
    paintedFront = front;

    const travelling = front > first[1] && front < last[1];
    const distance = travelling ? distanceAtY(front) : front === last[1] ? length : 0;
    mask.setAttribute('stroke-dasharray', [distance, length + 1].join(' '));
    traveller.setAttribute('visibility', travelling ? 'visible' : 'hidden');
    if (travelling) {
      const tip = path.getPointAtLength(distance);
      traveller.setAttribute('transform', 'translate(' + tip.x + ' ' + tip.y + ')');
    }

    for (const { pin, at } of stops) {
      const passed = at[1] <= front + 0.5;
      pin.classList.toggle('is-passed', passed);
      pin.parentElement.classList.toggle('is-revealed', passed);
    }
  };
}
