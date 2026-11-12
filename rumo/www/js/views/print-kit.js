// Kit em papel: versão para imprimir (ou texto) do plano familiar, encontros, ficha médica e números úteis.

import { h, clear, mount } from '../ui.js';
import { getState } from '../state.js';
import { formatDecimal, toDMS } from '../lib/geo.js';

const NUMBERS = [['193', 'Bombeiros'], ['192', 'SAMU'], ['190', 'Polícia Militar'], ['199', 'Defesa Civil'], ['0800 722 6001', 'Disque-Intoxicação'], ['40199', 'SMS com CEP: alertas da Defesa Civil']];
const coords = (p) => (Number.isFinite(p.lat) ? `${formatDecimal(p.lat, p.lon)} (${toDMS(p.lat, true)} ${toDMS(p.lon, false)})` : '');
const table = (head, rows) => h('table', {}, h('tr', {}, head.map((t) => h('th', { text: t }))), rows.map((r) => h('tr', {}, r.map((c) => h('td', { text: c })))));

export function renderPrintKit() {
  const { plan, medical, waypoints } = getState();
  const root = clear(document.getElementById('print-kit'));
  mount(root,
    h('h1', { text: 'Plano de emergência da família' }),
    h('p', { text: `Atualizado em ${new Date().toLocaleDateString('pt-BR')}. Guarde com a mochila e na carteira.` }),
    h('h2', { text: 'Contatos' }),
    table(['Nome', 'Telefone', 'Relação', 'Observação'], plan.contacts.map((c) => [c.name, c.phone, c.relation, [c.outOfTown ? 'fora da cidade' : '', c.sos ? 'recebe SOS' : ''].filter(Boolean).join(', ')])),
    h('h2', { text: 'Pontos de encontro' }),
    table(['#', 'Local', 'Descrição', 'Coordenadas'], plan.meetingPoints.map((m, i) => [String(i + 1), m.name, m.description, coords(m)])),
    plan.notes ? [h('h2', { text: 'Combinados' }), h('p', { text: plan.notes })] : null,
    h('h2', { text: 'Ficha médica' }),
    table(['Nome', 'Nasc.', 'Sangue', 'Alergias', 'Condições', 'Remédios'], medical.people.map((p) => [p.name, p.birth, p.blood, p.allergies, p.conditions, p.meds])),
    waypoints.length ? [h('h2', { text: 'Pontos marcados no mapa' }), table(['Nome', 'Tipo', 'Coordenadas'], waypoints.map((w) => [w.name, w.type, coords(w)]))] : null,
    h('h2', { text: 'Números úteis' }),
    table(['Número', 'Serviço'], NUMBERS),
    h('h2', { text: 'Lembretes' }),
    h('ul', {},
      ['SMS passa quando a ligação não completa.', '3 apitos, 3 luzes ou 3 fogueiras = socorro.', 'No chão para aeronaves: V = preciso de ajuda, X = preciso de médico.', 'Água: ferver 1 minuto ou 2 gotas de água sanitária por litro e esperar 30 minutos.', 'Fumaça: abaixe-se. Água corrente: não atravesse.'].map((t) => h('li', { text: t }))),
  );
}

export function kitAsText() {
  const { plan, medical } = getState();
  const lines = ['PLANO DE EMERGÊNCIA DA FAMÍLIA', '', 'CONTATOS'];
  plan.contacts.forEach((c) => lines.push(`- ${c.name}: ${c.phone}${c.relation ? ` (${c.relation})` : ''}`));
  lines.push('', 'PONTOS DE ENCONTRO');
  plan.meetingPoints.forEach((m, i) => lines.push(`${i + 1}. ${m.name}${m.description ? ` — ${m.description}` : ''}${coords(m) ? ` — ${coords(m)}` : ''}`));
  if (plan.notes) lines.push('', 'COMBINADOS', plan.notes);
  lines.push('', 'FICHA MÉDICA');
  medical.people.forEach((p) => lines.push(`- ${p.name}: sangue ${p.blood || '?'}; alergias: ${p.allergies || 'nenhuma informada'}; remédios: ${p.meds || '—'}`));
  lines.push('', 'NÚMEROS: 193 Bombeiros · 192 SAMU · 190 Polícia · 199 Defesa Civil');
  return lines.join('\n');
}
