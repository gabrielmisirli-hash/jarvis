// Calculadoras interativas usadas nos guias e no Preparo.

import { h, errorMessage } from '../ui.js';
import { bleachDose, waterDays, foodDays, batteryHours, powerbankCharges, BATTERY_MODES } from '../lib/calc.js';

function numberInput(value, attrs = {}) {
  return h('input', { type: 'number', inputmode: 'decimal', value: String(value), min: 0, ...attrs });
}

function calcCard(title, inputs, compute) {
  const out = h('div', { class: 'big-number', style: 'font-size:1.5rem' });
  const note = h('div', { class: 'small muted' });
  const run = () => {
    try {
      const [main, detail] = compute();
      out.textContent = main;
      note.textContent = detail || '';
    } catch (err) {
      out.textContent = '—';
      note.textContent = errorMessage(err);
    }
  };
  inputs.forEach(([, el]) => {
    el.addEventListener('input', run);
    el.addEventListener('change', run);
  });
  run();
  return h('div', { class: 'card' },
    h('h3', { text: title }),
    h('div', { class: 'grid-2' }, inputs.map(([label, el]) => h('label', { class: 'field' }, h('span', { text: label }), el))),
    h('div', { style: 'margin-top:10px' }, out, note),
  );
}

const n = (el) => Number(String(el.value).replace(',', '.'));

function bleachCalc() {
  const liters = numberInput(20);
  const conc = numberInput(2.5, { step: 0.1 });
  const cloudy = h('select', {}, h('option', { value: 'no', text: 'Clara' }), h('option', { value: 'yes', text: 'Turva' }));
  return calcCard('Calculadora de água sanitária', [['Litros de água', liters], ['Concentração (%)', conc], ['Água', cloudy]], () => {
    const r = bleachDose({ liters: n(liters), concentrationPct: n(conc), cloudy: cloudy.value === 'yes' });
    return [`${r.drops} gotas`, `≈ ${String(r.ml).replace('.', ',')} mL. Misture e espere ${r.waitMinutes} minutos antes de beber.`];
  });
}

function waterDaysCalc() {
  const liters = numberInput(40);
  const people = numberInput(2, { step: 1 });
  const per = numberInput(4, { step: 0.5 });
  return calcCard('Minha água dura quanto?', [['Litros guardados', liters], ['Pessoas', people], ['Litros/pessoa/dia', per]], () => {
    const d = waterDays({ liters: n(liters), people: n(people), perPersonDay: n(per) });
    return [`${String(d).replace('.', ',')} dias`, d < 3 ? 'Abaixo do mínimo de 3 dias recomendado.' : 'Mínimo de 3 dias atingido.'];
  });
}

function foodDaysCalc() {
  const kcal = numberInput(40000, { step: 1000 });
  const people = numberInput(2, { step: 1 });
  const per = numberInput(2000, { step: 100 });
  return calcCard('Minha comida dura quanto?', [['Calorias no estoque', kcal], ['Pessoas', people], ['Calorias/pessoa/dia', per]], () => {
    const d = foodDays({ kcal: n(kcal), people: n(people), perPersonDay: n(per) });
    return [`${String(d).replace('.', ',')} dias`, 'Veja as calorias na embalagem (valor por porção × porções). Racionando: 1.200 a 1.500 por dia por pouco tempo.'];
  });
}

function batteryCalc() {
  const pct = numberInput(40, { max: 100, step: 1 });
  const mode = h('select', {}, Object.entries(BATTERY_MODES).map(([k, v]) => h('option', { value: k, text: v.label })));
  const bank = numberInput(10000, { step: 1000 });
  return calcCard('Quanto a bateria aguenta?', [['Bateria agora (%)', pct], ['Uso', mode], ['Power bank (mAh)', bank]], () => {
    const hours = batteryHours({ percent: n(pct), mode: mode.value });
    const charges = n(bank) > 0 ? powerbankCharges({ powerbankMah: n(bank) }) : 0;
    return [`≈ ${String(hours).replace('.', ',')} horas`, charges ? `O power bank dá ≈ ${String(charges).replace('.', ',')} cargas completas. Estimativa grosseira: varia com o modelo e o sinal.` : 'Estimativa grosseira: varia com o modelo e o sinal.'];
  });
}

const CALCS = { bleach: bleachCalc, waterDays: waterDaysCalc, foodDays: foodDaysCalc, battery: batteryCalc };

export function renderCalc(id) {
  const factory = CALCS[id];
  return factory ? factory() : null;
}

export const CALC_IDS = Object.keys(CALCS);
