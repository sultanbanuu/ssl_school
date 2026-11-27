const courseGalaxies = [
  { stop: .34, x: .75, y: .48, tilt: -.38, stretch: .53, colors: ['#fff2e1', '#bd85f5', '#6542a7'] },
  { stop: 1.65, x: .78, y: .51, tilt: .50, stretch: .45, colors: ['#e6edff', '#7faaff', '#5242b1'] },
  { stop: 2.75, x: .73, y: .58, tilt: -.64, stretch: .67, colors: ['#fff0d6', '#e898bb', '#9355c8'] },
  { stop: 3.74, x: .78, y: .49, tilt: .25, stretch: .48, colors: ['#fff3d0', '#c49cfa', '#6260cb'] },
];

function courseSkyRandom(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function paintCourseGalaxy(galaxy, seed) {
  const sprite = document.createElement('canvas');
  sprite.width = sprite.height = 384;
  const ink = sprite.getContext('2d');
  const center = sprite.width / 2;
  const random = courseSkyRandom(seed);
  const [white, middle, outer] = galaxy.colors;
  ink.translate(center, center);
  ink.scale(1, galaxy.stretch);

  const cloud = ink.createRadialGradient(0, 0, 0, 0, 0, 181);
  cloud.addColorStop(0, white + 'a0');
  cloud.addColorStop(.06, middle + '70');
  cloud.addColorStop(.27, outer + '3e');
  cloud.addColorStop(1, outer + '00');
  ink.fillStyle = cloud;
  ink.fillRect(-192, -192, 384, 384);

  ink.save();
  ink.lineCap = 'round';
  ink.lineWidth = 15;
  ink.strokeStyle = middle + '64';
  ink.filter = 'blur(8px)';
  for (const offset of [0, Math.PI]) {
    ink.beginPath();
    ink.moveTo(0, 0);
    for (let radius = .03; radius < .91; radius += .025) {
      const angle = offset + radius * 6.2;
      ink.lineTo(Math.cos(angle) * radius * 167, Math.sin(angle) * radius * 167);
    }
    ink.stroke();
  }
  ink.restore();

  for (let i = 0; i < 3100; i++) {
    const radius = random() ** .75;
    const spread = (random() + random() + random() - 1.5) * (1.5 - .74 * radius);
    const arm = i % 2 * Math.PI + radius * 6.2 + spread;
    const distance = radius * 167;
    const x = Math.cos(arm) * distance;
    const y = Math.sin(arm) * distance;
    const brightness = random();
    const size = .24 + brightness ** 5 * 1.2;
    ink.globalAlpha = (.25 + brightness * .63) * (1 - radius * .8);
    ink.fillStyle = brightness > .76 ? white : brightness > .33 ? middle : outer;
    ink.beginPath();
    ink.arc(x, y, size, 0, Math.PI * 2);
    ink.fill();
  }
  return sprite;
}

function createCourseSky(canvas) {
  const ink = canvas.getContext('2d');
  if (!ink) return () => {};
  const random = courseSkyRandom(312043);
  const stars = Array.from({ length: 220 }, () => ({
    x: random(),
    y: random(),
    reveal: Math.max(0, random() * 4.5 - .8),
    depth: .04 + random() * .07,
    brightness: .45 + random() * .55,
    size: .45 + random() ** 4 * 1.35,
  }));
  const sprites = [];
  let lastWidth = 0;
  let lastHeight = 0;
  let lastPosition = -1;

  return function drawCourseSky(position) {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;
    if (width !== lastWidth || height !== lastHeight) {
      const scale = Math.min(window.devicePixelRatio || 1, 1.5, 1700 / width);
      canvas.width = Math.ceil(width * scale);
      canvas.height = Math.ceil(height * scale);
      ink.setTransform(scale, 0, 0, scale, 0, 0);
      lastWidth = width;
      lastHeight = height;
      lastPosition = -1;
    }
    if (position === lastPosition) return;
    lastPosition = position;
    ink.clearRect(0, 0, width, height);

    const compact = width < 650;
    const span = compact ? Math.min(width * 1.36, height * .84) : Math.min(width * .58, height * .99);
    for (const [index, galaxy] of courseGalaxies.entries()) {
      const offset = position - galaxy.stop;
      const appear = smoothUnit((offset + .66) / .37);
      const fade = 1 - smoothUnit((offset - .46) / .69);
      if (appear * fade <= .005) continue;
      sprites[index] ??= paintCourseGalaxy(galaxy, 59213 + index * 1317);
      const x = (galaxy.x - offset * (compact ? .07 : .10)) * width;
      const y = (compact ? galaxy.y * .67 + .25 : galaxy.y) * height;
      ink.save();
      ink.globalAlpha = appear * fade * (compact ? .57 : .78);
      ink.translate(x, y);
      ink.rotate(galaxy.tilt);
      ink.drawImage(sprites[index], -span / 2, -span / 2, span, span);
      ink.restore();
    }

    for (const star of stars) {
      const reveal = smoothUnit((position - star.reveal + .42) / .6);
      const x = ((star.x - position * star.depth + 1) % 1) * width;
      const y = star.y * height;
      const rightGlow = .19 + .81 * smoothUnit((x / width - .3) / .56);
      ink.globalAlpha = star.brightness * (.17 + reveal * .66) * rightGlow;
      ink.fillStyle = star.depth > .076 ? '#e1caf8' : '#eff1ff';
      ink.beginPath();
      ink.arc(x, y, star.size * (compact ? .82 : 1), 0, Math.PI * 2);
      ink.fill();
      if (star.size < 1.5 || reveal < .72) continue;
      ink.globalAlpha *= .32;
      ink.fillRect(x - 3.8, y - .30, 7.6, .6);
      ink.fillRect(x - .30, y - 3.8, .6, 7.6);
    }
    ink.globalAlpha = 1;
  };
}
