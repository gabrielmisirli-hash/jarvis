// Serviço de GPS: o GPS do iPhone funciona sem sinal de celular e em modo avião.
// Detecta saltos impossíveis (bloqueio/falsificação de GPS) e avisa sem esconder a leitura.

import { isFixSuspicious, distanceMeters } from './lib/geo.js';

const WATCH_OPTIONS = { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 };
const ONCE_OPTIONS = { enableHighAccuracy: true, maximumAge: 10000, timeout: 25000 };

let watchId = null;
let lastFix = null;
let lowPower = false;
const listeners = new Set();
const jumpListeners = new Set();

function toFix(pos) {
  const c = pos.coords;
  return {
    lat: c.latitude,
    lon: c.longitude,
    accuracy: c.accuracy,
    altitude: c.altitude,
    altitudeAccuracy: c.altitudeAccuracy,
    speed: c.speed,
    time: pos.timestamp || Date.now(),
  };
}

function describeError(err) {
  if (!err) return 'GPS indisponível';
  if (err.code === 1) return 'Permissão de localização negada. Ative em Ajustes › Privacidade › Serviços de Localização.';
  if (err.code === 2) return 'Sem sinal de GPS. Vá para um lugar aberto, longe de prédios.';
  if (err.code === 3) return 'GPS demorou demais. Tente de novo em local aberto.';
  return err.message || 'Erro no GPS';
}

function handle(pos) {
  const fix = toFix(pos);
  if (isFixSuspicious(lastFix, fix)) {
    const km = distanceMeters(lastFix, fix) / 1000;
    jumpListeners.forEach((fn) => fn({ km, from: lastFix, to: fix }));
  }
  lastFix = fix;
  listeners.forEach((l) => l.onFix(fix));
}

function handleError(err) {
  const message = describeError(err);
  listeners.forEach((l) => l.onError?.(message));
}

function start() {
  if (watchId !== null || lowPower || !('geolocation' in navigator)) return;
  watchId = navigator.geolocation.watchPosition(handle, handleError, WATCH_OPTIONS);
}

function stop() {
  if (watchId === null) return;
  navigator.geolocation.clearWatch(watchId);
  watchId = null;
}

/** Acompanha a posição continuamente. Retorna função para parar. */
export function watchPosition(onFix, onError) {
  const listener = { onFix, onError };
  listeners.add(listener);
  if (lastFix) onFix(lastFix);
  if (!('geolocation' in navigator)) onError?.('Este aparelho não tem GPS disponível para o app');
  start();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) stop();
  };
}

/** Uma leitura só (usada no modo bateria crítica e no SOS). */
export function getPosition() {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('Este aparelho não tem GPS disponível para o app'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        handle(pos);
        resolve(lastFix);
      },
      (err) => reject(new Error(describeError(err))),
      ONCE_OPTIONS,
    );
  });
}

export const getLastFix = () => lastFix;

export function onJump(fn) {
  jumpListeners.add(fn);
  return () => jumpListeners.delete(fn);
}

/** No modo bateria crítica o GPS só liga quando o usuário pede. */
export function setLowPower(on) {
  lowPower = on;
  if (on) stop();
  else if (listeners.size > 0) start();
}
