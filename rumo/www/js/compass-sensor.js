// Bússola pelo sensor de orientação. No iPhone a leitura vem de webkitCompassHeading
// (referência magnética); a correção de declinação é aplicada por quem consome.

import { normalizeDeg } from './lib/geo.js';

const SMOOTHING = 0.25;
let started = false;
let sinAvg = null;
let cosAvg = null;
const listeners = new Set();

function emit(raw, accuracy) {
  const rad = (raw * Math.PI) / 180;
  if (sinAvg === null) {
    sinAvg = Math.sin(rad);
    cosAvg = Math.cos(rad);
  } else {
    sinAvg += SMOOTHING * (Math.sin(rad) - sinAvg);
    cosAvg += SMOOTHING * (Math.cos(rad) - cosAvg);
  }
  const heading = normalizeDeg((Math.atan2(sinAvg, cosAvg) * 180) / Math.PI);
  listeners.forEach((fn) => fn({ heading, raw, accuracy }));
}

function onOrientation(e) {
  if (typeof e.webkitCompassHeading === 'number') emit(e.webkitCompassHeading, e.webkitCompassAccuracy ?? null);
}

function onAbsolute(e) {
  if (typeof e.alpha === 'number') emit(normalizeDeg(360 - e.alpha), null);
}

export function needsPermission() {
  return typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function';
}

export function isSupported() {
  return typeof DeviceOrientationEvent !== 'undefined';
}

/** Precisa ser chamado a partir de um toque do usuário no iPhone. */
export async function startCompass() {
  if (!isSupported()) throw new Error('Este aparelho não tem bússola disponível para o app');
  if (needsPermission()) {
    const result = await DeviceOrientationEvent.requestPermission();
    if (result !== 'granted') throw new Error('Permissão negada. Feche e abra o app e toque em "Ativar bússola" de novo.');
  }
  if (!started) {
    window.addEventListener('deviceorientation', onOrientation, true);
    window.addEventListener('deviceorientationabsolute', onAbsolute, true);
    started = true;
  }
}

export const isStarted = () => started;

export function subscribeHeading(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
