// main.js — the game loop and the screens' wiring. It owns the canvas,
// the clock, the phase changes (title → brief → fly → done/crash) and the
// keys that are not the stick itself. The flight model lives in aircraft.js,
// the sortie in world.js, the picture in render.js.
import { CFG } from './config.js';
import { heightAt } from './terrain.js';
import { stepAircraft } from './aircraft.js';
import { newWorld, stepWorld, PHASE_TITLE, PHASE_BRIEF, PHASE_FLY, PHASE_DONE, PHASE_CRASH } from './world.js';
import { newInput, attachInput, readControls, wasPressed, endFrame } from './input.js';
import { newAudio, ensureAudio, updateAudio, ringChime, alarmBeep, touchdownThud, toggleMute } from './audio.js';
import { drawFrame } from './render.js';
import { stageShot } from './shots.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');

function fitCanvas() {
  canvas.width = CFG.VIEW_W;
  canvas.height = CFG.VIEW_H;
}
fitCanvas();

const input = newInput();
attachInput(input, canvas);
const audio = newAudio();

let world = newWorld(0);
let lastRingCount = 0;
let lastLandingCount = 0;
let lastTime = performance.now();
let alarmAt = 0;

function startSortie(index) {
  world = newWorld(index);
  world.phase = PHASE_BRIEF;
  lastRingCount = 0;
  lastLandingCount = 0;
  announce(`Sortie ${index + 1}: ${world.mission.name}. Press Enter to take off.`);
}

function announce(text) {
  if (statusEl) statusEl.textContent = text;
}

// Screenshot mode: ?shot=cover|rings|landing|win stages a real flight and
// draws exactly one frame, so the screenshots are renders of the game.
const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
if (shotName) {
  const missionIndex = shotName === 'landing' || shotName === 'win' ? 1 : 0;
  world = newWorld(missionIndex);
  stageShot(shotName, world);
  drawFrame(ctx, world, CFG.VIEW_W, CFG.VIEW_H);
  document.title = `Skyline Courier — shot ${shotName}`;
} else {
  requestAnimationFrame(frame);
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  const ctl = readControls(input);

  // Keys that are not the stick.
  if (wasPressed(input, 'Enter')) {
    ensureAudio(audio);
    if (world.phase === PHASE_BRIEF) {
      world.phase = PHASE_FLY;
      announce('Flying. Thread the rings, watch the fuel.');
    }
  }
  for (const [code, index] of [['Digit1', 0], ['Digit2', 1], ['Digit3', 2]]) {
    if (wasPressed(input, code) && world.phase === PHASE_TITLE) {
      ensureAudio(audio);
      startSortie(index);
    }
  }
  if (wasPressed(input, 'KeyR') && (world.phase === PHASE_DONE || world.phase === PHASE_CRASH)) {
    startSortie(world.missionIndex);
  }
  if (wasPressed(input, 'KeyT') && (world.phase === PHASE_DONE || world.phase === PHASE_CRASH)) {
    world = newWorld(world.missionIndex);
    announce('Skyline Courier. Pick a sortie.');
  }
  if (wasPressed(input, 'KeyP') && world.phase === PHASE_FLY) world.paused = !world.paused;
  if (wasPressed(input, 'KeyM')) {
    ensureAudio(audio);
    const muted = toggleMute(audio);
    announce(muted ? 'Sound off.' : 'Sound on.');
  }
  if (wasPressed(input, 'KeyG') && world.phase === PHASE_FLY) {
    world.aircraft.gearDown = !world.aircraft.gearDown;
    announce(world.aircraft.gearDown ? 'Gear down.' : 'Gear up.');
  }
  if (input.mouse.clicked && world.phase === PHASE_TITLE && world.missionRects) {
    for (const rect of world.missionRects) {
      if (input.mouse.x >= rect.x && input.mouse.x <= rect.x + rect.w &&
          input.mouse.y >= rect.y && input.mouse.y <= rect.y + rect.h) {
        ensureAudio(audio);
        startSortie(rect.index);
        break;
      }
    }
  }
  if (input.mouse.clicked) ensureAudio(audio);

  // Fly, unless paused or on a screen.
  if (world.phase === PHASE_FLY && !world.paused) {
    const ringsBefore = world.stats.ringsPassed;
    const landingsBefore = world.stats.landings;
    stepAircraft(world.aircraft, ctl, dt, heightAt(world.aircraft.x, world.aircraft.z), world.wind);
    stepWorld(world, ctl, dt);
    if (world.stats.ringsPassed > ringsBefore) ringChime(audio);
    if (world.stats.landings > landingsBefore) touchdownThud(audio);
    if (world.phase === PHASE_FLY && !world.aircraft.onGround &&
        world.aircraft.verticalSpeed < -9 && world.aircraft.y < 120 && now - alarmAt > 1200) {
      alarmBeep(audio);
      alarmAt = now;
    }
  }
  updateAudio(audio, world.aircraft.throttle, world.aircraft.speed, !world.aircraft.onGround);
  drawFrame(ctx, world, CFG.VIEW_W, CFG.VIEW_H);
  endFrame(input);
}
