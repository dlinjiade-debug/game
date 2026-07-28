let audioCtx = null;
let masterGain = null;
let initialized = false;

function ensureContext() {
  if (initialized) return;
  initialized = true;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.25;
    masterGain.connect(audioCtx.destination);
  } catch {
    audioCtx = null;
  }
}

function resumeContext() {
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

function playTone(freq, duration, type = 'sine', volume = 0.3) {
  ensureContext();
  if (!audioCtx) return;
  resumeContext();
  const t = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
  osc.connect(gain);
  gain.connect(masterGain);
  osc.start(t);
  osc.stop(t + duration);
}

function playNoise(duration, volume = 0.15) {
  ensureContext();
  if (!audioCtx) return;
  resumeContext();
  const t = audioCtx.currentTime;
  const bufferSize = Math.floor(audioCtx.sampleRate * duration);
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  }
  const source = audioCtx.createBufferSource();
  source.buffer = buffer;
  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(2000, t);
  filter.frequency.exponentialRampToValueAtTime(200, t + duration);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(masterGain);
  source.start(t);
}

export function playEat() {
  ensureContext();
  if (!audioCtx) return;
  resumeContext();
  const t = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(220, t);
  osc.frequency.exponentialRampToValueAtTime(520, t + 0.06);
  gain.gain.setValueAtTime(0.18, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
  osc.connect(gain);
  gain.connect(masterGain);
  osc.start(t);
  osc.stop(t + 0.1);
}

export function playSplit() {
  ensureContext();
  if (!audioCtx) return;
  resumeContext();
  const t = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(360, t);
  osc.frequency.exponentialRampToValueAtTime(140, t + 0.12);
  gain.gain.setValueAtTime(0.22, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
  osc.connect(gain);
  gain.connect(masterGain);
  osc.start(t);
  osc.stop(t + 0.15);
}

export function playEject() {
  playTone(180, 0.1, 'sine', 0.12);
}

export function playVirusPop() {
  playNoise(0.3, 0.2);
  playTone(90, 0.25, 'sine', 0.15);
}

export function playDeath() {
  ensureContext();
  if (!audioCtx) return;
  resumeContext();
  const t = audioCtx.currentTime;
  const freqs = [440, 330, 220];
  freqs.forEach((freq, i) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, t + i * 0.1);
    gain.gain.setValueAtTime(0.12, t + i * 0.1);
    gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.1 + 0.25);
    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(t + i * 0.1);
    osc.stop(t + i * 0.1 + 0.25);
  });
}

export function playKill() {
  ensureContext();
  if (!audioCtx) return;
  resumeContext();
  const t = audioCtx.currentTime;
  const freqs = [330, 440, 550];
  freqs.forEach((freq, i) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t + i * 0.06);
    gain.gain.setValueAtTime(0.15, t + i * 0.06);
    gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.06 + 0.2);
    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(t + i * 0.06);
    osc.stop(t + i * 0.06 + 0.2);
  });
}

export function playZoneWarn() {
  playTone(80, 0.4, 'sine', 0.08);
}

export function initAudio() {
  ensureContext();
}
