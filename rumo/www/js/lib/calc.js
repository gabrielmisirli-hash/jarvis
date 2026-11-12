// Calculadoras de sobrevivência. Valores de referência: Ministério da Saúde/ANVISA (água sanitária 2,5%:
// 2 gotas por litro, 30 min) e recomendações gerais de defesa civil (≈4 L de água por pessoa/dia).

export const DROP_ML = 0.05;
export const REFERENCE_CONCENTRATION = 2.5;
export const DROPS_PER_LITER_AT_REFERENCE = 2;
export const DEFAULT_WATER_L_PER_PERSON_DAY = 4;
export const DEFAULT_KCAL_PER_PERSON_DAY = 2000;
export const DEFAULT_PHONE_MAH = 3500;
const POWERBANK_EFFICIENCY = 0.65; // perdas de conversão e calor

// Consumo aproximado de bateria (% por hora) num iPhone recente.
export const BATTERY_MODES = Object.freeze({
  mapa: { label: 'Tela ligada com mapa e GPS', pctPerHour: 15 },
  tela: { label: 'Tela ligada, sem GPS', pctPerHour: 10 },
  espera: { label: 'Tela apagada, rede ligada', pctPerHour: 2.5 },
  aviao: { label: 'Modo avião, tela apagada', pctPerHour: 1 },
});

function requirePositive(value, name) {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} precisa ser maior que zero`);
}

const round1 = (n) => Math.round(n * 10) / 10;

/** Gotas de água sanitária (hipoclorito) para desinfetar água clara. Água turva: filtre antes; se não der, dose dobrada. */
export function bleachDose({ liters, concentrationPct = REFERENCE_CONCENTRATION, cloudy = false }) {
  requirePositive(liters, 'Litros');
  if (!(concentrationPct >= 0.5 && concentrationPct <= 15)) throw new Error('Concentração entre 0,5% e 15%');
  const perLiter = DROPS_PER_LITER_AT_REFERENCE * (REFERENCE_CONCENTRATION / concentrationPct) * (cloudy ? 2 : 1);
  const drops = Math.ceil(liters * perLiter);
  return { drops, ml: round1(drops * DROP_ML), waitMinutes: 30 };
}

export function waterDays({ liters, people, perPersonDay = DEFAULT_WATER_L_PER_PERSON_DAY }) {
  requirePositive(people, 'Pessoas');
  requirePositive(perPersonDay, 'Litros por pessoa');
  if (!(liters >= 0)) throw new Error('Estoque de água inválido');
  return round1(liters / (people * perPersonDay));
}

export function foodDays({ kcal, people, perPersonDay = DEFAULT_KCAL_PER_PERSON_DAY }) {
  requirePositive(people, 'Pessoas');
  requirePositive(perPersonDay, 'Calorias por pessoa');
  if (!(kcal >= 0)) throw new Error('Estoque de comida inválido');
  return round1(kcal / (people * perPersonDay));
}

export function batteryHours({ percent, mode }) {
  const m = BATTERY_MODES[mode];
  if (!m) throw new Error('Modo de uso desconhecido');
  if (!(percent >= 0 && percent <= 100)) throw new Error('Bateria entre 0 e 100%');
  return round1(percent / m.pctPerHour);
}

export function powerbankCharges({ powerbankMah, phoneMah = DEFAULT_PHONE_MAH }) {
  requirePositive(powerbankMah, 'Capacidade do power bank');
  requirePositive(phoneMah, 'Bateria do celular');
  return round1((powerbankMah * POWERBANK_EFFICIENCY) / phoneMah);
}
