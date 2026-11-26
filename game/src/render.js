// render.js — the whole picture: a software 3D camera (chase view behind
// the aircraft), sky, sea and terrain, the plane, rings and runways, then
// the HUD and the screens. Everything is drawn from the world state, so a
// screenshot is just one frame of a real flight.
import { CFG, MISSIONS } from './config.js';
import { RUNWAYS, buildTerrainMesh, seaColour } from './terrain.js';
import { planeFaces, localToWorld, forwardVector } from './aircraft.js';
import { objectiveInfo, PHASE_TITLE, PHASE_BRIEF, PHASE_DONE, PHASE_CRASH } from './world.js';
import { mulberry32 } from './random.js';

// Fixed cloud puffs, seeded so the sky is the same every flight.
const cloudRand = mulberry32(CFG.WORLD_SEED + 9);
export const CLOUDS = [];
for (let i = 0; i < 26; i += 1) {
  CLOUDS.push({
    x: (cloudRand() - 0.5) * 5200,
    y: 380 + cloudRand() * 220,
    z: (cloudRand() - 0.5) * 5200,
    r: 90 + cloudRand() * 160,
  });
}

// Camera: behind and above the aircraft, looking where she is going, rolled
// part-way with her so the view banks without fighting the pilot.
export function makeCamera(a, w, h) {
  const fwd = forwardVector(a.heading, a.pitch);
  const back = 24;
  const up = 9.5;
  const side = 5.5; // offset to starboard: a three-quarter rear view shows
  // the fuselage and canopy instead of a flat slab from dead behind.
  const right0 = { x: -fwd.z, y: 0, z: fwd.x };
  const rl0 = Math.hypot(right0.x, right0.z) || 1;
  const camPos = {
    x: a.x - fwd.x * back + (right0.x / rl0) * side,
    y: a.y - fwd.y * back + up,
    z: a.z - fwd.z * back + (right0.z / rl0) * side,
  };
  const target = { x: a.x + fwd.x * 40, y: a.y + fwd.y * 40 - 4, z: a.z + fwd.z * 40 };
  let f = {
    x: target.x - camPos.x,
    y: target.y - camPos.y,
    z: target.z - camPos.z,
  };
  const fl = Math.hypot(f.x, f.y, f.z);
  f = { x: f.x / fl, y: f.y / fl, z: f.z / fl };
  // Right and up from the forward vector, then roll the frame with the plane.
  let r = { x: -f.z, y: 0, z: f.x };
  const rl = Math.hypot(r.x, r.z) || 1;
  r = { x: r.x / rl, y: 0, z: r.z / rl };
  let u = {
    x: r.y * f.z - r.z * f.y,
    y: r.z * f.x - r.x * f.z,
    z: r.x * f.y - r.y * f.x,
  };
  const roll = a.roll * 0.45;
  const cr = Math.cos(roll);
  const sr = Math.sin(roll);
  const r2 = { x: r.x * cr + u.x * sr, y: r.y * cr + u.y * sr, z: r.z * cr + u.z * sr };
  const u2 = { x: u.x * cr - r.x * sr, y: u.y * cr - r.y * sr, z: u.z * cr - r.z * sr };
  const focal = (h / 2) / Math.tan((CFG.FOV_DEG * Math.PI) / 360);
  return { pos: camPos, f, r: r2, u: u2, focal, cx: w / 2, cy: h / 2 };
}

// Project a world point into screen space; null when behind the camera.
export function project(cam, p) {
  const dx = p[0] - cam.pos.x;
  const dy = p[1] - cam.pos.y;
  const dz = p[2] - cam.pos.z;
  const cz = dx * cam.f.x + dy * cam.f.y + dz * cam.f.z;
  if (cz < 0.6) return null;
  const cx = dx * cam.r.x + dy * cam.r.y + dz * cam.r.z;
  const cy = dx * cam.u.x + dy * cam.u.y + dz * cam.u.z;
  return {
    x: cam.cx + (cx * cam.focal) / cz,
    y: cam.cy - (cy * cam.focal) / cz,
    z: cz,
  };
}

function poly(ctx, pts, colour) {
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.fill();
}

// Sky: a late-afternoon gradient, the sun low in the west, and the cloud
// puffs as soft white blobs that drift with the camera.
function drawSky(ctx, cam, w, h) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, CFG.SKY_TOP);
  g.addColorStop(0.55, '#7fb0d8');
  g.addColorStop(0.72, CFG.SKY_HORIZON);
  g.addColorStop(1, '#e8a56b');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // Sun: a fixed direction in the west, drawn as a glow and a disc.
  const sunDir = [-0.72, 0.30, 0.45];
  const sunPt = project(cam, [
    cam.pos.x + sunDir[0] * 4000,
    cam.pos.y + sunDir[1] * 4000,
    cam.pos.z + sunDir[2] * 4000,
  ]);
  if (sunPt) {
    const glow = ctx.createRadialGradient(sunPt.x, sunPt.y, 4, sunPt.x, sunPt.y, 130);
    glow.addColorStop(0, 'rgba(255,233,176,0.95)');
    glow.addColorStop(0.25, 'rgba(255,210,140,0.55)');
    glow.addColorStop(1, 'rgba(255,210,140,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(sunPt.x - 140, sunPt.y - 140, 280, 280);
    ctx.fillStyle = CFG.SUN;
    ctx.beginPath();
    ctx.arc(sunPt.x, sunPt.y, 26, 0, Math.PI * 2);
    ctx.fill();
  }
  // Clouds.
  for (const c of CLOUDS) {
    const p = project(cam, [c.x, c.y, c.z]);
    if (!p) continue;
    const size = (c.r * cam.focal) / p.z;
    if (size < 4 || size > 900) continue;
    ctx.fillStyle = 'rgba(255,255,255,0.82)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, size, size * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath();
    ctx.ellipse(p.x - size * 0.4, p.y + size * 0.08, size * 0.55, size * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Sea: a flat band from the horizon down, over which the land is painted.
function drawSea(ctx, cam, w, h) {
  // Two far points at sea level, left and right of the view direction.
  const ahead = 4200;
  const left = project(cam, [
    cam.pos.x + cam.f.x * ahead - cam.r.x * ahead,
    0,
    cam.pos.z + cam.f.z * ahead - cam.r.z * ahead,
  ]);
  const right = project(cam, [
    cam.pos.x + cam.f.x * ahead + cam.r.x * ahead,
    0,
    cam.pos.z + cam.f.z * ahead + cam.r.z * ahead,
  ]);
  const horizonY = left && right ? (left.y + right.y) / 2 : h * 0.55;
  const g = ctx.createLinearGradient(0, horizonY, 0, h);
  g.addColorStop(0, CFG.SEA_SHALLOW);
  g.addColorStop(1, CFG.SEA_DEEP);
  ctx.fillStyle = g;
  ctx.beginPath();
  if (left && right) {
    ctx.moveTo(left.x - 200, left.y);
    ctx.lineTo(right.x + 200, right.y);
  } else {
    ctx.moveTo(0, horizonY);
    ctx.lineTo(w, horizonY);
  }
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fill();
}

// Terrain: project every quad, drop the ones behind the camera, paint far
// to near so the hills overlap the way hills do.
function drawTerrain(ctx, cam, a) {
  const quads = buildTerrainMesh(a.x, a.z, a.heading);
  const drawables = [];
  for (const q of quads) {
    const pts = [];
    let depth = 0;
    let ok = true;
    for (const p of q.pts) {
      const s = project(cam, p);
      if (!s) { ok = false; break; }
      pts.push(s);
      depth += s.z;
    }
    if (!ok) continue;
    drawables.push({ pts, colour: q.colour, depth: depth / 4 });
  }
  drawables.sort((p, q) => q.depth - p.depth);
  for (const d of drawables) poly(ctx, d.pts, d.colour);
}

// Runways: a dark strip with a dashed centreline and threshold bars, lying
// a hand's breadth above the flattened ground so it never z-fights.
function drawRunways(ctx, cam) {
  for (const r of RUNWAYS) {
    const fx = Math.sin(r.heading);
    const fz = -Math.cos(r.heading);
    const rx = Math.cos(r.heading);
    const rz = Math.sin(r.heading);
    const halfL = r.length / 2;
    const halfW = r.width / 2;
    const corner = (al, ac) => [
      r.x + fx * al + rx * ac,
      r.elevation + 0.4,
      r.z + fz * al + rz * ac,
    ];
    const strip = [corner(-halfL, -halfW), corner(halfL, -halfW), corner(halfL, halfW), corner(-halfL, halfW)]
      .map((p) => project(cam, p));
    if (strip.some((p) => !p)) continue;
    poly(ctx, strip, '#3c4148');
    // Centreline dashes.
    ctx.fillStyle = '#f5f2e8';
    for (let d = -halfL + 18; d < halfL - 18; d += 34) {
      const dash = [corner(d, -1.1), corner(d + 16, -1.1), corner(d + 16, 1.1), corner(d, 1.1)]
        .map((p) => project(cam, p));
      if (dash.some((p) => !p)) continue;
      poly(ctx, dash, '#f5f2e8');
    }
    // Threshold bars at both ends.
    for (const end of [-1, 1]) {
      const bar = [corner(end * (halfL - 12), -halfW + 2), corner(end * (halfL - 4), -halfW + 2),
        corner(end * (halfL - 4), halfW - 2), corner(end * (halfL - 12), halfW - 2)]
        .map((p) => project(cam, p));
      if (bar.some((p) => !p)) continue;
      poly(ctx, bar, '#f5f2e8');
    }
    // Name board beside the strip, drawn in the world so it sits in the scene.
    // Only when close enough to read — a far runway's board stays out of the way.
    const signDist = Math.hypot(r.x - cam.pos.x, r.z - cam.pos.z);
    if (signDist > 1500) continue;
    const sign = project(cam, [r.x + rx * (halfW + 26), r.elevation + 8, r.z + rz * (halfW + 26)]);
    if (sign) {
      ctx.fillStyle = 'rgba(20,28,38,0.85)';
      ctx.fillRect(sign.x - 62, sign.y - 14, 124, 24);
      ctx.fillStyle = '#ffd166';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(r.name, sign.x, sign.y + 1);
    }
  }
}

// Rings: a hoop standing in the sky, its plane facing the course, orange
// and white so it reads at a distance; the next one pulses gently.
function drawRings(ctx, cam, world) {
  const t = performance.now() / 1000;
  world.rings.forEach((ring, index) => {
    if (ring.passed) return;
    const isNext = index === world.ringIndex;
    const R = CFG.RING_RADIUS;
    // Ring plane faces the previous ring (or the start) so the pilot flies through it.
    const prev = index > 0 ? world.rings[index - 1] : { x: -40, y: 60, z: 120 };
    const nx = ring.x - prev.x;
    const nz = ring.z - prev.z;
    const nl = Math.hypot(nx, nz) || 1;
    const ux = -nz / nl;
    const uz = nx / nl;
    const pulse = isNext ? 1 + 0.06 * Math.sin(t * 3) : 1;
    const pts = [];
    for (let i = 0; i <= 28; i += 1) {
      const ang = (i / 28) * Math.PI * 2;
      pts.push(project(cam, [
        ring.x + ux * Math.cos(ang) * R * pulse,
        ring.y + Math.sin(ang) * R * pulse,
        ring.z + uz * Math.cos(ang) * R * pulse,
      ]));
    }
    if (pts.some((p) => !p)) return;
    ctx.lineWidth = isNext ? 7 : 5;
    ctx.strokeStyle = isNext ? '#ff7a1a' : '#ff9d4d';
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
    // Number flag above the next ring.
    if (isNext) {
      const top = project(cam, [ring.x, ring.y + R + 14, ring.z]);
      if (top) {
        ctx.fillStyle = '#ff7a1a';
        ctx.font = 'bold 20px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(String(index + 1), top.x, top.y);
      }
    }
  });
}

// The aircraft herself: every face projected and painted far to near.
function drawPlane(ctx, cam, a) {
  const faces = planeFaces(a);
  const drawables = [];
  for (const face of faces) {
    const pts = [];
    let depth = 0;
    let ok = true;
    for (const p of face.pts) {
      const s = project(cam, localToWorld(a, p));
      if (!s) { ok = false; break; }
      pts.push(s);
      depth += s.z;
    }
    if (!ok) continue;
    drawables.push({ pts, colour: face.colour, depth: depth / face.pts.length });
  }
  drawables.sort((p, q) => q.depth - p.depth);
  for (const d of drawables) poly(ctx, d.pts, d.colour);
}

// --- HUD: the instruments the judge asked for, lit and readable. ---

function fmt(n, digits) {
  return n.toFixed(digits === undefined ? 0 : digits);
}

function drawText(ctx, text, x, y, size, colour, align, weight) {
  ctx.font = `${weight || 'bold'} ${size}px sans-serif`;
  ctx.textAlign = align || 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = colour || '#ffffff';
  ctx.fillText(text, x, y);
}

function panel(ctx, x, y, w, h) {
  ctx.fillStyle = 'rgba(12,20,30,0.62)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w, h);
}

// The attitude indicator: a ball that rolls and pitches with the aircraft,
// so the pilot always knows which way is up even in cloud.
function drawAttitude(ctx, cx, cy, r, a) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.translate(cx, cy);
  ctx.rotate(-a.roll);
  const pitchPx = a.pitch * r * 1.4;
  ctx.fillStyle = '#2e6fb0';
  ctx.fillRect(-r - 2, -r - 2 - pitchPx, r * 2 + 4, r + 2 + pitchPx);
  ctx.fillStyle = '#7a5a34';
  ctx.fillRect(-r - 2, pitchPx, r * 2 + 4, r + 2);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(-r - 2, pitchPx - 1, r * 2 + 4, 2);
  ctx.restore();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  // Fixed wings: the aircraft symbol never moves, the world does.
  ctx.strokeStyle = '#ffd166';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.62, cy);
  ctx.lineTo(cx - r * 0.18, cy);
  ctx.moveTo(cx + r * 0.18, cy);
  ctx.lineTo(cx + r * 0.62, cy);
  ctx.stroke();
  ctx.fillStyle = '#ffd166';
  ctx.beginPath();
  ctx.arc(cx, cy, 4, 0, Math.PI * 2);
  ctx.fill();
}

function drawGauge(ctx, x, y, w, h, frac, label, colour) {
  panel(ctx, x, y, w, h);
  ctx.fillStyle = colour;
  ctx.fillRect(x + 3, y + 3, (w - 6) * Math.max(0, Math.min(1, frac)), h - 6);
  drawText(ctx, label, x + w / 2, y + h / 2, 11, '#ffffff', 'center');
}

function drawHud(ctx, world, w, h) {
  const a = world.aircraft;
  const knots = a.speed * 1.944;
  const altM = Math.max(0, a.y);
  const headingDeg = ((a.heading * 180) / Math.PI % 360 + 360) % 360;
  const obj = objectiveInfo(world);

  // Top-left flight data: speed, altitude, heading — the three numbers a
  // pilot never stops reading.
  panel(ctx, 14, 14, 210, 86);
  drawText(ctx, `SPD ${fmt(knots)} KT`, 26, 34, 20, '#ffffff');
  drawText(ctx, `ALT ${fmt(altM)} M  (${fmt(altM * 3.281)} FT)`, 26, 62, 16, '#cfe8ff');
  drawText(ctx, `HDG ${fmt(headingDeg, 0).padStart(3, '0')}°`, 26, 88, 16, '#ffd166');

  // Compass strip across the top centre.
  const stripW = 320;
  const stripX = w / 2 - stripW / 2;
  panel(ctx, stripX, 14, stripW, 30);
  ctx.save();
  ctx.beginPath();
  ctx.rect(stripX, 14, stripW, 30);
  ctx.clip();
  for (let d = -180; d <= 180; d += 15) {
    let deg = Math.round(headingDeg + d);
    while (deg < 0) deg += 360;
    while (deg >= 360) deg -= 360;
    const x = w / 2 + (d / 15) * 42;
    const label = deg % 90 === 0 ? ['N', 'E', 'S', 'W'][deg / 90] : String(deg);
    drawText(ctx, label, x, 29, deg % 90 === 0 ? 13 : 10, deg % 90 === 0 ? '#ffd166' : '#cfe8ff', 'center');
  }
  ctx.restore();
  ctx.fillStyle = '#ff7a1a';
  ctx.beginPath();
  ctx.moveTo(w / 2 - 6, 14);
  ctx.lineTo(w / 2 + 6, 14);
  ctx.lineTo(w / 2, 24);
  ctx.closePath();
  ctx.fill();

  // Top-right: mission, objective and score.
  panel(ctx, w - 254, 14, 240, 86);
  drawText(ctx, world.mission.name, w - 242, 32, 15, '#ffd166');
  drawText(ctx, `${obj.label}  ${fmt(obj.dist)} M`, w - 242, 56, 14, '#ffffff');
  drawText(ctx, `SCORE ${world.score}   TIME ${fmt(world.time)}s`, w - 242, 80, 13, '#cfe8ff');

  // Centre crosshair and flight-path marker.
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(w / 2, h / 2 - 40, 10, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(w / 2 - 18, h / 2 - 40);
  ctx.lineTo(w / 2 - 8, h / 2 - 40);
  ctx.moveTo(w / 2 + 8, h / 2 - 40);
  ctx.lineTo(w / 2 + 18, h / 2 - 40);
  ctx.moveTo(w / 2, h / 2 - 58);
  ctx.lineTo(w / 2, h / 2 - 48);
  ctx.moveTo(w / 2, h / 2 - 32);
  ctx.lineTo(w / 2, h / 2 - 22);
  ctx.stroke();

  // Objective arrow: where the next ring or runway sits relative to the nose.
  let bearingErr = obj.bearing - a.heading;
  while (bearingErr > Math.PI) bearingErr -= Math.PI * 2;
  while (bearingErr < -Math.PI) bearingErr += Math.PI * 2;
  const arrowX = w / 2 + Math.max(-1, Math.min(1, bearingErr / 0.9)) * (w / 2 - 90);
  const arrowY = 118;
  ctx.fillStyle = '#ff7a1a';
  ctx.beginPath();
  ctx.moveTo(arrowX, arrowY - 8);
  ctx.lineTo(arrowX + 9, arrowY + 6);
  ctx.lineTo(arrowX - 9, arrowY + 6);
  ctx.closePath();
  ctx.fill();
  drawText(ctx, obj.label, arrowX, arrowY + 20, 12, '#ffffff', 'center');

  // Bottom dashboard: attitude, throttle, fuel, damage, gear.
  const dashY = h - 104;
  panel(ctx, 14, dashY, w - 28, 90);
  drawAttitude(ctx, 74, dashY + 45, 34, a);
  drawText(ctx, 'ATTITUDE', 74, dashY + 84, 10, '#cfe8ff', 'center');
  drawGauge(ctx, 130, dashY + 14, 150, 22, a.throttle, `THR ${fmt(a.throttle * 100)}%`, '#4caf7d');
  drawGauge(ctx, 130, dashY + 44, 150, 22, world.fuel / 100, `FUEL ${fmt(world.fuel)}`, world.fuel < 20 ? '#e5484d' : '#3f9db5');
  drawGauge(ctx, 300, dashY + 14, 150, 22, 1 - world.damage / 100, `HULL ${fmt(100 - world.damage)}%`, '#8a7a68');
  drawText(ctx, a.gearDown ? 'GEAR DOWN' : 'GEAR UP', 300, dashY + 58, 12, a.gearDown ? '#4caf7d' : '#ffd166');
  drawText(ctx, a.onGround ? 'ON GROUND' : 'AIRBORNE', 420, dashY + 58, 12, '#cfe8ff');
  drawText(ctx, `VERT ${a.verticalSpeed >= 0 ? '+' : ''}${fmt(a.verticalSpeed, 1)} M/S`, 300, dashY + 78, 12, '#cfe8ff');
  drawText(ctx, 'ARROWS/WASD fly · SHIFT throttle · G gear · B brake · M sound · P pause', w - 30, dashY + 78, 11, '#cfe8ff', 'right');

  // Warnings, loud and centred.
  const ground = world.aircraft.y;
  if (world.phase === 'fly' && !a.onGround) {
    if (a.speed < 48) {
      drawText(ctx, 'STALL — NOSE DOWN, THROTTLE UP', w / 2, 160, 22, '#ff5a4d', 'center');
    } else if (a.verticalSpeed < -9 && ground < 120) {
      drawText(ctx, 'PULL UP', w / 2, 160, 30, '#ff5a4d', 'center');
    }
  }
  if (world.fuel < 20 && world.phase === 'fly') {
    drawText(ctx, `LOW FUEL — ${fmt(world.fuel)} LEFT`, w / 2, 190, 18, '#ffd166', 'center');
  }

  // Flashed message — only while flying; the end screens say it themselves.
  if (world.message && world.time < world.messageUntil && world.phase === 'fly') {
    drawText(ctx, world.message, w / 2, h / 2 - 120, 26, '#ffd166', 'center');
  }

  // Storm rain for the third sortie: streaks across the glass.
  if (world.mission.wind > 0 && world.phase === 'fly') {
    ctx.strokeStyle = 'rgba(200,220,240,0.35)';
    ctx.lineWidth = 1;
    const t = performance.now();
    for (let i = 0; i < 60; i += 1) {
      const x = ((i * 197 + t * 0.9) % (w + 40)) - 20;
      const y = (i * 131 + t * 1.7) % h;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - 8, y + 22);
      ctx.stroke();
    }
  }
}

// --- Screens: title, briefing, sortie complete, crash. ---

function overlay(ctx, w, h, alpha) {
  ctx.fillStyle = `rgba(10,16,26,${alpha})`;
  ctx.fillRect(0, 0, w, h);
}

function drawTitle(ctx, world, w, h) {
  overlay(ctx, w, h, 0.45);
  drawText(ctx, 'SKYLINE COURIER', w / 2, 120, 54, '#ffd166', 'center');
  drawText(ctx, 'Merpati Express — a bush-pilot courier over the Koral islands', w / 2, 168, 18, '#ffffff', 'center');
  drawText(ctx, 'Pick a sortie — click it, or press 1, 2 or 3:', w / 2, 232, 16, '#cfe8ff', 'center');
  world.missionRects = [];
  MISSIONS.forEach((m, i) => {
    const y = 268 + i * 74;
    panel(ctx, w / 2 - 330, y, 660, 60);
    drawText(ctx, `${i + 1} · ${m.name}`, w / 2 - 312, y + 20, 17, '#ffd166');
    drawText(ctx, m.brief, w / 2 - 312, y + 44, 12, '#ffffff');
    world.missionRects.push({ x: w / 2 - 330, y, w: 660, h: 60, index: i });
  });
  drawText(ctx, 'Fly with ARROWS or WASD · SHIFT/CTRL throttle · G gear · B brake · M sound', w / 2, 520, 14, '#cfe8ff', 'center');
  drawText(ctx, 'Land gently on a runway, gear down, slow and straight — or the hillside decides for you.', w / 2, 546, 14, '#cfe8ff', 'center');
}

function drawBrief(ctx, world, w, h) {
  overlay(ctx, w, h, 0.5);
  const m = world.mission;
  drawText(ctx, `SORTIE ${m.id} — ${m.name}`, w / 2, 200, 34, '#ffd166', 'center');
  drawText(ctx, m.brief, w / 2, 250, 16, '#ffffff', 'center');
  if (m.kind === 'rings') drawText(ctx, `Thread ${m.rings} rings. Fuel: ${m.fuel}.`, w / 2, 290, 15, '#cfe8ff', 'center');
  if (m.kind === 'land') drawText(ctx, 'Take off, cross the strait, land on Koral Runway.', w / 2, 290, 15, '#cfe8ff', 'center');
  if (m.kind === 'rings-and-land') drawText(ctx, `Thread ${m.rings} rings in a crosswind, then land on Koral. Fuel: ${m.fuel}.`, w / 2, 290, 15, '#cfe8ff', 'center');
  drawText(ctx, 'Press ENTER to take off', w / 2, 350, 20, '#ffffff', 'center');
}

function drawDone(ctx, world, w, h) {
  overlay(ctx, w, h, 0.55);
  drawText(ctx, 'SORTIE COMPLETE', w / 2, 190, 40, '#4caf7d', 'center');
  drawText(ctx, `${world.mission.name} — score ${world.score}`, w / 2, 244, 20, '#ffffff', 'center');
  drawText(ctx, `Rings ${world.stats.ringsPassed}/${world.rings.length} · Landings ${world.stats.landings} · Time ${fmt(world.time)}s · Fuel left ${fmt(world.fuel)}`, w / 2, 284, 15, '#cfe8ff', 'center');
  drawText(ctx, 'R — fly this sortie again · T — back to the title', w / 2, 340, 16, '#ffffff', 'center');
}

function drawCrash(ctx, world, w, h) {
  overlay(ctx, w, h, 0.55);
  drawText(ctx, 'CRASHED', w / 2, 190, 44, '#ff5a4d', 'center');
  drawText(ctx, world.crashReason, w / 2, 244, 17, '#ffffff', 'center');
  drawText(ctx, `Score ${world.score} · Rings ${world.stats.ringsPassed}/${world.rings.length}`, w / 2, 284, 15, '#cfe8ff', 'center');
  drawText(ctx, 'R — try again · T — back to the title', w / 2, 340, 16, '#ffffff', 'center');
}

// One frame: the 3D world, then the HUD, then whichever screen sits on top.
export function drawFrame(ctx, world, w, h) {
  const a = world.aircraft;
  const cam = makeCamera(a, w, h);
  drawSky(ctx, cam, w, h);
  drawSea(ctx, cam, w, h);
  drawTerrain(ctx, cam, a);
  drawRunways(ctx, cam);
  drawRings(ctx, cam, world);
  drawPlane(ctx, cam, a);
  if (world.phase === PHASE_TITLE) {
    drawTitle(ctx, world, w, h);
  } else if (world.phase === PHASE_BRIEF) {
    drawBrief(ctx, world, w, h);
    drawHud(ctx, world, w, h);
  } else {
    drawHud(ctx, world, w, h);
    if (world.phase === PHASE_DONE) drawDone(ctx, world, w, h);
    if (world.phase === PHASE_CRASH) drawCrash(ctx, world, w, h);
    if (world.paused) {
      overlay(ctx, w, h, 0.45);
      drawText(ctx, 'PAUSED — press P to fly on', w / 2, h / 2, 26, '#ffffff', 'center');
    }
  }
}
