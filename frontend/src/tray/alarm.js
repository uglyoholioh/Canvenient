// Focus-timer alarm, synthesized with WebAudio — no bundled audio assets.
// The pattern repeats until stopAlarm() is called, mirroring Onigiri's
// interaction-to-stop behavior. Patterns: silent, bell, digital, chime,
// kalimba.

let audioContext = null;
let loopTimer = null;

const PATTERNS = {
  silent: [],
  bell: [
    { freq: 880, type: "sine", at: 0, duration: 0.9, gain: 0.5 },
    { freq: 1320, type: "sine", at: 0.05, duration: 0.5, gain: 0.2 },
  ],
  digital: [
    { freq: 660, type: "square", at: 0, duration: 0.12, gain: 0.25 },
    { freq: 990, type: "square", at: 0.16, duration: 0.12, gain: 0.25 },
    { freq: 660, type: "square", at: 0.32, duration: 0.12, gain: 0.25 },
  ],
  chime: [
    { freq: 523.25, type: "sine", at: 0, duration: 0.7, gain: 0.35 },
    { freq: 659.25, type: "sine", at: 0.18, duration: 0.7, gain: 0.3 },
    { freq: 783.99, type: "sine", at: 0.36, duration: 0.9, gain: 0.3 },
  ],
  kalimba: [
    { freq: 392, type: "triangle", at: 0, duration: 0.5, gain: 0.4 },
    { freq: 587.33, type: "triangle", at: 0.22, duration: 0.6, gain: 0.35 },
    { freq: 784, type: "triangle", at: 0.44, duration: 0.7, gain: 0.3 },
  ],
};

const LOOP_GAP_MS = 1400;

function ensureContext() {
  if (!audioContext) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    audioContext = new Ctx();
  }
  if (audioContext.state === "suspended") {
    audioContext.resume().catch(() => {});
  }
  return audioContext;
}

function playPattern(notes) {
  const context = ensureContext();
  if (!context) return;
  const now = context.currentTime;
  for (const note of notes) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = note.type;
    oscillator.frequency.value = note.freq;
    const start = now + note.at;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(note.gain, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + note.duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + note.duration + 0.05);
  }
}

export function playAlarm(sound = "bell") {
  stopAlarm();
  const notes = PATTERNS[sound] ?? PATTERNS.bell;
  if (!notes.length) return;
  playPattern(notes);
  loopTimer = window.setInterval(() => playPattern(notes), LOOP_GAP_MS);
}

export function stopAlarm() {
  if (loopTimer) {
    window.clearInterval(loopTimer);
    loopTimer = null;
  }
}

export const ALARM_SOUNDS = Object.keys(PATTERNS);

export function loadAlarmSound() {
  try {
    return window.localStorage.getItem("canvenient.focus.sound") || "bell";
  } catch {
    return "bell";
  }
}

export function storeAlarmSound(sound) {
  try {
    window.localStorage.setItem("canvenient.focus.sound", sound);
  } catch {
    // ignore
  }
}
