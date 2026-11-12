// Plano familiar (contatos e pontos de encontro) e ficha médica.

import { h, clear, mount, toast, confirmSheet, sheet, field, backLink } from '../ui.js';
import { getState, update, newId } from '../state.js';
import { getPosition } from '../location.js';
import { formatDecimal } from '../lib/geo.js';
import { telHref } from '../lib/messages.js';

const BLOOD_TYPES = ['', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

function contactForm(contact, onDone) {
  const c = contact || { id: newId(), name: '', phone: '', relation: '', outOfTown: false, sos: true };
  const name = h('input', { type: 'text', value: c.name, maxlength: 80, autocomplete: 'name' });
  const phone = h('input', { type: 'tel', value: c.phone, maxlength: 40, placeholder: '(21) 99999-0000', autocomplete: 'tel' });
  const relation = h('input', { type: 'text', value: c.relation, maxlength: 60, placeholder: 'Mãe, vizinho, amigo…' });
  const sos = h('input', { type: 'checkbox', checked: c.sos });
  const out = h('input', { type: 'checkbox', checked: c.outOfTown });
  const ref = sheet(contact ? 'Editar contato' : 'Novo contato', h('div', { class: 'stack' },
    field('Nome', name), field('Telefone', phone), field('Relação', relation),
    h('label', { class: 'check' }, sos, h('span', { text: 'Recebe meu SMS de socorro' })),
    h('label', { class: 'check' }, out, h('span', { text: 'Mora fora da cidade (contato de referência)' })),
    h('button', { class: 'btn btn-primary btn-block', type: 'button', text: 'Salvar', on: { click: async () => {
      if (!name.value.trim() || !phone.value.trim()) return toast('Preencha nome e telefone', 'error');
      const next = { ...c, name: name.value.trim(), phone: phone.value.trim(), relation: relation.value.trim(), sos: sos.checked, outOfTown: out.checked };
      await update('plan', (p) => ({ ...p, contacts: contact ? p.contacts.map((x) => (x.id === c.id ? next : x)) : [...p.contacts, next] }));
      ref.close();
      onDone();
    } } }),
    contact ? h('button', { class: 'btn btn-block btn-ghost', type: 'button', text: 'Excluir contato', on: { click: async () => {
      if (!(await confirmSheet('Excluir contato?', c.name, 'Excluir', true))) return;
      await update('plan', (p) => ({ ...p, contacts: p.contacts.filter((x) => x.id !== c.id) }));
      ref.close();
      onDone();
    } } }) : null,
  ));
}

function meetingForm(meeting, onDone) {
  const m = meeting || { id: newId(), name: '', description: '' };
  let pos = Number.isFinite(m.lat) ? { lat: m.lat, lon: m.lon } : null;
  const name = h('input', { type: 'text', value: m.name, maxlength: 80, placeholder: 'Ex.: Praça da igreja' });
  const desc = h('textarea', { value: m.description, maxlength: 500, placeholder: 'Como chegar, referência, horário combinado…' });
  const posText = h('div', { class: 'small muted' });
  const waypointSelect = h('select', {}, h('option', { value: '', text: 'Escolher ponto salvo no mapa…' }), getState().waypoints.map((w) => h('option', { value: w.id, text: w.name })));
  const renderPos = () => { posText.textContent = pos ? `Coordenadas: ${formatDecimal(pos.lat, pos.lon)}` : 'Sem coordenadas (opcional, mas ajuda a seguir com a bússola).'; };
  waypointSelect.addEventListener('change', () => {
    const w = getState().waypoints.find((x) => x.id === waypointSelect.value);
    if (w) {
      pos = { lat: w.lat, lon: w.lon };
      if (!name.value.trim()) name.value = w.name;
      renderPos();
    }
  });
  renderPos();
  const ref = sheet(meeting ? 'Editar ponto de encontro' : 'Novo ponto de encontro', h('div', { class: 'stack' },
    field('Nome', name), field('Descrição', desc), posText, waypointSelect,
    h('button', { class: 'btn btn-block', type: 'button', text: '📡 Usar minha posição atual', on: { click: async () => {
      try {
        const f = await getPosition();
        pos = { lat: f.lat, lon: f.lon };
        renderPos();
      } catch (err) {
        toast(err.message, 'error', 5000);
      }
    } } }),
    h('button', { class: 'btn btn-primary btn-block', type: 'button', text: 'Salvar', on: { click: async () => {
      if (!name.value.trim()) return toast('Dê um nome ao ponto', 'error');
      const next = { id: m.id, name: name.value.trim(), description: desc.value.trim(), ...(pos || {}) };
      await update('plan', (p) => ({ ...p, meetingPoints: meeting ? p.meetingPoints.map((x) => (x.id === m.id ? next : x)) : [...p.meetingPoints, next] }));
      ref.close();
      onDone();
    } } }),
    meeting ? h('button', { class: 'btn btn-block btn-ghost', type: 'button', text: 'Excluir ponto', on: { click: async () => {
      if (!(await confirmSheet('Excluir ponto de encontro?', m.name, 'Excluir', true))) return;
      await update('plan', (p) => ({ ...p, meetingPoints: p.meetingPoints.filter((x) => x.id !== m.id) }));
      ref.close();
      onDone();
    } } }) : null,
  ));
}

export function renderPlan(root) {
  const rerender = () => {
    clear(root);
    renderPlan(root);
  };
  const { contacts, meetingPoints, notes } = getState().plan;
  const notesArea = h('textarea', { value: notes, maxlength: 5000, placeholder: 'Quem busca as crianças na escola? Onde fica a chave reserva? Horários para ligar o celular (ex.: 12h e 18h)…' });
  notesArea.addEventListener('change', () => update('plan', (p) => ({ ...p, notes: notesArea.value })));
  root.append(
    backLink('#preparo'),
    h('h1', { text: 'Plano familiar' }),
    h('p', { class: 'muted', text: 'Combine antes: em crise, cada um sabe para onde ir e quem avisar, mesmo sem celular.' }),
    h('div', { class: 'section-title', text: `Contatos (${contacts.length})` }),
    h('div', { class: 'card' },
      contacts.length ? contacts.map((c) => h('div', { class: 'list-item' },
        h('span', { class: 'emoji', text: c.outOfTown ? '🛫' : '👤' }),
        h('button', { class: 'grow', type: 'button', style: 'background:none;border:0;text-align:left;padding:0;cursor:pointer', on: { click: () => contactForm(c, rerender) } },
          h('div', { text: c.name }), h('div', { class: 'meta', text: [c.relation, c.phone, c.sos ? 'recebe SOS' : null].filter(Boolean).join(' · ') })),
        h('a', { class: 'btn btn-sm', href: telHref(c.phone), 'aria-label': `Ligar para ${c.name}`, text: '📞' }),
      )) : h('p', { class: 'muted', text: 'Nenhum contato. Cadastre pelo menos 2, um deles fora da cidade.' }),
      h('button', { class: 'btn btn-block', type: 'button', text: '＋ Adicionar contato', on: { click: () => contactForm(null, rerender) } }),
    ),
    h('div', { class: 'section-title', text: `Pontos de encontro (${meetingPoints.length})` }),
    h('div', { class: 'card' },
      meetingPoints.length ? meetingPoints.map((m, i) => h('button', { class: 'list-item chev', type: 'button', on: { click: () => meetingForm(m, rerender) } },
        h('span', { class: 'emoji', text: ['1️⃣', '2️⃣', '3️⃣'][i] || '📍' }),
        h('span', { class: 'grow' }, h('div', { text: m.name }), h('div', { class: 'meta', text: m.description || (Number.isFinite(m.lat) ? formatDecimal(m.lat, m.lon) : '') })),
      )) : h('p', { class: 'muted', text: 'Defina 1) perto de casa, 2) fora do bairro, 3) fora da cidade.' }),
      h('button', { class: 'btn btn-block', type: 'button', text: '＋ Adicionar ponto de encontro', on: { click: () => meetingForm(null, rerender) } }),
    ),
    h('div', { class: 'section-title', text: 'Combinados' }),
    notesArea,
    h('p', { class: 'small muted', text: 'Salvo automaticamente ao sair do campo.' }),
  );
}

function personForm(person, onDone) {
  const p = person || { id: newId(), name: '', birth: '', blood: '', allergies: '', conditions: '', meds: '', notes: '' };
  const name = h('input', { type: 'text', value: p.name, maxlength: 80 });
  const birth = h('input', { type: 'date', value: p.birth });
  const blood = h('select', {}, BLOOD_TYPES.map((t) => h('option', { value: t, text: t || 'Não sei', selected: t === p.blood ? true : null })));
  const allergies = h('textarea', { value: p.allergies, maxlength: 2000, placeholder: 'Remédios, alimentos, picadas…' });
  const conditions = h('textarea', { value: p.conditions, maxlength: 2000, placeholder: 'Diabetes, hipertensão, asma, marca-passo, gestação…' });
  const meds = h('textarea', { value: p.meds, maxlength: 2000, placeholder: 'Nome, dose e horário' });
  const notes = h('textarea', { value: p.notes, maxlength: 2000, placeholder: 'Médico, plano de saúde, cartão SUS…' });
  const ref = sheet(person ? 'Editar ficha' : 'Nova ficha', h('div', { class: 'stack' },
    field('Nome', name), h('div', { class: 'grid-2' }, field('Nascimento', birth), field('Tipo sanguíneo', blood)),
    field('Alergias', allergies), field('Condições de saúde', conditions), field('Remédios de uso contínuo', meds), field('Outras informações', notes),
    h('button', { class: 'btn btn-primary btn-block', type: 'button', text: 'Salvar', on: { click: async () => {
      if (!name.value.trim()) return toast('Preencha o nome', 'error');
      const next = { ...p, name: name.value.trim(), birth: birth.value, blood: blood.value, allergies: allergies.value.trim(), conditions: conditions.value.trim(), meds: meds.value.trim(), notes: notes.value.trim() };
      await update('medical', (m) => ({ ...m, people: person ? m.people.map((x) => (x.id === p.id ? next : x)) : [...m.people, next] }));
      ref.close();
      onDone();
    } } }),
    person ? h('button', { class: 'btn btn-block btn-ghost', type: 'button', text: 'Excluir ficha', on: { click: async () => {
      if (!(await confirmSheet('Excluir ficha?', p.name, 'Excluir', true))) return;
      await update('medical', (m) => ({ ...m, people: m.people.filter((x) => x.id !== p.id) }));
      ref.close();
      onDone();
    } } }) : null,
  ));
}

export function renderMedical(root) {
  const rerender = () => {
    clear(root);
    renderMedical(root);
  };
  const people = getState().medical.people;
  mount(root,
    backLink('#preparo'),
    h('h1', { text: 'Ficha médica' }),
    h('p', { class: 'muted', text: 'Fica só neste aparelho. Imprima pelo Kit em papel e preencha também a Ficha Médica do iPhone (app Saúde), que aparece na tela bloqueada.' }),
    people.map((p) => h('button', { class: 'card list-item chev', type: 'button', style: 'border:1px solid var(--border)', on: { click: () => personForm(p, rerender) } },
      h('span', { class: 'emoji', text: '🧑‍⚕️' }),
      h('span', { class: 'grow' }, h('div', { text: p.name }), h('div', { class: 'meta', text: [p.blood && `Sangue ${p.blood}`, p.allergies && `Alergia: ${p.allergies}`].filter(Boolean).join(' · ') || 'Toque para completar' })),
    )),
    h('button', { class: 'btn btn-primary btn-block', type: 'button', text: '＋ Adicionar pessoa', on: { click: () => personForm(null, rerender) } }),
  );
}
