// world.js — the sortie itself: which mission is flying, where the rings
// hang, whether the last touchdown was a landing or a crash, and the score.
// The flight model moves the plane; this file decides what that means.
import { CFG, MISSIONS } from './config.js';
import { RUNWAYS, heightAt, runwayDistance } from './terrain.js';
import { newAircraft, forwardVector } from './aircraft.js';
import { mulberry32 } from './random.js';

export const PHASE_TITLE = 'title';
export const PHASE_BRIEF = 'brief';
export const PHASE_FLY = 'fly';
export const PHASE_DONE = 'done';
export const PHASE_CRASH = 'crash';

// Ring positions are seeded per mission, so every pilot flies the same
// course and a screenshot staged from the seed shows the same rings.
export function ringCourse(mission) {
  const rand = mulberry32(CFG.WORLD_SEED + mission.id * 77);
  const rings = [];
  if (mission.kind === 'rings') {
    // A loop over the home island, climbing and turning back on itself.
    const centres = [
      [260, 150, -260], [620, 210, -420], [780, 240, 60],
      [420, 200, 420], [-120, 170, 520], [-420, 150, 120],
    ];
    for (let i = 0; i < mission.rings; i += 1) {
      const c = centres[i % centres.length];
      // A ring hangs in open air: at least 80 m above whatever hill sits under it.
      rings.push({ x: c[0], y: Math.max(c[1], heightAt(c[0], c[2]) + 80), z: c[2], passed: false });
    }
  } else if (mission.kind === 'rings-and-land') {
    // Out across the strait toward Koral, one ring low over the water.
    const centres = [
      [380, 170, -320], [820, 200, -700], [1150, 170, -1010], [1380, 150, -1150],
    ];
    for (let i = 0; i < mission.rings; i += 1) {
      const c = centres[i % centres.length];
      rings.push({ x: c[0], y: Math.max(c[1], heightAt(c[0], c[2]) + 80), z: c[2], passed: false });
    }
  }
  return rings;
}

export function newWorld(missionIndex) {
  const mission = MISSIONS[missionIndex];
  return {
    missionIndex,
    mission,
    aircraft: newAircraft(mission),
    rings: ringCourse(mission),
    ringIndex: 0,
    fuel: mission.fuel,
    damage: 0,
    score: 0,
    time: 0,
    phase: PHASE_TITLE,
    message: '',
    messageUntil: 0,
    landedRunway: null,
    crashReason: '',
    stats: { ringsPassed: 0, landings: 0, bestLandingSink: null },
    wind: mission.wind,
  };
}

export function nextRing(world) {
  return world.rings[world.ringIndex] ?? null;
}

// Distance and bearing from the aircraft to the current objective: the
// next ring, or the far runway when the rings are done.
export function objectiveInfo(world) {
  const a = world.aircraft;
  const ring = nextRing(world);
  if (ring) {
    const dx = ring.x - a.x;
    const dy = ring.y - a.y;
    const dz = ring.z - a.z;
    const dist = Math.hypot(dx, dy, dz);
    const bearing = Math.atan2(dx, -dz);
    return { kind: 'ring', label: `RING ${world.ringIndex + 1}/${world.rings.length}`, dist, bearing, dy };
  }
  const runway = RUNWAYS[1];
  const dx = runway.x - a.x;
  const dz = runway.z - a.z;
  const dist = Math.hypot(dx, dz);
  const bearing = Math.atan2(dx, -dz);
  return { kind: 'runway', label: runway.name, dist, bearing, dy: runway.elevation - a.y };
}

// Show a centre-screen message for a few seconds.
export function flash(world, text, seconds) {
  world.message = text;
  world.messageUntil = world.time + seconds;
}

// A ring counts when the aircraft passes through its disc: close to the
// ring's centre plane and inside its radius.
function checkRing(world) {
  const ring = nextRing(world);
  if (!ring) return;
  const a = world.aircraft;
  const dx = a.x - ring.x;
  const dy = a.y - ring.y;
  const dz = a.z - ring.z;
  const dist = Math.hypot(dx, dy, dz);
  if (dist < CFG.RING_RADIUS * 0.9) {
    ring.passed = true;
    world.ringIndex += 1;
    world.stats.ringsPassed += 1;
    world.score += CFG.RING_SCORE;
    flash(world, `RING ${world.ringIndex} — +${CFG.RING_SCORE}`, 2.2);
  }
}

// Was this touchdown a landing? Slow, gentle, straight, gear down, on the
// strip — anything else is a crash, and the reason says which.
function landingVerdict(world, runway) {
  const a = world.aircraft;
  const d = runwayDistance(runway, a.x, a.z);
  if (Math.abs(d.along) > runway.length / 2 || Math.abs(d.across) > runway.width / 2) {
    return { ok: false, reason: 'You came down off the runway, in the rough.' };
  }
  if (!a.gearDown) return { ok: false, reason: 'Wheels up — she landed on her belly.' };
  if (a.speed > CFG.LAND_MAX_SPEED) return { ok: false, reason: 'Too fast on touchdown — she ran off the strip.' };
  if (Math.abs(a.verticalSpeed) > CFG.LAND_MAX_SINK) return { ok: false, reason: 'Too hard a touchdown — the gear gave way.' };
  if (Math.abs(a.roll) > CFG.LAND_MAX_ROLL) return { ok: false, reason: 'One wing low on touchdown — she cartwheeled.' };
  // A runway is landed along, either direction: the error is to the strip's axis.
  let headingErr = Math.abs(a.heading - runway.heading) % Math.PI;
  if (headingErr > Math.PI / 2) headingErr = Math.PI - headingErr;
  if (headingErr > CFG.LAND_MAX_HEADING_ERR) return { ok: false, reason: 'Across the runway, not along it.' };
  return { ok: true, reason: '' };
}

function checkGround(world) {
  const a = world.aircraft;
  if (!a.onGround) return;
  const ground = heightAt(a.x, a.z);
  if (a.y > ground + 0.5) return;
  // On the ground: is this a runway, and was the arrival a landing?
  for (const runway of RUNWAYS) {
    const d = runwayDistance(runway, a.x, a.z);
    const onStrip = Math.abs(d.along) <= runway.length / 2 && Math.abs(d.across) <= runway.width / 2;
    if (!onStrip) continue;
    // First touch on a strip after having been airborne: judge the landing.
    if (a.speed > 12 && world.phase === PHASE_FLY && world.stats.landings === 0 && world.stats.wasAirborne) {
      const verdict = landingVerdict(world, runway);
      if (verdict.ok) {
        world.stats.landings += 1;
        world.landedRunway = runway;
        world.stats.bestLandingSink = Math.abs(a.verticalSpeed);
        const soft = Math.max(0, 1 - Math.abs(a.verticalSpeed) / CFG.LAND_MAX_SINK);
        const bonus = Math.round(CFG.LAND_SCORE * (0.6 + 0.4 * soft));
        world.score += bonus;
        flash(world, `TOUCHDOWN — ${runway.name} +${bonus}`, 3);
        if (world.mission.kind !== 'rings' && world.ringIndex >= world.rings.length) {
          finishSortie(world);
        }
      } else {
        crash(world, verdict.reason);
      }
      return;
    }
    return; // rolling on a strip, nothing to judge
  }
  // Ground that is not a runway, arrived at speed: a crash.
  if (a.speed > 25 && world.phase === PHASE_FLY) {
    crash(world, 'Terrain — the hillside came up to meet you.');
  }
}

export function crash(world, reason) {
  world.phase = PHASE_CRASH;
  world.crashReason = reason;
  world.damage = 100;
}

export function finishSortie(world) {
  const timeBonus = Math.max(0, Math.round((240 - world.time) * CFG.TIME_BONUS_PER_SEC));
  const fuelBonus = Math.round(world.fuel * CFG.FUEL_BONUS_PER_UNIT);
  world.score += timeBonus + fuelBonus;
  world.phase = PHASE_DONE;
}

// One world step: fuel burns, the ring and the ground are checked, and the
// sortie ends when the tank runs dry or the goal is met.
export function stepWorld(world, ctl, dt) {
  if (world.phase !== PHASE_FLY) return;
  world.time += dt;
  const a = world.aircraft;
  world.fuel -= (CFG.FUEL_BURN_BASE + CFG.FUEL_BURN_THROTTLE * a.throttle) * dt;
  if (world.fuel <= 0) {
    world.fuel = 0;
    if (!a.onGround) {
      crash(world, 'Out of fuel — she glided down into the sea.');
    } else {
      finishSortie(world);
    }
    return;
  }
  checkRing(world);
  if (world.mission.kind === 'rings' && world.ringIndex >= world.rings.length) {
    finishSortie(world);
    return;
  }
  if (!a.onGround) world.stats.wasAirborne = true;
  checkGround(world);
  if (world.phase === PHASE_FLY && a.y < 1 && !a.onGround && heightAt(a.x, a.z) < 0) {
    crash(world, 'Ditched in the sea — the strait is not a runway.');
  }
}
