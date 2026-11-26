/**
 * Catálogos locais (funcionam sem internet).
 *
 * "Originais do usuário" são preservados LITERALMENTE em catálogo separado e não são
 * editados pelo assistente. As frases dos BMPs foram transcritas MANUALMENTE a partir
 * das imagens enviadas (não há OCR no aplicativo); o nome do arquivo pode diferir do
 * texto da imagem (ex.: o arquivo diz "profunda paz", a imagem diz "PROFUNDA DE PAZ").
 */
export interface CatalogEntry {
  text: string;
  category: string;
  note?: string;
}

export const USER_BMP_ORIGINALS: CatalogEntry[] = [
  { text: 'MEU FOCO É INABALÁVEL E MINHA MENTE É CLARA', category: 'Foco' },
  { text: 'EU ABSORVO CONHECIMENTO FACILMENTE E COM EFICIÊNCIA', category: 'Assimilação' },
  { text: 'MINHA CAPACIDADE DE ASSIMILAÇÃO É MÁXIMA', category: 'Assimilação' },
  { text: 'TUDO QUE LEIO E VEJO MEMORIZO SOU UM VENCEDOR', category: 'Assimilação' },
  { text: 'MEU CÉREBRO É POTENTE EXTRAORDINÁRIO SEM BLOQUEIOS', category: 'Foco' },
  { text: 'SOU CAPAZ, COMPETENTE E CONFIANTE', category: 'Autoconfiança' },
  { text: 'MINHA DETERMINAÇÃO ME LEVA AO SUCESSO', category: 'Autoconfiança' },
  { text: 'RESPIRE PROFUNDAMENTE, RELAXE COMPLETAMENTE', category: 'Relaxamento' },
  { text: 'CADA RESPIRAÇÃO TE LEVA A MAIS PROFUNDA DE PAZ', category: 'Relaxamento', note: 'Texto literal da imagem; o nome do arquivo diz "a mais profunda paz".' },
  { text: 'SINTA A CALMA E AMOR ENVOLVENDO TODO O SEU SER', category: 'Relaxamento', note: 'O nome do arquivo omite "e amor".' },
  { text: 'A CADA MOMENTO VOCÊ SE SENTE MAIS CALMO E EM PAZ', category: 'Relaxamento' },
  { text: 'SEU SONO SE TORNA MAIS PROFUNDO E RESTAURADOR', category: 'Sono' },
  { text: 'VOCÊ DORME EM PAZ, NA PROTEÇÃO DE DEUS, BONS SONHOS', category: 'Sono' },
  { text: 'VOCÊ ESTÁ SEGURO E PROTEGIDO', category: 'Proteção' },
];

/** Grupos do app.py v1.0 marcados como "(usuário)" — preservados literalmente. */
export const USER_APP_GROUPS: { name: string; lines: string[] }[] = [
  {
    name: 'Foco e assimilação (usuário)',
    lines: [
      'Meu foco é inabalável e minha mente é clara.',
      'Eu absorvo conhecimento facilmente e com eficiência.',
      'Minha capacidade de assimilação é máxima.',
      'Tudo que leio e vejo memorizo, sou um vencedor.',
      'Meu cérebro é potente, extraordinário, sem bloqueios.',
    ],
  },
  { name: 'Autoconfiança e sucesso (usuário)', lines: ['Sou capaz, competente e confiante.', 'Minha determinação me leva ao sucesso.'] },
  {
    name: 'Calma, paz e sono (usuário)',
    lines: [
      'Respire profundamente, relaxe completamente.',
      'Cada respiração te leva a mais profunda paz.',
      'Sinta a calma e amor envolvendo todo o seu ser.',
      'A cada momento você se sente mais calmo e em paz.',
      'Seu sono se torna mais profundo e restaurador.',
      'Você dorme em paz, na proteção de Deus, bons sonhos.',
      'Você está seguro e protegido.',
    ],
  },
];

export const CATEGORIES = [
  'Foco', 'Assimilação', 'Autoconfiança', 'Planejamento', 'Estudo', 'Relaxamento',
  'Proteção', 'Sono', 'Hábitos', 'Motivação', 'Criatividade', 'Comunicação', 'Autocuidado',
] as const;
export type Category = (typeof CATEGORIES)[number];

/**
 * Sugestões de escrita (exemplos locais). Evitam absolutos que contrariam a experiência
 * real ("sempre", "nunca", "máximo") — Wood, Perunovic & Lee (2009) observaram que
 * afirmações positivas extremas podem piorar o humor de pessoas com baixa autoestima.
 */
export const SUGGESTIONS: Record<Category, string[]> = {
  Foco: ['Eu escolho uma tarefa de cada vez.', 'Quando me distraio, eu volto à tarefa com calma.', 'Eu organizo o ambiente antes de começar.'],
  Assimilação: ['Eu revejo o conteúdo em intervalos.', 'Eu explico com minhas palavras o que aprendi.', 'Cada revisão fortalece o que estudei.'],
  Autoconfiança: ['Eu me preparo e confio na minha preparação.', 'Eu reconheço o que já aprendi.', 'Eu posso agir mesmo sentindo insegurança.'],
  Planejamento: ['Eu defino o próximo passo concreto.', 'Eu reviso meus planos quando necessário.', 'Eu reservo tempo para o que é importante.'],
  Estudo: ['Eu testo a mim mesmo depois de ler.', 'Eu estudo em sessões curtas e espaçadas.', 'Eu começo pelo trecho mais importante.'],
  Relaxamento: ['Minha respiração encontra um ritmo tranquilo.', 'Eu posso soltar os ombros agora.', 'A cada expiração eu relaxo um pouco mais.'],
  Proteção: ['Eu cuido do meu espaço e dos meus limites.', 'Eu peço ajuda quando preciso.', 'Eu me sinto acolhido neste momento.'],
  Sono: ['Eu preparo meu corpo para descansar.', 'Eu deixo as tarefas de amanhã anotadas.', 'Eu permito que o sono venha no seu tempo.'],
  Hábitos: ['Eu começo com uma ação pequena e possível.', 'Constância vale mais do que perfeição.', 'Se eu falhar um dia, eu recomeço no seguinte.'],
  Motivação: ['Eu lembro por que este objetivo importa para mim.', 'Eu celebro pequenos avanços.', 'Eu dou o primeiro passo agora.'],
  Criatividade: ['Eu exploro ideias sem julgar cedo demais.', 'Eu anoto ideias assim que surgem.', 'Eu experimento caminhos diferentes.'],
  Comunicação: ['Eu escuto antes de responder.', 'Eu falo com clareza e respeito.', 'Eu posso fazer perguntas.'],
  Autocuidado: ['Eu observo os sinais do meu corpo com atenção.', 'Eu reservo tempo para descansar.', 'Eu procuro orientação profissional quando preciso.'],
};

const VERBS: Record<string, string> = {
  escolho: 'escolhe', volto: 'volta', organizo: 'organiza', revejo: 'revê', explico: 'explica', preparo: 'prepara',
  confio: 'confia', reconheço: 'reconhece', defino: 'define', reviso: 'revisa', reservo: 'reserva', testo: 'testa',
  estudo: 'estuda', começo: 'começa', cuido: 'cuida', peço: 'pede', deixo: 'deixa', permito: 'permite', lembro: 'lembra',
  celebro: 'celebra', dou: 'dá', exploro: 'explora', anoto: 'anota', experimento: 'experimenta', escuto: 'escuta',
  falo: 'fala', observo: 'observa', procuro: 'procura', absorvo: 'absorve', relaxo: 'relaxa', imagino: 'imagina',
  visualizo: 'visualiza', identifico: 'identifica', sinto: 'sente', durmo: 'dorme', sou: 'é', estou: 'está', tenho: 'tem',
  faço: 'faz', vou: 'vai', sei: 'sabe', quero: 'quer', respiro: 'respira', aprendo: 'aprende', avanço: 'avança',
  valorizo: 'valoriza', acompanho: 'acompanha', registro: 'registra', posso: 'pode', consigo: 'consegue', escrevo: 'escreve',
  pratico: 'pratica', recomeço: 'recomeça', ajusto: 'ajusta', solto: 'solta', encontro: 'encontra', coloco: 'coloca',
  memorizo: 'memoriza', leio: 'lê', vejo: 'vê', ouço: 'ouve', digo: 'diz', percebo: 'percebe', recordo: 'recorda',
};
const POSS: Record<string, string> = { meu: 'seu', minha: 'sua', meus: 'seus', minhas: 'suas', Meu: 'Seu', Minha: 'Sua', Meus: 'Seus', Minhas: 'Suas' };

/**
 * Conversão Eu -> Você por dicionário de verbos conhecidos. Não é uma conversão
 * gramatical universal: verbos fora do dicionário ficam como estão e a interface
 * pede revisão humana.
 */
export function toSecondPerson(phrase: string): { text: string; complete: boolean } {
  let complete = true;
  let out = phrase.replace(/\b(Eu|eu) (me )?([a-zà-ú]+)/g, (_m, eu: string, me: string | undefined, verb: string) => {
    const v = VERBS[verb.toLowerCase()];
    if (!v) complete = false;
    const subj = eu === 'Eu' ? 'Você' : 'você';
    return `${subj} ${me ? 'se ' : ''}${v ?? verb}`;
  });
  out = out.replace(/\b(Meu|Minha|Meus|Minhas|meu|minha|meus|minhas)\b/g, (w) => POSS[w]);
  out = out.replace(/\bSou\b/g, 'Você é').replace(/\bcomigo\b/g, 'com você').replace(/\bmim\b/g, 'você');
  return { text: out, complete };
}
