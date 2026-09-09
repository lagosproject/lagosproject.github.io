(function () {
  const canvas = document.createElement('canvas');
  canvas.id = 'background-canvas';
  document.body.prepend(canvas);

  const ctx = canvas.getContext('2d');

  let width = canvas.width = window.innerWidth;
  let height = canvas.height = window.innerHeight;

  // Responsive grid configuration: lighter on mobile devices
  const isMobile = width < 768;
  const columns = isMobile ? 32 : 55;
  const rows = isMobile ? 22 : 36;
  const grid = [];

  // Pre-allocated grid data structures
  for (let c = 0; c < columns; c++) {
    grid[c] = [];
    for (let r = 0; r < rows; r++) {
      grid[c][r] = {
        col: c,
        row: r,
        dispY: 0,
        vy: 0,
        px: 0,
        py: 0,
        scale: 0,
        depth: 0,
        worldY: 0,
        visible: false
      };
    }
  }

  // Mouse tracking state
  const mouse = {
    x: -1000,
    y: -1000,
    tx: -1000,
    ty: -1000,
    speed: 0,
    active: false
  };

  let prevMouseX = 0;
  let prevMouseY = 0;

  window.addEventListener('mousemove', (e) => {
    mouse.tx = e.clientX;
    mouse.ty = e.clientY;
    
    // Calculate speed of mouse movement
    const dx = mouse.tx - prevMouseX;
    const dy = mouse.ty - prevMouseY;
    mouse.speed = Math.sqrt(dx * dx + dy * dy);
    
    prevMouseX = mouse.tx;
    prevMouseY = mouse.ty;
    mouse.active = true;
  }, { passive: true });

  window.addEventListener('mouseleave', () => {
    mouse.active = false;
    mouse.tx = -1000;
    mouse.ty = -1000;
    mouse.speed = 0;
  });

  // Track window resize
  window.addEventListener('resize', () => {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  }, { passive: true });

  // Constants
  const pitch = 0.65;
  const cosPitch = Math.cos(pitch);
  const sinPitch = Math.sin(pitch);
  const cameraDistance = 380;
  const focalLength = 520;

  // Preallocated buckets to avoid GC overhead
  const levelBuckets = [[], [], [], [], []];

  // Point object pool for buckets to reuse memory completely
  const pointPool = [];
  let poolIdx = 0;
  function getPooledPoint(x, y, size, depth) {
    let p = pointPool[poolIdx];
    if (!p) {
      p = { x: 0, y: 0, size: 0, depth: 0 };
      pointPool[poolIdx] = p;
    }
    p.x = x;
    p.y = y;
    p.size = size;
    p.depth = depth;
    poolIdx++;
    return p;
  }

  const colors = [
    'rgba(99, 102, 241, 0.15)',  // Deep parts: Indigo/purple
    'rgba(0, 163, 255, 0.35)',   // Mid parts: Deep blue
    'rgba(0, 210, 255, 0.55)',   // Mid-high: Cyan
    'rgba(14, 165, 233, 0.75)',  // Peaks: Bright Cyan-Blue
    'rgba(255, 255, 255, 0.95)'  // Mouse perturbed / extreme peaks: Bright white
  ];

  let time = 0;
  let isRunning = false;
  let animId = null;

  function animate() {
    time += 0.012; // Steady wave speed

    ctx.clearRect(0, 0, width, height);

    // Smooth mouse interpolation
    if (mouse.active) {
      if (mouse.x === -1000) {
        mouse.x = mouse.tx;
        mouse.y = mouse.ty;
      } else {
        mouse.x += (mouse.tx - mouse.x) * 0.12;
        mouse.y += (mouse.ty - mouse.y) * 0.12;
      }
    } else {
      mouse.x = -1000;
      mouse.y = -1000;
    }

    mouse.speed *= 0.9;

    const spacingX = (width / (columns - 1)) * 1.5;
    const spacingZ = 16;
    const centerY = height * 0.68;
    const centerX = width * 0.5;

    // First pass: Calculate 3D wave projection & mouse interaction
    for (let c = 0; c < columns; c++) {
      for (let r = 0; r < rows; r++) {
        const p = grid[c][r];
        const baseX = (c - (columns - 1) * 0.5) * spacingX;
        const baseZ = (r - (rows - 1) * 0.5) * spacingZ;

        const wave1 = Math.sin(c * 0.12 + time * 1.2) * 16;
        const wave2 = Math.cos(r * 0.15 + time * 0.9) * 10;
        const wave3 = Math.sin((c + r) * 0.08 + time * 0.6) * 6;

        const baseY = wave1 + wave2 + wave3;
        const y = baseY + p.dispY;

        const rotY = y * cosPitch - baseZ * sinPitch;
        const rotZ = y * sinPitch + baseZ * cosPitch;
        const depth = rotZ + cameraDistance;

        if (depth <= 0) {
          p.visible = false;
          continue;
        }

        const scale = focalLength / depth;
        p.px = centerX + baseX * scale;
        p.py = centerY + rotY * scale;
        p.scale = scale;
        p.depth = depth;
        p.worldY = y;
        p.visible = true;

        if (mouse.active) {
          const dx = p.px - mouse.x;
          const dy = p.py - mouse.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const interactionRadius = 150;
          if (dist < interactionRadius) {
            const force = (interactionRadius - dist) / interactionRadius;
            const speedFactor = Math.min(3.0, mouse.speed * 0.03);
            const targetDisp = -26 * force * (1 + speedFactor);
            p.vy += (targetDisp - p.dispY) * 0.12;
          }
        }

        // Physics propagation
        let neighborSum = 0;
        let neighborsCount = 0;
        if (c > 0) { neighborSum += grid[c - 1][r].dispY; neighborsCount++; }
        if (c < columns - 1) { neighborSum += grid[c + 1][r].dispY; neighborsCount++; }
        if (r > 0) { neighborSum += grid[c][r - 1].dispY; neighborsCount++; }
        if (r < rows - 1) { neighborSum += grid[c][r + 1].dispY; neighborsCount++; }

        const avgNeighborDisp = neighborSum / neighborsCount;
        p.vy += (avgNeighborDisp - p.dispY) * 0.08;
        p.vy += -p.dispY * 0.03;
        p.vy *= 0.93;
        p.dispY += p.vy;
      }
    }

    // Second pass: Draw grid lines using cached projections
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(0, 163, 255, 0.04)';
    ctx.lineWidth = 0.8;

    for (let c = 0; c < columns; c++) {
      for (let r = 0; r < rows; r++) {
        const p = grid[c][r];
        if (!p.visible) continue;

        if (c < columns - 1) {
          const rightP = grid[c + 1][r];
          if (rightP.visible) {
            ctx.moveTo(p.px, p.py);
            ctx.lineTo(rightP.px, rightP.py);
          }
        }

        if (r < rows - 1) {
          const bottomP = grid[c][r + 1];
          if (bottomP.visible) {
            ctx.moveTo(p.px, p.py);
            ctx.lineTo(bottomP.px, bottomP.py);
          }
        }
      }
    }
    ctx.stroke();

    // Third pass: Mouse glow
    if (mouse.active) {
      const grad = ctx.createRadialGradient(mouse.x, mouse.y, 0, mouse.x, mouse.y, 150);
      grad.addColorStop(0, 'rgba(0, 163, 255, 0.08)');
      grad.addColorStop(1, 'rgba(0, 163, 255, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(mouse.x, mouse.y, 150, 0, Math.PI * 2);
      ctx.fill();
    }

    // Fourth pass: Render points using bucket pooling
    for (let i = 0; i < 5; i++) {
      levelBuckets[i].length = 0;
    }
    poolIdx = 0;

    for (let c = 0; c < columns; c++) {
      for (let r = 0; r < rows; r++) {
        const p = grid[c][r];
        if (!p.visible) continue;

        const size = Math.max(0.6, p.scale * 1.5);
        let levelIdx = 1;
        const dispVal = Math.abs(p.dispY);

        if (dispVal > 6) {
          levelIdx = 4;
        } else {
          const normalizedHeight = (p.worldY + 25) / 50;
          levelIdx = Math.max(0, Math.min(3, Math.floor(normalizedHeight * 4)));
        }

        levelBuckets[levelIdx].push(getPooledPoint(p.px, p.py, size, p.depth));
      }
    }

    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = colors[i];
      const pts = levelBuckets[i];
      const len = pts.length;
      for (let j = 0; j < len; j++) {
        const pt = pts[j];
        const depthRatio = (pt.depth - cameraDistance + 150) / 350;
        const depthFade = Math.max(0.08, 1 - depthRatio);
        const s = pt.size * depthFade;
        ctx.fillRect(pt.x - s * 0.5, pt.y - s * 0.5, s, s);
      }
    }

    if (isRunning) {
      animId = requestAnimationFrame(animate);
    }
  }

  function start() {
    if (!isRunning) {
      isRunning = true;
      animId = requestAnimationFrame(animate);
    }
  }

  function stop() {
    if (isRunning) {
      isRunning = false;
      if (animId) cancelAnimationFrame(animId);
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stop();
    } else {
      start();
    }
  });

  if (document.readyState === 'complete') {
    start();
  } else {
    window.addEventListener('load', () => {
      if ('requestIdleCallback' in window) {
        requestIdleCallback(() => start());
      } else {
        setTimeout(start, 50);
      }
    }, { once: true });
  }
})();
