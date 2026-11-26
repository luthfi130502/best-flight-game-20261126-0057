// input.js — keyboard and mouse, nothing else. The game reads a plain
// control object each frame, so the autopilot in shots.js can drive the
// same controls a player would.
export function newInput() {
  return {
    keys: new Set(),
    pitch: 0, // -1 (nose down) .. 1 (nose up)
    roll: 0, // -1 (left) .. 1 (right)
    throttle: 0, // -1 (close) .. 1 (open)
    brake: false,
    pressed: new Set(), // keys pressed since last frame, edge-triggered
    mouse: { x: 0, y: 0, clicked: false },
  };
}

const KEYMAP = {
  ArrowUp: 'pitchUp',
  KeyW: 'pitchUp',
  ArrowDown: 'pitchDown',
  KeyS: 'pitchDown',
  ArrowLeft: 'rollLeft',
  KeyA: 'rollLeft',
  ArrowRight: 'rollRight',
  KeyD: 'rollRight',
  ShiftLeft: 'throttleUp',
  ShiftRight: 'throttleUp',
  ControlLeft: 'throttleDown',
  ControlRight: 'throttleDown',
  KeyB: 'brake',
};

export function attachInput(input, canvas) {
  window.addEventListener('keydown', (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    if (!e.repeat) input.pressed.add(e.code);
    input.keys.add(e.code);
  });
  window.addEventListener('keyup', (e) => input.keys.delete(e.code));
  window.addEventListener('blur', () => input.keys.clear());
  canvas.addEventListener('mousemove', (e) => {
    const r = canvas.getBoundingClientRect();
    input.mouse.x = e.clientX - r.left;
    input.mouse.y = e.clientY - r.top;
  });
  canvas.addEventListener('mousedown', (e) => {
    const r = canvas.getBoundingClientRect();
    input.mouse.x = e.clientX - r.left;
    input.mouse.y = e.clientY - r.top;
    input.mouse.clicked = true;
  });
}

// Turn the held keys into the control object the flight model consumes.
export function readControls(input) {
  const k = input.keys;
  const has = (name) => {
    for (const code of Object.keys(KEYMAP)) if (KEYMAP[code] === name && k.has(code)) return true;
    return false;
  };
  input.pitch = (has('pitchUp') ? 1 : 0) - (has('pitchDown') ? 1 : 0);
  input.roll = (has('rollRight') ? 1 : 0) - (has('rollLeft') ? 1 : 0);
  input.throttle = (has('throttleUp') ? 1 : 0) - (has('throttleDown') ? 1 : 0);
  input.brake = has('brake');
  return { pitch: input.pitch, roll: input.roll, throttle: input.throttle, brake: input.brake };
}

// Edge-triggered keys: true once per physical press, then consumed.
export function wasPressed(input, code) {
  if (input.pressed.has(code)) {
    input.pressed.delete(code);
    return true;
  }
  return false;
}

export function endFrame(input) {
  input.pressed.clear();
  input.mouse.clicked = false;
}
