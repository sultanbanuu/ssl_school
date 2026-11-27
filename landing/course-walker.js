function courseWalker() {
  return `<svg class="course-walker" viewBox="138 -14 760 1486" aria-hidden="true" focusable="false">
    <defs>
      <image id="course-pinky" href="./assets/student-felt-walking.png" width="1068" height="1472"/>
      <clipPath id="course-pinky-upper">
        <path d="M0 0H1068V1120H690L681 1141Q641 1178 561 1180H462Q383 1178 335 1151L310 1120H0Z"/>
      </clipPath>
      <clipPath id="course-pinky-rear-leg">
        <path d="M353 1110H478L487 1170L476 1260L514 1431H286L297 1310L339 1171Z"/>
      </clipPath>
      <clipPath id="course-pinky-front-leg">
        <path d="M550 1110H661L686 1170L695 1278L754 1320V1431H525L532 1232Z"/>
      </clipPath>
    </defs>
    <ellipse cx="518" cy="1412" rx="184" ry="11" fill="#08060d" opacity=".68"/>
    <g class="walker-body">
      <use class="walker-leg walker-leg-rear" href="#course-pinky" clip-path="url(#course-pinky-rear-leg)"/>
      <use class="walker-leg" href="#course-pinky" clip-path="url(#course-pinky-front-leg)"/>
      <use class="walker-upper" href="#course-pinky" clip-path="url(#course-pinky-upper)"/>
    </g>
  </svg>`;
}

function createCourseGait(walker) {
  const hips = [414, 609];
  const soles = [405, 641];
  const legs = [...walker.querySelectorAll('.walker-leg')];
  const body = walker.querySelector('.walker-body');
  const upper = walker.querySelector('.walker-upper');
  const centerX = 518;
  const hipY = 1163;
  const soleY = 1410;
  const degrees = 180 / Math.PI;
  const stanceEnd = .62;
  const sampleTimeout = 65;
  const motionPlaying = () => document.documentElement.classList.contains('motion-playing');
  let cycle = .5;
  let speed = 0;
  let sampledSpeed = 0;
  let frame = 0;
  let previousFrame = 0;
  let lastTravel = -Infinity;
  let direction = 1;
  let heading = 1;
  let slope = 0;
  let lookDirection = 0;

  function paint() {
    const turn = 1 - Math.abs(heading);
    const facing = Math.sign(heading || direction) * (1 - .14 * turn);
    const amount = (1 - Math.exp(-speed / .4)) * (1 - .72 * turn);
    const incline = slope * facing;
    const lean = (2.2 - incline * 4 + Math.sin(cycle * 2 * Math.PI)) * amount;
    const tilt = lean / degrees;
    const bounce = -13 * Math.sin(cycle * 2 * Math.PI) ** 2 * amount;
    body.setAttribute('transform', `translate(${centerX} 0) scale(${facing.toFixed(3)} 1) translate(${-centerX} 0)`);
    upper.setAttribute('transform', `translate(0 ${bounce.toFixed(2)}) rotate(${lean.toFixed(2)} ${centerX} ${hipY})`);

    legs.forEach((leg, index) => {
      const hip = hips[index];
      const sole = soles[index];
      const phase = (cycle + index * .5) % 1;
      const swing = clampUnit((phase - stanceEnd) / (1 - stanceEnd));
      // Keep the stance and swing continuous so the foot can lift and land without a jump.
      const stride = (86 + 21 * clampUnit(speed)) * (1 + 2 * (smoothUnit(swing) - phase) / stanceEnd);
      const lift = 98 * Math.sin(Math.PI * swing) ** 2;
      const targetX = sole + stride * amount;
      const targetY = soleY + (targetX - centerX) * incline - lift * amount;
      const jointX = centerX + (hip - centerX) * Math.cos(tilt);
      const jointY = hipY + bounce + (hip - centerX) * Math.sin(tilt);

      const originalX = sole - hip;
      const dx = targetX - jointX;
      const dy = targetY - jointY;
      const legHeight = Math.sqrt(dx ** 2 + dy ** 2 - originalX ** 2);
      const rotation = (Math.atan2(dy, dx) - Math.atan2(legHeight, originalX)) * degrees;
      leg.setAttribute('transform', `translate(${jointX.toFixed(2)} ${jointY.toFixed(2)}) rotate(${rotation.toFixed(2)}) scale(1 ${(legHeight / (soleY - hipY)).toFixed(4)}) translate(${-hip} ${-hipY})`);
    });
  }

  function settle(facing) {
    speed = 0;
    heading = facing;
    cycle = (Math.round(cycle * 2) % 2) / 2;
    frame = 0;
    previousFrame = 0;
    lastTravel = -Infinity;
    paint();
  }

  function animate(now) {
    const elapsed = previousFrame ? Math.min(36, now - previousFrame) : 16;
    const targetSpeed = now - lastTravel < sampleTimeout ? sampledSpeed : 0;
    const targetHeading = (targetSpeed ? 0 : lookDirection) || direction;
    if (!motionPlaying()) {
      settle(lookDirection || direction);
      return;
    }
    speed += (targetSpeed - speed) * (1 - Math.exp(-elapsed / 52));
    heading += (targetHeading - heading) * (1 - Math.exp(-elapsed / 48));
    if (!targetSpeed && speed < .006 && Math.abs(targetHeading - heading) < .01) {
      settle(targetHeading);
      return;
    }
    const cadence = .75 + .75 * smoothUnit(clampUnit(speed / 1.25));
    cycle = (cycle + elapsed / 1000 * cadence * clampUnit(speed / .18)) % 1;
    paint();
    previousFrame = now;
    frame = requestAnimationFrame(animate);
  }

  paint();
  return function updateGait(delta, groundSlope, meetingDirection) {
    slope = groundSlope;
    lookDirection = meetingDirection;
    const traveling = Math.abs(delta) >= .2;
    if (traveling) direction = Math.sign(delta);
    if (!motionPlaying()) {
      if (frame) cancelAnimationFrame(frame);
      settle(lookDirection || direction);
      return;
    }
    if (traveling) {
      const now = performance.now();
      const gap = now - lastTravel;
      const interval = gap < sampleTimeout ? Math.max(8, gap) : 16.7;
      sampledSpeed = Math.min(2, Math.abs(delta) / interval);
      lastTravel = now;
    }
    if (frame) return;
    if (traveling || heading !== (lookDirection || direction)) frame = requestAnimationFrame(animate);
    else paint();
  };
}
