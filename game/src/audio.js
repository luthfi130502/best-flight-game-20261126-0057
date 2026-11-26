// audio.js — every sound is synthesised with WebAudio: an engine hum that
// follows the throttle, wind that follows the speed, a chime for each ring,
// and an alarm when the ground gets close. No audio files, no network.
export function newAudio() {
  return {
    ctx: null,
    master: null,
    engineOsc: null,
    engineGain: null,
    windSrc: null,
    windGain: null,
    muted: false,
    started: false,
  };
}

// Browsers only let sound start after a user gesture; call this from the
// first click or keypress and everything after it just works.
export function ensureAudio(audio) {
  if (audio.started) {
    if (audio.ctx && audio.ctx.state === 'suspended') audio.ctx.resume();
    return;
  }
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    audio.ctx = ctx;
    audio.master = ctx.createGain();
    audio.master.gain.value = 0.5;
    audio.master.connect(ctx.destination);

    // Engine: two detuned saws through a low-pass, the classic prop drone.
    audio.engineOsc = ctx.createOscillator();
    audio.engineOsc.type = 'sawtooth';
    audio.engineOsc.frequency.value = 70;
    const engineOsc2 = ctx.createOscillator();
    engineOsc2.type = 'sawtooth';
    engineOsc2.frequency.value = 71.5;
    const engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 420;
    audio.engineGain = ctx.createGain();
    audio.engineGain.gain.value = 0.0;
    audio.engineOsc.connect(engineFilter);
    engineOsc2.connect(engineFilter);
    engineFilter.connect(audio.engineGain);
    audio.engineGain.connect(audio.master);
    audio.engineOsc.start();
    engineOsc2.start();
    audio.engineOsc2 = engineOsc2;

    // Wind: looped noise through a band-pass that opens with speed.
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    audio.windSrc = ctx.createBufferSource();
    audio.windSrc.buffer = buf;
    audio.windSrc.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 600;
    windFilter.Q.value = 0.6;
    audio.windGain = ctx.createGain();
    audio.windGain.gain.value = 0.0;
    audio.windSrc.connect(windFilter);
    windFilter.connect(audio.windGain);
    audio.windGain.connect(audio.master);
    audio.windSrc.start();

    audio.started = true;
  } catch (err) {
    // No audio device, no problem: the game stays silent and playable.
    audio.started = false;
  }
}

// Called every frame while flying: the drone and the wind follow the plane.
export function updateAudio(audio, throttle, speed, airborne) {
  if (!audio.started || !audio.ctx) return;
  const t = audio.ctx.currentTime;
  const eng = audio.muted ? 0 : (airborne ? 0.05 + throttle * 0.10 : throttle * 0.06);
  audio.engineGain.gain.setTargetAtTime(eng, t, 0.1);
  audio.engineOsc.frequency.setTargetAtTime(58 + throttle * 62, t, 0.15);
  audio.engineOsc2.frequency.setTargetAtTime(59.5 + throttle * 62, t, 0.15);
  const wind = audio.muted ? 0 : Math.min(0.16, Math.max(0, (speed - 40) / 500));
  audio.windGain.gain.setTargetAtTime(wind, t, 0.2);
}

function blip(audio, freq, dur, type, vol, when) {
  if (!audio.started || !audio.ctx || audio.muted) return;
  const ctx = audio.ctx;
  const osc = ctx.createOscillator();
  osc.type = type || 'sine';
  osc.frequency.value = freq;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, ctx.currentTime + when);
  gain.gain.linearRampToValueAtTime(vol, ctx.currentTime + when + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + when + dur);
  osc.connect(gain);
  gain.connect(audio.master);
  osc.start(ctx.currentTime + when);
  osc.stop(ctx.currentTime + when + dur + 0.05);
}

export function ringChime(audio) {
  blip(audio, 880, 0.5, 'sine', 0.25, 0);
  blip(audio, 1318, 0.6, 'sine', 0.22, 0.09);
}

export function alarmBeep(audio) {
  blip(audio, 660, 0.18, 'square', 0.12, 0);
}

export function touchdownThud(audio) {
  blip(audio, 90, 0.35, 'triangle', 0.4, 0);
}

export function toggleMute(audio) {
  audio.muted = !audio.muted;
  return audio.muted;
}
