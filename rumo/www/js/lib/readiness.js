// Painel "Pronto para ficar offline?": avalia o estado salvo e diz o que falta.

const DAY_MS = 86400000;
const BACKUP_MAX_DAYS = 90;
const DRILL_MAX_DAYS = 90;
const MAP_MAX_DAYS = 180;
const BAG_MIN_PROGRESS = 0.8;

const ageDays = (iso, now) => (iso ? (now - new Date(iso).getTime()) / DAY_MS : Infinity);

export function readiness(state, now = Date.now()) {
  const items = [
    { id: 'app', label: 'App salvo para uso offline', ok: Boolean(state.swReady), hint: 'Abra o app uma vez com internet e aguarde.' },
    { id: 'mapa', label: 'Mapa da região baixado', ok: Boolean(state.mapDate), hint: 'Preparo → Mapa offline → Baixar.' },
    { id: 'mapaNovo', label: 'Mapa atualizado nos últimos 6 meses', ok: ageDays(state.mapDate, now) <= MAP_MAX_DAYS, hint: 'Baixe a versão nova quando tiver Wi-Fi.' },
    { id: 'pontos', label: 'Hospitais, água e abrigos carregados', ok: (state.poisCount || 0) > 0, hint: 'Vem junto com o mapa.' },
    { id: 'armazenamento', label: 'Armazenamento protegido contra limpeza', ok: Boolean(state.persisted), hint: 'Instale na Tela de Início e toque em "Proteger dados".' },
    { id: 'contatos', label: 'Contatos de emergência cadastrados', ok: (state.contacts || 0) >= 2, hint: 'Cadastre pelo menos 2, incluindo alguém fora da cidade.' },
    { id: 'encontro', label: 'Pontos de encontro definidos', ok: (state.meetingPoints || 0) >= 2, hint: 'Um perto de casa e um fora do bairro.' },
    { id: 'ficha', label: 'Ficha médica preenchida', ok: (state.medicalPeople || 0) >= 1, hint: 'Tipo sanguíneo, alergias e remédios.' },
    { id: 'mochila', label: 'Mochila de emergência pronta', ok: (state.bagProgress || 0) >= BAG_MIN_PROGRESS, hint: 'Complete pelo menos 80% do checklist.' },
    { id: 'backup', label: 'Backup feito nos últimos 90 dias', ok: ageDays(state.lastBackup, now) <= BACKUP_MAX_DAYS, hint: 'Exporte e guarde fora do celular.' },
    { id: 'simulado', label: 'Simulado feito nos últimos 90 dias', ok: ageDays(state.lastDrill, now) <= DRILL_MAX_DAYS, hint: 'Pratique com a família: em crise ninguém aprende app novo.' },
  ];
  const done = items.filter((i) => i.ok).length;
  return { items, done, total: items.length, score: Math.round((done / items.length) * 100) };
}
