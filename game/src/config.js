// config.js — every tunable number for Skyline Courier lives here, so a
// balance change never means hunting through the flight model or renderer.
export const CFG = {
  // Canvas the game draws into (screenshots are taken at this size).
  VIEW_W: 1280,
  VIEW_H: 720,
  FOV_DEG: 68,

  // World: two islands in a sea, heights in metres.
  SEA_LEVEL: 0,
  WORLD_SEED: 20261126,
  HOME_ISLAND: { x: 0, z: 0, radius: 900 },
  FAR_ISLAND: { x: 1500, z: -1250, radius: 700 },
  MAX_HILL: 260,

  // Terrain mesh drawn each frame around the aircraft.
  MESH_CELLS: 26,
  MESH_CELL: 95,

  // Flight model (arcade, but speed, pitch and bank all have to agree).
  STALL_SPEED: 48, // m/s — below this the wing stops flying and she sinks
  MIN_SPEED: 38,
  MAX_SPEED: 138,
  THROTTLE_RATE: 0.55, // per second holding the throttle keys
  PITCH_RATE: 0.55, // rad/s at full stick
  ROLL_RATE: 1.5, // rad/s at full stick
  MAX_PITCH: 0.62,
  MAX_ROLL: 1.15,
  TURN_AUTHORITY: 0.85, // how much bank turns the nose
  CLIMB_EFFICIENCY: 0.92,
  GROUND_DRAG: 26, // m/s^2 the wheels scrub off on a runway roll

  // Fuel and damage: the decisions that make a sortie a sortie.
  FUEL_START: 100,
  FUEL_BURN_BASE: 0.10, // per second, engine idling
  FUEL_BURN_THROTTLE: 0.70, // per second at full throttle
  DAMAGE_GROUND_HIT: 100,
  DAMAGE_HARD_LANDING: 55,
  DAMAGE_RING_MISS: 0,

  // Landing window: gentle, slow, straight, on the strip, gear down.
  LAND_MAX_SINK: 7, // m/s vertical speed
  LAND_MAX_SPEED: 72,
  LAND_MAX_ROLL: 0.28,
  LAND_MAX_HEADING_ERR: 0.30,
  RUNWAY_LENGTH: 320,
  RUNWAY_WIDTH: 26,

  // Rings: fly through the hoop, not just near it.
  RING_RADIUS: 26,
  RING_SCORE: 500,
  LAND_SCORE: 1000,
  TIME_BONUS_PER_SEC: 8,
  FUEL_BONUS_PER_UNIT: 6,

  // Colours: one warm late-afternoon palette for sky, sea and land.
  SKY_TOP: '#2e6fb0',
  SKY_HORIZON: '#f7c98b',
  SUN: '#ffe9b0',
  SEA_DEEP: '#1d5f8a',
  SEA_SHALLOW: '#3f9db5',
  SAND: '#e8d39a',
  GRASS_LOW: '#5f9e4d',
  GRASS_HIGH: '#3f7d3a',
  ROCK: '#8a7a68',
  SNOW: '#f2f4f6',
};

// Missions: three sorties with different goals, flown in order. Each one is
// a different kind of decision — rings, a landing, then both with weather.
export const MISSIONS = [
  {
    id: 1,
    name: 'RING RUN',
    brief:
      'Six survey rings over the home island. Thread every hoop, mind your fuel — the tank is the clock.',
    kind: 'rings',
    rings: 6,
    fuel: 100,
    wind: 0,
    startHeading: 0.6,
  },
  {
    id: 2,
    name: 'ISLAND HOP',
    brief:
      'Take off from Merpati Field, cross the strait and put her down gently on Koral Runway. A hard touchdown bends the airframe.',
    kind: 'land',
    rings: 0,
    fuel: 100,
    wind: 0,
    startHeading: 0.6,
  },
  {
    id: 3,
    name: 'STORM COURIER',
    brief:
      'Four rings in a gusting crosswind, then land on Koral with a light tank. Fly the numbers, not the nerves.',
    kind: 'rings-and-land',
    rings: 4,
    fuel: 90,
    wind: 1,
    startHeading: 0.6,
  },
];
