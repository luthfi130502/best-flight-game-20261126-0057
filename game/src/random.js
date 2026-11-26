// random.js — a small seeded generator plus the value-noise the terrain is
// built from. One seed drives the whole island, so a screenshot staged from
// the same seed always shows the same hills, rings and runway.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Smooth 2D value noise: a lattice of random heights, bilinearly blended
// with a smoothstep so the hills roll instead of stepping.
export function makeNoise2D(seed) {
  const rand = mulberry32(seed);
  const SIZE = 64;
  const grid = new Float32Array(SIZE * SIZE);
  for (let i = 0; i < grid.length; i += 1) grid[i] = rand();
  const smooth = (t) => t * t * (3 - 2 * t);
  return function noise(x, z) {
    const xi = Math.floor(x);
    const zi = Math.floor(z);
    const xf = x - xi;
    const zf = z - zi;
    const x0 = ((xi % SIZE) + SIZE) % SIZE;
    const z0 = ((zi % SIZE) + SIZE) % SIZE;
    const x1 = (x0 + 1) % SIZE;
    const z1 = (z0 + 1) % SIZE;
    const a = grid[z0 * SIZE + x0];
    const b = grid[z0 * SIZE + x1];
    const c = grid[z1 * SIZE + x0];
    const d = grid[z1 * SIZE + x1];
    const u = smooth(xf);
    const v = smooth(zf);
    return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
  };
}

// Fractal noise: three octaves, each half the strength of the last, so the
// terrain has both broad hills and small bumps.
export function makeFbm(seed) {
  const n1 = makeNoise2D(seed);
  const n2 = makeNoise2D(seed + 101);
  const n3 = makeNoise2D(seed + 202);
  return function fbm(x, z) {
    return n1(x, z) * 0.55 + n2(x * 2.3, z * 2.3) * 0.3 + n3(x * 5.1, z * 5.1) * 0.15;
  };
}
