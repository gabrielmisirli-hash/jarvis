// Código Morse internacional e linha do tempo para piscar a tela ou tocar som.

const TABLE = Object.freeze({
  A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....', I: '..', J: '.---',
  K: '-.-', L: '.-..', M: '--', N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.', S: '...', T: '-',
  U: '..-', V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..',
  0: '-----', 1: '.----', 2: '..---', 3: '...--', 4: '....-', 5: '.....', 6: '-....', 7: '--...', 8: '---..', 9: '----.',
  '.': '.-.-.-', ',': '--..--', '?': '..--..', '/': '-..-.', '-': '-....-', '(': '-.--.', ')': '-.--.-', '@': '.--.-.',
});

export const SOS = '...---...';

function normalize(text) {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
}

/** Texto para Morse: letras separadas por espaço, palavras por " / ". Caracteres desconhecidos são ignorados. */
export function toMorse(text) {
  const words = normalize(text).trim().split(/\s+/).filter(Boolean);
  return words
    .map((w) => [...w].map((ch) => TABLE[ch]).filter(Boolean).join(' '))
    .filter(Boolean)
    .join(' / ');
}

/**
 * Linha do tempo em unidades: ponto = 1 ligado, traço = 3, entre sinais = 1 desligado,
 * entre letras = 3, entre palavras = 7. O SOS é enviado como um único sinal (sem pausa entre letras).
 */
export function timeline(morse) {
  const steps = [];
  const off = (units) => {
    const last = steps[steps.length - 1];
    if (!last) return;
    if (!last.on) steps[steps.length - 1] = { on: false, units: Math.max(last.units, units) };
    else steps.push({ on: false, units });
  };
  for (const token of morse.split(' ')) {
    if (token === '/') {
      off(7);
      continue;
    }
    [...token].forEach((sym, i) => {
      if (i > 0) off(1);
      steps.push({ on: true, units: sym === '-' ? 3 : 1 });
    });
    off(3);
  }
  return steps;
}

export function timelineMs(morse, unitMs) {
  return timeline(morse).map((s) => ({ on: s.on, ms: s.units * unitMs }));
}
