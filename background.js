(function () {
  const canvas = document.createElement('canvas');
  canvas.id = 'background-canvas';
  document.body.prepend(canvas);

  const ctx = canvas.getContext('2d');

  let width = canvas.width = window.innerWidth;
  let height = canvas.height = window.innerHeight;

  // Grid configuration
  const columns = 60;
  const rows = 40;
  const grid = [];

  // Initialize grid points
  for (let c = 0; c < columns; c++) {
    grid[c] = [];
    for (let r = 0; r < rows; r++) {
      grid[c][r] = {
        col: c,
        row: r,
        dispY: 0,
        vy: 0,
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
  });

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
  });

  // Perspective Projection Function
  function getProjectedPoint(p, time) {
    // Spacing between columns and rows
    const spacingX = (width / (columns - 1)) * 1.5;
    const spacingZ = 16;
    
    // Center point in 3D
    const baseX = (p.col - (columns - 1) / 2) * spacingX;
    const baseZ = (p.row - (rows - 1) / 2) * spacingZ;
    
    // Waves: Combine slow-moving sine functions for organic fluid motion
    // Left-to-right wave
    const wave1 = Math.sin(p.col * 0.12 + time * 1.2) * 16;
    // Top-to-bottom wave
    const wave2 = Math.cos(p.row * 0.15 + time * 0.9) * 10;
    // Diagonal wave
    const wave3 = Math.sin((p.col + p.row) * 0.08 + time * 0.6) * 6;
    
    const baseY = wave1 + wave2 + wave3;
    const y = baseY + p.dispY;
    
    // Tilt angle (pitch)
    const pitch = 0.65; // Tilt camera down to look at the mesh from an angle
    const cosPitch = Math.cos(pitch);
    const sinPitch = Math.sin(pitch);
    
    const cameraDistance = 380;
    const focalLength = 520;
    
    const centerY = height * 0.68; // Lake centered lower on screen to give a solid horizon line
    const centerX = width * 0.5;
    
    // 3D rotation around X axis (pitch)
    const rotY = y * cosPitch - baseZ * sinPitch;
    const rotZ = y * sinPitch + baseZ * cosPitch;
    
    const depth = rotZ + cameraDistance;
    
    if (depth <= 0) return null;
    
    const scale = focalLength / depth;
    const screenX = centerX + baseX * scale;
    const screenY = centerY + rotY * scale;
    
    return {
      x: screenX,
      y: screenY,
      depth: depth,
      scale: scale,
      worldY: y
    };
  }

  let time = 0;

  function animate() {
    time += 0.012; // Slow and steady water wave movement

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Smoothly interpolate mouse position to prevent jittering
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

    // Decay speed smoothly
    mouse.speed *= 0.9;

    // First pass: Physics and displacement calculations
    for (let c = 0; c < columns; c++) {
      for (let r = 0; r < rows; r++) {
        const p = grid[c][r];
        
        // Check mouse proximity using projected position
        const proj = getProjectedPoint(p, time);
        if (proj && mouse.active) {
          const dx = proj.x - mouse.x;
          const dy = proj.y - mouse.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          
          const interactionRadius = 150;
          if (dist < interactionRadius) {
            const force = (interactionRadius - dist) / interactionRadius;
            
            // Push downward in world Y. Scale by mouse speed.
            const targetDisp = -40 * force * (1 + mouse.speed * 0.08);
            p.vy += (targetDisp - p.dispY) * 0.15;
          }
        }
        
        // Physics update: wave propagation to neighbors (creates organic ripples)
        let neighborSum = 0;
        let neighborsCount = 0;
        if (c > 0) { neighborSum += grid[c-1][r].dispY; neighborsCount++; }
        if (c < columns - 1) { neighborSum += grid[c+1][r].dispY; neighborsCount++; }
        if (r > 0) { neighborSum += grid[c][r-1].dispY; neighborsCount++; }
        if (r < rows - 1) { neighborSum += grid[c][r+1].dispY; neighborsCount++; }
        
        const avgNeighborDisp = neighborSum / neighborsCount;
        const propagationForce = (avgNeighborDisp - p.dispY) * 0.08;
        p.vy += propagationForce;
        
        // Hooke's Law: Spring return to 0 displacement (calm surface)
        const springK = 0.03;
        const damping = 0.93;
        
        p.vy += -p.dispY * springK;
        p.vy *= damping;
        p.dispY += p.vy;
      }
    }

    // Second pass: Draw mesh connections (lines)
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(0, 163, 255, 0.04)'; // Extremely subtle grid lines
    ctx.lineWidth = 0.8;

    for (let c = 0; c < columns; c++) {
      for (let r = 0; r < rows; r++) {
        const p = grid[c][r];
        const proj = getProjectedPoint(p, time);
        if (!proj) continue;

        // Connect to right neighbor
        if (c < columns - 1) {
          const rightP = grid[c + 1][r];
          const rightProj = getProjectedPoint(rightP, time);
          if (rightProj) {
            ctx.moveTo(proj.x, proj.y);
            ctx.lineTo(rightProj.x, rightProj.y);
          }
        }

        // Connect to bottom neighbor
        if (r < rows - 1) {
          const bottomP = grid[c][r + 1];
          const bottomProj = getProjectedPoint(bottomP, time);
          if (bottomProj) {
            ctx.moveTo(proj.x, proj.y);
            ctx.lineTo(bottomProj.x, bottomProj.y);
          }
        }
      }
    }
    ctx.stroke();

    // Third pass: Draw mouse glow effect
    if (mouse.active) {
      const grad = ctx.createRadialGradient(mouse.x, mouse.y, 0, mouse.x, mouse.y, 150);
      grad.addColorStop(0, 'rgba(0, 163, 255, 0.08)');
      grad.addColorStop(1, 'rgba(0, 163, 255, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(mouse.x, mouse.y, 150, 0, Math.PI * 2);
      ctx.fill();
    }

    // Fourth pass: Draw points in batches to optimize performance
    const levels = [[], [], [], [], []];
    
    for (let c = 0; c < columns; c++) {
      for (let r = 0; r < rows; r++) {
        const p = grid[c][r];
        const proj = getProjectedPoint(p, time);
        if (!proj) continue;

        const size = Math.max(0.6, proj.scale * 1.5);
        
        let levelIdx = 1;
        const dispVal = Math.abs(p.dispY);
        
        if (dispVal > 6) {
          levelIdx = 4; // Perturbed/Active points
        } else {
          // Map world height range [-25, 25] to levels 0 to 3
          const normalizedHeight = (proj.worldY + 25) / 50;
          levelIdx = Math.max(0, Math.min(3, Math.floor(normalizedHeight * 4)));
        }

        levels[levelIdx].push({
          x: proj.x,
          y: proj.y,
          size: size,
          depth: proj.depth
        });
      }
    }

    // Color definitions for each height/perturbation level
    // Blends from deep indigo/blue up to bright teal/white
    const colors = [
      'rgba(99, 102, 241, 0.15)',  // Deep parts: Indigo/purple
      'rgba(0, 163, 255, 0.35)',   // Mid parts: Deep blue
      'rgba(0, 210, 255, 0.55)',   // Mid-high: Cyan
      'rgba(14, 165, 233, 0.75)',  // Peaks: Bright Cyan-Blue
      'rgba(255, 255, 255, 0.95)'  // Mouse perturbed / extreme peaks: Bright white
    ];

    const cameraDistance = 380;

    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = colors[i];
      const pts = levels[i];
      for (let j = 0; j < pts.length; j++) {
        const pt = pts[j];
        
        // Apply depth fading to size to make distant points smaller/fader
        const depthRatio = (pt.depth - cameraDistance + 150) / 350;
        const depthFade = Math.max(0.08, 1 - depthRatio);
        
        const s = pt.size * depthFade;
        
        // Draw the point as a high-performance rectangle
        ctx.fillRect(pt.x - s / 2, pt.y - s / 2, s, s);
      }
    }

    requestAnimationFrame(animate);
  }

  animate();
})();
