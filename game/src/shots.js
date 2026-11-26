// shots.js — the screenshot scenes behind ?shot=cover|rings|landing|win.
// Each one plays the real rules forward from a fresh world for a fixed
// number of steps, steered by a simple autopilot (bank toward the objective,
// hold the pitch that keeps the climb honest, throttle for the target
// speed), so the frame is what a short real flight looks like and the same
// seed always gives the same frame.
import { CFG } from './config.js';
import { RUNWAYS, heightAt, runwayDistance } from './terrain.js';
import { stepAircraft, forwardVector } from './aircraft.js';
import { stepWorld, objectiveInfo, PHASE_FLY, PHASE_DONE } from './world.js';

const STEP = 1 / 60;

// Steer toward a point: bank into the bearing error, pitch toward the
// height error, throttle toward the target speed.
function autopilot(world, target, targetSpeed) {
  const a = world.aircraft;
  const dx = target.x - a.x;
  const dy = target.y - a.y;
  const dz = target.z - a.z;
  const bearing = Math.atan2(dx, -dz);
  let err = bearing - a.heading;
  while (err > Math.PI) err -= Math.PI * 2;
  while (err < -Math.PI) err += Math.PI * 2;
  const roll = Math.max(-1, Math.min(1, err * 1.6));
  const wantPitch = Math.max(-0.3, Math.min(0.35, dy / 220));
  const pitch = Math.max(-1, Math.min(1, (wantPitch - a.pitch) * 2.2));
  const throttle = a.speed < targetSpeed - 4 ? 1 : a.speed > targetSpeed + 4 ? -1 : 0;
  return { pitch, roll, throttle, brake: false };
}

function runSteps(world, seconds, steer, stopWhen) {
  const n = Math.round(seconds / STEP);
  for (let i = 0; i < n; i += 1) {
    const ctl = steer(world);
    stepAircraft(world.aircraft, ctl, STEP, heightAt(world.aircraft.x, world.aircraft.z), world.wind);
    stepWorld(world, ctl, STEP);
    if (world.phase !== PHASE_FLY && world.phase !== PHASE_DONE) break;
    if (stopWhen && stopWhen(world)) break;
  }
}

// Take off from the home runway and climb to cruise, gear up once she is flying.
function takeoff(world) {
  // Full throttle on the roll, rotate once the wing is flying.
  runSteps(world, 14, (w) => {
    const a = w.aircraft;
    const pitch = a.speed > 45 ? 0.8 : 0;
    return { pitch, roll: 0, throttle: 1, brake: false };
  });
  world.aircraft.gearDown = false;
}

// Fly the course until the named ring is the next one, then stop just short
// of it so the hoop fills the frame ahead of the nose. The rings are flown
// in order — a ring only counts when it is the next one.
function flyToRing(world, ringNumber) {
  runSteps(world, 180, (w) => {
    const ring = w.rings[w.ringIndex];
    if (!ring) return { pitch: 0, roll: 0, throttle: 0, brake: false };
    return autopilot(w, ring, 78);
  }, (w) => {
    const ring = w.rings[ringNumber - 1];
    if (!ring) return true;
    const a = w.aircraft;
    return w.ringIndex >= ringNumber - 1 &&
      Math.hypot(ring.x - a.x, ring.y - a.y, ring.z - a.z) < 170;
  });
}

// Approach pilot: tracks a 4.3-degree glide slope down to the runway
// instead of chasing the threshold point, so the descent stays gentle
// all the way to a touchdown on the strip.
function approachPilot(world, runway, targetSpeed) {
  const a = world.aircraft;
  const dx = runway.x - a.x;
  const dz = runway.z - a.z;
  const dist = Math.hypot(dx, dz);
  // Past the centre: the runway is behind the nose, so stop chasing it —
  // hold the landing heading and settle onto the strip.
  const d = runwayDistance(runway, a.x, a.z);
  if (d.along < 0) {
    const landHeading = runway.heading + Math.PI;
    let err = landHeading - a.heading;
    while (err > Math.PI) err -= Math.PI * 2;
    while (err < -Math.PI) err += Math.PI * 2;
    return {
      pitch: Math.max(-0.5, Math.min(0, (runway.elevation - a.y) / 50)),
      roll: Math.max(-1, Math.min(1, err * 1.6)),
      throttle: -1,
      brake: false,
    };
  }
  const desiredAlt = runway.elevation + 4 + dist * 0.075;
  const altErr = desiredAlt - a.y;
  const pitch = Math.max(-1, Math.min(1, (altErr / 100 - 0.04) / 0.3));
  const bearing = Math.atan2(dx, -dz);
  let err = bearing - a.heading;
  while (err > Math.PI) err -= Math.PI * 2;
  while (err < -Math.PI) err += Math.PI * 2;
  const roll = Math.max(-1, Math.min(1, err * 1.6));
  const throttle = a.speed < targetSpeed - 4 ? 1 : a.speed > targetSpeed + 4 ? -1 : 0;
  return { pitch, roll, throttle, brake: false };
}

// Fly the island-hop course, then line up on Koral runway and hold the
// final approach: gear down, slow, straight, the strip ahead. `stopShort`
// holds the frame on the approach instead of flying it to a touchdown.
function flyToLanding(world, stopShort) {
  const runway = RUNWAYS[1];
  // The approach comes straight in from home: the gate sits on the
  // landing direction's side of the strip, never past it.
  const fx = Math.sin(runway.heading + Math.PI);
  const fz = -Math.cos(runway.heading + Math.PI);
  // Join the glide slope 1200 m out, 200 m up.
  const gate = { x: runway.x - fx * 1200, y: runway.elevation + 200, z: runway.z - fz * 1200 };
  runSteps(world, 150, (w) => autopilot(w, gate, 72), (w) => {
    const a = w.aircraft;
    return Math.hypot(gate.x - a.x, gate.y - a.y, gate.z - a.z) < 300;
  });
  // Then the slope itself, gear down.
  world.aircraft.gearDown = true;
  let stage = 0;
  runSteps(world, 90, (w) => {
    if (w.phase === PHASE_DONE) return { pitch: 0, roll: 0, throttle: -1, brake: true };
    return approachPilot(w, runway, 55);
  }, stopShort ? (w) => {
    const a = w.aircraft;
    return Math.hypot(runway.x - a.x, runway.z - a.z) < 380 && !a.onGround;
  } : null);
}

// Set `world` to the named scene and return the phase to draw over it.
export function stageShot(name, world) {
  world.phase = PHASE_FLY;
  if (name === 'rings') {
    takeoff(world);
    flyToRing(world, 5);
    return PHASE_FLY;
  }
  if (name === 'landing') {
    // Sortie 2: the island hop, staged on final approach to Koral.
    takeoff(world);
    flyToLanding(world, true);
    return PHASE_FLY;
  }
  if (name === 'win') {
    // Sortie 2 flown to a real landing: the sortie-complete screen.
    takeoff(world);
    flyToLanding(world, false);
    return world.phase;
  }
  // Cover: sortie 1, mid-course, the third ring dead ahead and the island
  // chain spread below.
  takeoff(world);
  flyToRing(world, 3);
  return PHASE_FLY;
}
