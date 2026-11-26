// aircraft.js — the Merpati Express herself: a hand-built bush plane, her
// flight model, and the 3D model the renderer draws. One file, two jobs
// that belong together: how she flies and what she looks like.
import { CFG } from './config.js';

// Fresh aircraft state: parked on the home runway, engine warm, tank full.
export function newAircraft(mission) {
  const r0 = { x: -40, z: 120, heading: 0.6 };
  return {
    x: r0.x,
    y: 26, // home runway elevation
    z: r0.z,
    heading: mission.startHeading,
    pitch: 0,
    roll: 0,
    speed: 0,
    throttle: 0,
    gearDown: true,
    onGround: true,
    verticalSpeed: 0,
    propAngle: 0,
  };
}

// Forward vector from heading and pitch (heading 0 = north, -z).
export function forwardVector(heading, pitch) {
  const cp = Math.cos(pitch);
  return {
    x: Math.sin(heading) * cp,
    y: Math.sin(pitch),
    z: -Math.cos(heading) * cp,
  };
}

// One physics step. `ctl` is { pitch: -1..1, roll: -1..1, throttle: -1..1,
// brake: bool } from the input layer; `wind` is the mission's gust strength.
// Returns nothing — it moves the aircraft in place.
export function stepAircraft(a, ctl, dt, groundHeight, wind) {
  // Throttle: a lever that moves at a fixed rate, not a switch.
  a.throttle = Math.max(0, Math.min(1, a.throttle + ctl.throttle * CFG.THROTTLE_RATE * dt));

  // Stick: pitch and roll ease toward the commanded angles.
  const targetPitch = ctl.pitch * CFG.MAX_PITCH;
  const targetRoll = ctl.roll * CFG.MAX_ROLL;
  a.pitch += (targetPitch - a.pitch) * Math.min(1, 3.2 * dt);
  a.roll += (targetRoll - a.roll) * Math.min(1, 3.2 * dt);

  // Bank turns the nose: coordinated, so the turn rate follows the bank.
  const turnRate = Math.sin(a.roll) * CFG.TURN_AUTHORITY * (a.speed / 60);
  a.heading += turnRate * dt;

  // Gusts push the nose around when the mission says it is stormy.
  if (wind > 0) {
    const gust = Math.sin(performance.now() / 1400) * 0.05 * wind;
    a.heading += gust * dt;
    a.roll += Math.sin(performance.now() / 900) * 0.12 * wind * dt;
  }

  // Speed chases the throttle's target; the wheels scrub speed on the ground.
  const targetSpeed = CFG.MIN_SPEED + a.throttle * (CFG.MAX_SPEED - CFG.MIN_SPEED);
  const accel = a.onGround ? 14 : 9;
  a.speed += Math.max(-accel * dt, Math.min(accel * dt, targetSpeed - a.speed));
  if (ctl.brake && a.onGround) a.speed = Math.max(0, a.speed - CFG.GROUND_DRAG * dt);
  if (a.onGround && a.speed < CFG.STALL_SPEED * 0.72) a.speed = Math.max(a.speed, 0);

  // Climb: the wing turns speed and pitch into altitude, and below stall
  // speed she sinks no matter what the stick says.
  const fwd = forwardVector(a.heading, a.pitch);
  let vy = a.speed * fwd.y * CFG.CLIMB_EFFICIENCY;
  if (!a.onGround && a.speed < CFG.STALL_SPEED) {
    vy -= (CFG.STALL_SPEED - a.speed) * 0.55;
  }
  a.verticalSpeed = vy;

  a.x += fwd.x * a.speed * dt;
  a.z += fwd.z * a.speed * dt;
  a.y += vy * dt;

  // Ground contact: rolling on the strip, or a meeting with the hillside.
  // Over the sea there is no ground to roll on — the world calls that a ditch.
  // Rotation is checked first: enough speed and a pull on the stick lifts
  // her off instead of pinning the nose to the strip.
  if (a.onGround && a.speed > CFG.STALL_SPEED * 0.9 && a.pitch > 0.08) {
    a.onGround = false;
  } else if (groundHeight > CFG.SEA_LEVEL && a.y <= groundHeight) {
    a.y = groundHeight;
    // Touching down: the nose and wings come level with the strip.
    if (!a.onGround) {
      a.onGround = true;
      a.pitch = 0;
      a.roll = 0;
    }
    // Rolling resistance: with the throttle closed she coasts to a stop
    // instead of rolling off the far end of the strip.
    if (a.throttle < 0.05) a.speed = Math.max(0, a.speed - 6 * dt);
  }

  a.propAngle += (2 + a.throttle * 38) * dt;
}

// The airframe as a set of coloured faces in local space: x right, y up,
// z forward-negative (the nose sits at z = -4.2). A high-wing bush plane
// in Merpati Express livery — cream fuselage, orange wings, teal tail —
// built from prisms, so it reads as a machine, not a drawing.
export const PLANE_COLOURS = {
  fuselage: '#f3e2c2',
  fuselageDark: '#d9b98a',
  wing: '#e8703a',
  wingTip: '#c94f1e',
  tail: '#1f7a6d',
  canopy: '#7fc4d8',
  prop: '#2b2b2b',
  strut: '#3a3a3a',
  wheel: '#1c1c1c',
};

// Each face: [vertices..., colour]. Vertices are [x, y, z] in local metres.
export function planeFaces(a) {
  const faces = [];
  const F = PLANE_COLOURS;
  const quad = (v0, v1, v2, v3, colour) => faces.push({ pts: [v0, v1, v2, v3], colour });
  const tri = (v0, v1, v2, colour) => faces.push({ pts: [v0, v1, v2], colour });

  // Fuselage: a tapered box, wide at the cabin, narrow at nose and tail.
  const nose = [[-0.55, -0.35, -4.2], [0.55, -0.35, -4.2], [0.55, 0.35, -4.2], [-0.55, 0.35, -4.2]];
  const cabin = [[-0.85, -0.6, -1.2], [0.85, -0.6, -1.2], [0.85, 0.75, -1.2], [-0.85, 0.75, -1.2]];
  const rear = [[-0.7, -0.45, 2.6], [0.7, -0.45, 2.6], [0.7, 0.55, 2.6], [-0.7, 0.55, 2.6]];
  const tail = [[-0.18, -0.15, 4.6], [0.18, -0.15, 4.6], [0.18, 0.2, 4.6], [-0.18, 0.2, 4.6]];
  const sections = [nose, cabin, rear, tail];
  for (let s = 0; s < sections.length - 1; s += 1) {
    const A = sections[s];
    const B = sections[s + 1];
    quad(A[0], B[0], B[3], A[3], F.fuselageDark); // left side
    quad(A[1], A[2], B[2], B[1], F.fuselage); // right side
    quad(A[3], B[3], B[2], A[2], F.fuselage); // top
    quad(A[0], A[1], B[1], B[0], F.fuselageDark); // belly
  }
  quad(nose[0], nose[3], nose[2], nose[1], F.fuselageDark); // nose cap
  quad(tail[0], tail[1], tail[2], tail[3], F.tail); // tail cap

  // Canopy: a low glasshouse over the cabin.
  quad([-0.55, 0.75, -1.6], [0.55, 0.75, -1.6], [0.45, 1.15, -0.2], [-0.45, 1.15, -0.2], F.canopy);
  quad([-0.55, 0.75, -1.6], [-0.45, 1.15, -0.2], [-0.45, 1.15, 0.6], [-0.55, 0.75, 0.6], F.canopy);
  quad([0.55, 0.75, -1.6], [0.55, 0.75, 0.6], [0.45, 1.15, 0.6], [0.45, 1.15, -0.2], F.canopy);
  quad([-0.45, 1.15, -0.2], [0.45, 1.15, -0.2], [0.45, 1.15, 0.6], [-0.45, 1.15, 0.6], F.canopy);

  // High wing: a slab with real thickness across the cabin roof, orange
  // tips, so it reads as a wing from behind and from the side alike.
  const slab = (x0, x1, yTop, yBottom, z0, z1, colourTop, colourSide) => {
    quad([x0, yTop, z0], [x1, yTop, z0], [x1, yTop, z1], [x0, yTop, z1], colourTop);
    quad([x0, yBottom, z0], [x0, yBottom, z1], [x1, yBottom, z1], [x1, yBottom, z0], colourSide);
    quad([x0, yBottom, z0], [x1, yBottom, z0], [x1, yTop, z0], [x0, yTop, z0], colourSide);
    quad([x0, yBottom, z1], [x0, yTop, z1], [x1, yTop, z1], [x1, yBottom, z1], colourSide);
    quad([x0, yBottom, z0], [x0, yTop, z0], [x0, yTop, z1], [x0, yBottom, z1], colourSide);
    quad([x1, yBottom, z0], [x1, yBottom, z1], [x1, yTop, z1], [x1, yTop, z0], colourSide);
  };
  slab(-7.2, -5.4, 0.86, 0.72, -1.5, 0.4, F.wingTip, F.wingTip);
  slab(-5.4, 5.4, 0.86, 0.72, -1.5, 0.4, F.wing, F.wingTip);
  slab(5.4, 7.2, 0.86, 0.72, -1.5, 0.4, F.wingTip, F.wingTip);
  // Wing struts down to the fuselage.
  quad([-2.6, 0.82, -0.9], [-2.5, 0.82, -0.9], [-2.5, -0.3, -0.9], [-2.6, -0.3, -0.9], F.strut);
  quad([2.6, 0.82, -0.9], [2.5, 0.82, -0.9], [2.5, -0.3, -0.9], [2.6, -0.3, -0.9], F.strut);

  // Tailplane and fin, the tailplane a thin slab like the wing.
  slab(-2.4, 2.4, 0.38, 0.28, 3.9, 4.7, F.tail, F.tail);
  quad([-0.12, 0.2, 3.6], [0.12, 0.2, 3.6], [0.12, 1.7, 4.5], [-0.12, 1.7, 4.5], F.tail);

  // Propeller: two blades spinning around the nose, angled by propAngle.
  const s = Math.sin(a.propAngle);
  const c = Math.cos(a.propAngle);
  const blade = (sign) => {
    const tipX = sign * 1.9 * c;
    const tipY = sign * 1.9 * s;
    tri([0, 0, -4.35], [tipX * 0.92 - tipY * 0.16, tipY * 0.92 + tipX * 0.16, -4.35],
      [tipX + tipY * 0.16, tipY - tipX * 0.16, -4.35], F.prop);
  };
  blade(1);
  blade(-1);

  // Landing gear: two struts and wheels, only when the gear is down.
  if (a.gearDown) {
    for (const side of [-1, 1]) {
      quad([side * 0.7 - 0.08, -0.6, -1.0], [side * 0.7 + 0.08, -0.6, -1.0],
        [side * 0.7 + 0.08, -1.35, -1.0], [side * 0.7 - 0.08, -1.35, -1.0], F.strut);
      quad([side * 0.7 - 0.16, -1.35, -1.25], [side * 0.7 + 0.16, -1.35, -1.25],
        [side * 0.7 + 0.16, -1.35, -0.75], [side * 0.7 - 0.16, -1.35, -0.75], F.wheel);
    }
  }
  return faces;
}

// Rotate a local point by the aircraft's heading, pitch and roll, then
// translate it into world space — the same transform the camera uses.
export function localToWorld(a, p) {
  const [x, y, z] = p;
  // Roll about the forward axis (z).
  const cr = Math.cos(a.roll);
  const sr = Math.sin(a.roll);
  const x1 = x * cr - y * sr;
  const y1 = x * sr + y * cr;
  // Pitch about the lateral axis (x).
  const cp = Math.cos(a.pitch);
  const sp = Math.sin(a.pitch);
  const y2 = y1 * cp - z * sp;
  const z2 = y1 * sp + z * cp;
  // Heading about the vertical axis (y).
  const ch = Math.cos(a.heading);
  const sh = Math.sin(a.heading);
  const x3 = x1 * ch + z2 * sh;
  const z3 = -x1 * sh + z2 * ch;
  return [a.x + x3, a.y + y2, a.z + z3];
}
