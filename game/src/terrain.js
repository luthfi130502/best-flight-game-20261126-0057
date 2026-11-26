// terrain.js — the island chain. Two islands rise out of the sea; the
// runways are flattened shelves carved into them, and everything the
// renderer draws comes from heightAt() and colourFor().
import { CFG } from './config.js';
import { makeFbm } from './random.js';

const fbm = makeFbm(CFG.WORLD_SEED);

// The runways, in world space. The home strip points north-east along the
// valley; the far strip points back toward home so a landing is a straight
// shot down the strait.
export const RUNWAYS = [
  {
    name: 'MERPATI FIELD',
    x: -40, z: 120,
    heading: 0.6,
    length: CFG.RUNWAY_LENGTH,
    width: CFG.RUNWAY_WIDTH,
    elevation: 26,
  },
  {
    name: 'KORAL RUNWAY',
    x: 1500, z: -1250,
    heading: 0.6 + Math.PI,
    length: CFG.RUNWAY_LENGTH,
    width: CFG.RUNWAY_WIDTH,
    elevation: 34,
  },
];

// Distance from (x, z) to the centre line of a runway strip, in metres.
export function runwayDistance(runway, x, z) {
  const dx = x - runway.x;
  const dz = z - runway.z;
  const along = dx * Math.sin(runway.heading) - dz * Math.cos(runway.heading);
  const across = dx * Math.cos(runway.heading) + dz * Math.sin(runway.heading);
  return { along, across };
}

// How far a point sits inside a runway's flat shelf (1 at the centre line,
// fading to 0 at the strip's edge), for flattening the ground under it.
function runwayShelf(x, z) {
  let best = 0;
  for (const r of RUNWAYS) {
    const d = runwayDistance(r, x, z);
    const halfLen = r.length / 2 + 40;
    const halfWid = r.width / 2 + 30;
    if (Math.abs(d.along) < halfLen && Math.abs(d.across) < halfWid) {
      const flat =
        Math.min(1, (halfLen - Math.abs(d.along)) / 40) *
        Math.min(1, (halfWid - Math.abs(d.across)) / 30);
      best = Math.max(best, flat);
    }
  }
  return best;
}

// Island falloff: 1 deep inside an island, 0 out at sea, smooth in between.
function islandMask(x, z) {
  let mask = 0;
  for (const isl of [CFG.HOME_ISLAND, CFG.FAR_ISLAND]) {
    const d = Math.hypot(x - isl.x, z - isl.z) / isl.radius;
    const m = Math.max(0, 1 - d * d);
    mask = Math.max(mask, m * m * (3 - 2 * m));
  }
  return mask;
}

// A clear corridor along each runway's axis: the ground is blended toward
// a gentle 3% rise out to 800 m past each end, so a climb-out never meets
// a hillside right past the threshold — and a landing approach comes in
// over a shallow slope, not a cliff.
function corridorBlend(x, z) {
  let bestW = 0;
  let bestTarget = 0;
  for (const r of RUNWAYS) {
    const d = runwayDistance(r, x, z);
    const halfLen = r.length / 2;
    const beyond = Math.max(0, Math.abs(d.along) - halfLen);
    if (beyond > 800 || Math.abs(d.across) > 90) continue;
    const wAcross = 1 - Math.abs(d.across) / 90;
    const wAlong = 1 - beyond / 800;
    const w = Math.min(1, wAcross * wAlong * 1.6);
    if (w > bestW) {
      bestW = w;
      bestTarget = r.elevation + beyond * 0.03;
    }
  }
  return { w: bestW, target: bestTarget };
}

// Ground height in metres. Sea floor is below zero; hills rise with the
// island mask; runway shelves are flat so a landing reads as a landing.
export function heightAt(x, z) {
  const mask = islandMask(x, z);
  let h = -18 + mask * (26 + fbm(x * 0.0016, z * 0.0016) * CFG.MAX_HILL);
  const shelf = runwayShelf(x, z);
  if (shelf > 0) {
    let target = 0;
    for (const r of RUNWAYS) {
      const d = runwayDistance(r, x, z);
      if (Math.abs(d.along) < r.length / 2 + 40 && Math.abs(d.across) < r.width / 2 + 30) target = r.elevation;
    }
    h = h * (1 - shelf) + target * shelf;
  }
  const corridor = corridorBlend(x, z);
  if (corridor.w > 0) h = h * (1 - corridor.w) + corridor.target * corridor.w;
  return h;
}

// Colour of the ground at a height, blended by altitude: sand at the
// waterline, meadow, forest, rock, then snow on the highest peaks.
export function colourFor(h, slope) {
  if (h < 2) return '#e8d39a';
  if (h < 55) return shade('#5f9e4d', slope);
  if (h < 120) return shade('#3f7d3a', slope);
  if (h < 185) return shade('#8a7a68', slope);
  return shade('#f2f4f6', slope);
}

// Darken a hex colour by a 0..1 shade factor (used for slope shading, so a
// hillside facing away from the sun reads as a hillside).
function shade(hex, amount) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const f = 1 - amount * 0.35;
  const to = (v) => Math.max(0, Math.min(255, Math.round(v * f))).toString(16).padStart(2, '0');
  return '#' + to(r) + to(g) + to(b);
}

// The sea surface: one huge quad at sea level, drawn before the land.
export function seaColour(dist) {
  const t = Math.min(1, dist / 2600);
  return t < 0.35 ? '#3f9db5' : '#1d5f8a';
}

// Build the terrain mesh around a point ahead of the aircraft: a grid of
// quads in world space, each carrying its four corner heights, so the
// renderer only has to project and paint them.
export function buildTerrainMesh(cx, cz, heading) {
  const cells = CFG.MESH_CELLS;
  const cell = CFG.MESH_CELL;
  const span = cells * cell;
  const fx = Math.sin(heading);
  const fz = -Math.cos(heading);
  const rx = Math.cos(heading);
  const rz = Math.sin(heading);
  // Grid origin: the near edge sits just behind the camera, the far edge
  // span metres ahead, so the mesh always covers the view.
  const ox = cx - fx * 150 - rx * span / 2;
  const oz = cz - fz * 150 - rz * span / 2;
  const quads = [];
  for (let i = 0; i < cells; i += 1) {
    for (let j = 0; j < cells; j += 1) {
      const x0 = ox + rx * i * cell + fx * j * cell;
      const z0 = oz + rz * i * cell + fz * j * cell;
      const x1 = ox + rx * (i + 1) * cell + fx * j * cell;
      const z1 = oz + rz * (i + 1) * cell + fz * j * cell;
      const x2 = ox + rx * (i + 1) * cell + fx * (j + 1) * cell;
      const z2 = oz + rz * (i + 1) * cell + fz * (j + 1) * cell;
      const x3 = ox + rx * i * cell + fx * (j + 1) * cell;
      const z3 = oz + rz * i * cell + fz * (j + 1) * cell;
      const h0 = heightAt(x0, z0);
      const h1 = heightAt(x1, z1);
      const h2 = heightAt(x2, z2);
      const h3 = heightAt(x3, z3);
      const hm = (h0 + h1 + h2 + h3) / 4;
      // Underwater quads are sea, not land: skip them, the sea quad covers it.
      if (hm < -1) continue;
      const slope = Math.min(1, (Math.max(h0, h1, h2, h3) - Math.min(h0, h1, h2, h3)) / (cell * 0.9));
      quads.push({
        pts: [[x0, h0, z0], [x1, h1, z1], [x2, h2, z2], [x3, h3, z3]],
        colour: colourFor(hm, slope),
        depth: 0,
      });
    }
  }
  return quads;
}
