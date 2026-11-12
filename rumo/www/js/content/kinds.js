// Tipos de pontos do mapa: os vitais (vindos do OpenStreetMap) e os marcados pelo usuário.

export const POI_KINDS = Object.freeze({
  hospital: { label: 'Hospital', emoji: '🏥', color: '#ff453a' },
  clinica: { label: 'UPA / Clínica', emoji: '🩺', color: '#ff9f0a' },
  farmacia: { label: 'Farmácia', emoji: '💊', color: '#30d158' },
  bombeiros: { label: 'Bombeiros', emoji: '🚒', color: '#ff6b81' },
  policia: { label: 'Polícia', emoji: '🚓', color: '#0a84ff' },
  agua: { label: 'Água potável', emoji: '💧', color: '#64d2ff' },
  abrigo: { label: 'Abrigo / encontro', emoji: '⛺', color: '#bf5af2' },
  combustivel: { label: 'Combustível', emoji: '⛽', color: '#ffd60a' },
});

export const WAYPOINT_TYPES = Object.freeze({
  casa: { label: 'Casa', emoji: '🏠', color: '#ffb020' },
  encontro: { label: 'Ponto de encontro', emoji: '📍', color: '#ff2d55' },
  agua: { label: 'Água', emoji: '💧', color: '#64d2ff' },
  abrigo: { label: 'Abrigo', emoji: '⛺', color: '#bf5af2' },
  suprimentos: { label: 'Suprimentos', emoji: '📦', color: '#a2845e' },
  perigo: { label: 'Perigo / evitar', emoji: '⚠️', color: '#ff453a' },
  outro: { label: 'Outro', emoji: '⭐', color: '#e5e5ea' },
});

export const kindInfo = (kind) => POI_KINDS[kind] || { label: kind, emoji: '•', color: '#999999' };
export const waypointInfo = (type) => WAYPOINT_TYPES[type] || WAYPOINT_TYPES.outro;
