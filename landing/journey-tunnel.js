function clampUnit(value) {
  return Math.max(0, Math.min(1, value));
}

function smoothUnit(value) {
  const t = clampUnit(value);
  return t * t * (3 - 2 * t);
}

function createQuestionTunnel(canvas) {
  const ink = canvas.getContext('2d');
  if (!ink) return () => {};

  let seed = 93271;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const stars = Array.from({ length: 156 }, () => [random(), random(), random(), random()]);
  let paintedWidth = 0;
  let paintedHeight = 0;
  let pixelRatio = 0;
  let ringInk;

  return function paintQuestionTunnel(width, height, [holeX, holeY], scroll, release) {
    if (!width || !height) return;
    const scale = Math.min(window.devicePixelRatio || 1, 1.65, 2200 / width);
    if (width !== paintedWidth || height !== paintedHeight || scale !== pixelRatio) {
      paintedWidth = width;
      paintedHeight = height;
      pixelRatio = scale;
      canvas.width = Math.ceil(width * scale);
      canvas.height = Math.ceil(height * scale);
      ink.setTransform(scale, 0, 0, scale, 0, 0);
      ringInk = ink.createLinearGradient(0, height * 0.7, width, height * 0.15);
      ringInk.addColorStop(0, '#837593');
      ringInk.addColorStop(0.25, '#ebe0ff');
      ringInk.addColorStop(0.57, '#c2b3dd');
      ringInk.addColorStop(1, '#77698e');
    }

    ink.clearRect(0, 0, width, height);
    const compact = width < 760;
    const contrast = 1 - release * 0.63;
    const phase = (scroll * 1.3) % 1;
    for (const [x, y, size, light] of stars) {
      const drift = Math.sin(scroll * 0.7 + x * Math.PI * 2) * 3 * size;
      ink.globalAlpha = (0.085 + light * 0.29) * contrast;
      ink.fillStyle = light > 0.72 ? '#f2eaff' : '#a08cbf';
      ink.fillRect(x * width + drift, y * height + drift * 0.35, 0.6 + size, 0.6 + size);
    }

    ink.globalAlpha = 1;
    const horizon = Math.max(23, Math.min(height * 0.101, width * (compact ? 0.11 : 0.08)));
    const glow = ink.createRadialGradient(holeX, holeY, horizon * 0.45, holeX, holeY, horizon * 2.9);
    glow.addColorStop(0, 'transparent');
    glow.addColorStop(0.23, `rgba(143, 104, 193, ${0.25 * contrast})`);
    glow.addColorStop(1, 'transparent');
    ink.fillStyle = glow;
    ink.fillRect(holeX - horizon * 3, holeY - horizon * 3, horizon * 6, horizon * 6);

    const farEdge = Math.hypot(width, height) * 0.89;
    ink.strokeStyle = ringInk;
    for (let ring = 0; ring < 19; ring += 1) {
      const radius = horizon * 0.63 * 1.293 ** (ring + phase);
      if (radius > farEdge) break;
      const fade = smoothUnit((radius - horizon * 0.67) / (horizon * 0.47))
        * (1 - smoothUnit((radius / farEdge - 0.62) / 0.38));
      const bend = Math.sin(Math.log(radius / horizon) * 1.45) * radius * 0.036;
      ink.globalAlpha = fade * (0.48 + 0.24 * Math.exp(-radius / (horizon * 3))) * contrast;
      ink.lineWidth = Math.min(1.46, 0.7 + radius / 530);
      ink.beginPath();
      ink.ellipse(holeX + radius * 0.53, holeY + radius * 0.055 + bend, radius * 0.81, radius, -0.13, 0, Math.PI * 2);
      ink.stroke();
    }

    ink.globalAlpha = 1 - release * 0.58;
    ink.fillStyle = '#050309';
    ink.strokeStyle = '#d8c1f5';
    ink.lineWidth = 1.15;
    ink.beginPath();
    ink.ellipse(holeX, holeY, horizon * 0.55, horizon * 0.7, -0.15, 0, Math.PI * 2);
    ink.fill();
    ink.stroke();
    ink.globalAlpha = 1;
  };
}
