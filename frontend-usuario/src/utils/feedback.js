/**
 * BIAFYT — SONIDO Y VIBRACIÓN (puntos 72, 73)
 * ---------------------------------------------------------------
 * Sonido y vibración son independientes: se puede desactivar uno sin
 * el otro. Las preferencias viven en el estado persistido.
 * El sonido se sintetiza con WebAudio (sin archivos externos).
 */

let ctx = null;

function audioContext() {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

const tones = {
  tick: [{ f: 660, d: 0.06, v: 0.12 }],
  restEnd: [
    { f: 660, d: 0.12, v: 0.2 },
    { f: 880, d: 0.12, v: 0.2, delay: 0.14 },
    { f: 1180, d: 0.22, v: 0.22, delay: 0.28 },
  ],
  start: [
    { f: 440, d: 0.1, v: 0.18 },
    { f: 880, d: 0.18, v: 0.2, delay: 0.12 },
  ],
  success: [
    { f: 880, d: 0.1, v: 0.2 },
    { f: 1320, d: 0.24, v: 0.22, delay: 0.12 },
  ],
  alert: [
    { f: 300, d: 0.16, v: 0.2 },
    { f: 220, d: 0.24, v: 0.2, delay: 0.18 },
  ],
  duel: [
    { f: 520, d: 0.1, v: 0.2 },
    { f: 700, d: 0.1, v: 0.2, delay: 0.12 },
    { f: 520, d: 0.18, v: 0.2, delay: 0.24 },
  ],
};

const patterns = {
  tick: [20],
  restEnd: [120, 60, 120, 60, 240],
  start: [60, 40, 60],
  success: [80, 50, 160],
  alert: [200, 80, 200],
  duel: [60, 40, 60, 40, 200],
};

/**
 * Dispara la retroalimentación de un evento respetando la configuración.
 * @param {string} event  clave de tones/patterns
 * @param {{sound:boolean, vibration:boolean}} settings
 */
export function feedback(event, settings = { sound: true, vibration: true }) {
  if (settings.sound) playTone(event);
  if (settings.vibration) vibrate(event);
}

export function playTone(event) {
  const spec = tones[event];
  const ac = audioContext();
  if (!spec || !ac) return;
  const now = ac.currentTime;
  spec.forEach(({ f, d, v, delay = 0 }) => {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = "sine";
    osc.frequency.value = f;
    gain.gain.setValueAtTime(0.0001, now + delay);
    gain.gain.exponentialRampToValueAtTime(v, now + delay + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + d);
    osc.connect(gain).connect(ac.destination);
    osc.start(now + delay);
    osc.stop(now + delay + d + 0.02);
  });
}

export function vibrate(event) {
  if (typeof navigator === "undefined" || !navigator.vibrate) return;
  navigator.vibrate(patterns[event] ?? 100);
}
