function createFaqMesh(canvas) {
  const ink = canvas.getContext('2d');
  if (!ink) return null;

  const columns = 14;
  const rows = 11;
  const vertices = [];
  const triangles = [];
  let seed = 21437;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  for (let row = 0; row <= rows; row += 1) {
    for (let column = 0; column <= columns; column += 1) {
      const x = (column + (column > 0 && column < columns ? (random() - .5) * .72 : 0)) / columns - .5;
      const y = (row + (row > 0 && row < rows ? (random() - .5) * .72 : 0)) / rows - .5;
      const ridge = Math.sin(14 * x + 11 * y);
      vertices.push({
        x, y,
        foldedX: x * .51 + Math.sin(y * 12 + x * 5) * .112 + Math.cos(x * 23 - y * 8) * .043,
        foldedY: y * .55 + Math.sin(x * 13 - y * 6) * .126 + Math.cos(y * 20 + x * 9) * .052,
        height: ridge * .11 + Math.cos(21 * x - 15 * y) * .072 + (random() - .42) * .11,
        release: .15 * (x + .5) + .10 * (y + .5),
      });
    }
  }

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const a = row * (columns + 1) + column;
      const b = a + 1;
      const c = a + columns + 1;
      const d = c + 1;
      if (random() < .5) triangles.push([a, b, c], [b, d, c]);
      else triangles.push([a, b, d], [a, d, c]);
    }
  }

  let lastWidth = 0;
  let lastHeight = 0;
  return function drawFaqMesh(width, height, progress) {
    if (!width || !height) return;
    if (width !== lastWidth || height !== lastHeight) {
      lastWidth = width;
      lastHeight = height;
      const scale = Math.min(window.devicePixelRatio || 1, 1.35);
      canvas.width = Math.ceil(width * scale);
      canvas.height = Math.ceil(height * scale);
      ink.setTransform(scale, 0, 0, scale, 0, 0);
      ink.lineJoin = 'round';
    }

    const scaleZ = Math.min(width, height) * .91;
    const world = vertices.map(vertex => {
      const released = smoothUnit((progress - vertex.release) / (1 - vertex.release));
      const tension = 1 - released;
      return [
        (vertex.x * released + vertex.foldedX * tension) * width,
        (vertex.y * released + vertex.foldedY * tension) * height,
        vertex.height * tension * scaleZ,
      ];
    });
    const screen = world.map(([x, y, z]) => {
      const perspective = 780 / (780 - z);
      return [width / 2 + x * perspective, height / 2 + y * perspective];
    });

    ink.clearRect(0, 0, width, height);
    const depth = triangle => (world[triangle[0]][2] + world[triangle[1]][2] + world[triangle[2]][2]) / 3;
    triangles.sort((a, b) => depth(a) - depth(b));
    for (const triangle of triangles) {
      const [a, b, c] = triangle.map(index => world[index]);
      const [ux, uy, uz] = b.map((value, axis) => value - a[axis]);
      const [vx, vy, vz] = c.map((value, axis) => value - a[axis]);
      const nx = uy * vz - uz * vy;
      const ny = uz * vx - ux * vz;
      const nz = ux * vy - uy * vx;
      const lighting = (.26 * nx - .46 * ny + .78 * nz) / (Math.hypot(nx, ny, nz) || 1);
      const lightness = Math.min(99, 64 + Math.abs(lighting) * 34 + (nz < 0 ? -7 : 2));
      ink.fillStyle = `hsl(225 8% ${lightness}%)`;
      ink.strokeStyle = ink.fillStyle;
      ink.lineWidth = .65;
      ink.beginPath();
      ink.moveTo(...screen[triangle[0]]);
      ink.lineTo(...screen[triangle[1]]);
      ink.lineTo(...screen[triangle[2]]);
      ink.closePath();
      ink.fill();
      ink.stroke();
    }
  };
}

function getPaperScrollRange(flight, scene, bounds, viewport, isFaq) {
  const stickyTop = parseFloat(getComputedStyle(scene).top);
  if (Number.isFinite(stickyTop)) {
    const pinnedDistance = flight.offsetHeight - scene.offsetHeight;
    const runway = isFaq ? pinnedDistance : pinnedDistance * .68;
    return { distance: stickyTop - flight.getBoundingClientRect().top, runway };
  }

  const start = isFaq ? viewport * .77 : viewport - Math.min(300, viewport * .58);
  const end = viewport * (isFaq ? .28 : .19);
  return { distance: start - bounds.top, runway: start - end };
}

function setupScrollPapers() {
  const root = document.documentElement;
  const papers = [...document.querySelectorAll('.paper-flight')].flatMap(flight => {
    const scene = flight.querySelector('.paper-scene');
    const area = scene.querySelector('[data-paper-area]');
    const sheet = area.querySelector('.paper-sheet');
    const opener = area.querySelector('.paper-open');
    const canvas = area.querySelector('.faq-fold-art');
    const draw = canvas ? createFaqMesh(canvas) : null;
    if (canvas && !draw) return [];
    flight.classList.add('is-paper-ready');
    return [{ flight, scene, area, sheet, opener, draw, progress: -1, width: 0, height: 0, focusSheet: false }];
  });

  function viewportHeight() {
    return Math.min(innerHeight, window.visualViewport?.height || innerHeight);
  }

  let frame = 0;
  function render() {
    frame = 0;
    const playing = root.classList.contains('motion-playing');
    const viewport = viewportHeight();
    const keyboardOpen = viewport < innerHeight - 90;
    for (const paper of papers) {
      const { flight, scene, area, sheet, opener, draw } = paper;
      const bounds = area.getBoundingClientRect();
      const { distance, runway } = getPaperScrollRange(flight, scene, bounds, viewport, Boolean(draw));
      const active = document.activeElement;
      const editing = keyboardOpen && sheet.contains(active) && active.matches('input, textarea');
      const progress = playing && !editing && runway > 0 ? clampUnit(distance / runway) : 1;
      const folded = playing && progress < .985;
      sheet.inert = folded;
      opener.hidden = !folded;

      if (draw) {
        area.style.setProperty('--faq-ink', smoothUnit((progress - .72) / .28));
        area.style.setProperty('--faq-mesh', 1 - smoothUnit((progress - .78) / .22));
        const width = area.clientWidth;
        const height = area.clientHeight;
        const dirty = progress !== paper.progress || width !== paper.width || height !== paper.height;
        if (playing && dirty && progress < 1 && bounds.bottom > 0 && bounds.top < viewport) {
          draw(width, height, progress);
          Object.assign(paper, { progress, width, height });
        }
      } else if (progress !== paper.progress) {
        const lift = smoothUnit(progress);
        area.style.setProperty('--folder-lift', lift);
        area.style.setProperty('--folder-bend', Math.sin(progress * Math.PI));
        area.classList.toggle('is-extracted', !folded);
        paper.progress = progress;
      }

      if (!folded && paper.focusSheet) {
        paper.focusSheet = false;
        sheet.querySelector('.faq-toggle, input').focus({ preventScroll: true });
      }
    }
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(render);
  }

  function scrollToPaper(paper, behavior) {
    const { flight, scene, area, draw } = paper;
    const { distance, runway } = getPaperScrollRange(flight, scene, area.getBoundingClientRect(), viewportHeight(), Boolean(draw));
    window.scrollTo({ top: Math.max(0, window.scrollY + runway - distance + 2), behavior });
    schedule();
  }

  const resize = new ResizeObserver(schedule);
  for (const paper of papers) {
    const { area, opener } = paper;
    opener.addEventListener('click', event => {
      paper.focusSheet = event.detail === 0;
      scrollToPaper(paper, 'smooth');
    });
    area.addEventListener('focusin', schedule);
    area.addEventListener('focusout', schedule);
    resize.observe(area);
  }
  const consultation = papers.find(paper => !paper.draw);
  const openConsultation = () => requestAnimationFrame(() => {
    if (location.hash === '#elaqe' && root.classList.contains('motion-playing')) scrollToPaper(consultation, 'instant');
  });
  if (consultation) {
    if (location.hash === '#elaqe') openConsultation();
    window.addEventListener('hashchange', openConsultation);
    document.querySelectorAll('a[href="#elaqe"], a[href="./#elaqe"]').forEach(link => {
      link.addEventListener('click', () => {
        if (location.hash === '#elaqe') openConsultation();
      });
    });
  }
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  window.visualViewport?.addEventListener('resize', schedule);
  new MutationObserver(schedule).observe(root, { attributeFilter: ['class'] });
  schedule();
}
