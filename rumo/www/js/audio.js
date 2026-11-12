// Sons de emergência: apito (3 toques longos, padrão internacional de socorro) e Morse sonoro.

import { timelineMs } from './lib/morse.js';

const WHISTLE_HZ = 3150; // faixa em que o ouvido humano é mais sensível
const MORSE_HZ = 750;
const BLAST_S = 1;
const GAP_S = 0.4;
const CYCLE_PAUSE_S = 2;

let ctx = null;
let gain = null;
let osc = null;
let loopTimer = null;
let currentKind = null;
const listeners = new Set();

const notify = () => listeners.forEach((fn) => fn(currentKind));

/** Avisa quando o som muda (null = parado, 'apito', 'morse'). */
export function onSoundChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

async function ensureContext(freq, kind) {
  try {
    if (navigator.audioSession) navigator.audioSession.type = 'playback'; // toca mesmo no modo silencioso (iOS 16.4+)
  } catch {
    // sem suporte: segue com o comportamento padrão
  }
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  // Depois de ligação, bloqueio ou Siri o iOS deixa o áudio "interrupted": precisa retomar.
  if (ctx.state !== 'running') await ctx.resume();
  stopSound();
  gain = ctx.createGain();
  gain.gain.value = 0;
  osc = ctx.createOscillator();
  osc.type = 'square';
  osc.frequency.value = freq;
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  currentKind = kind;
  notify();
}

function scheduleWhistleCycle() {
  if (!gain) return;
  const t0 = ctx.currentTime + 0.05;
  for (let i = 0; i < 3; i++) {
    const start = t0 + i * (BLAST_S + GAP_S);
    gain.gain.setValueAtTime(0.9, start);
    gain.gain.setValueAtTime(0, start + BLAST_S);
  }
}

export async function startWhistle() {
  await ensureContext(WHISTLE_HZ, 'apito');
  scheduleWhistleCycle();
  const cycleMs = (3 * (BLAST_S + GAP_S) + CYCLE_PAUSE_S) * 1000;
  loopTimer = setInterval(scheduleWhistleCycle, cycleMs);
}

export async function playMorse(morse, unitMs = 120) {
  await ensureContext(MORSE_HZ, 'morse');
  let t = ctx.currentTime + 0.05;
  for (const step of timelineMs(morse, unitMs)) {
    gain.gain.setValueAtTime(step.on ? 0.6 : 0, t);
    t += step.ms / 1000;
  }
  gain.gain.setValueAtTime(0, t);
  loopTimer = setTimeout(stopSound, (t - ctx.currentTime) * 1000 + 100);
}

export function isPlaying() {
  return Boolean(osc);
}

export function stopSound() {
  clearInterval(loopTimer);
  clearTimeout(loopTimer);
  loopTimer = null;
  if (osc) {
    try {
      osc.stop();
    } catch {
      // já parado
    }
    osc.disconnect();
  }
  osc = null;
  gain = null;
  if (currentKind !== null) {
    currentKind = null;
    notify();
  }
}
