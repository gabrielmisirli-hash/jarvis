/**
 * Assistente de frases: métodos, modelos e evidências. 100% local.
 * Classificação de evidência é resumo honesto da literatura citada, não um banco clínico.
 * Nenhum método aqui é tratamento de saúde.
 */
export type Evidence = 'moderada' | 'limitada' | 'insuficiente' | 'sem respaldo';

export interface Citation {
  ref: string;
  note: string;
}

export interface Field {
  key: string;
  label: string;
  placeholder: string;
}

export interface Method {
  id: string;
  name: string;
  summary: string;
  evidence: Evidence;
  evidenceNote: string;
  limitations: string;
  citations: Citation[];
  fields: Field[];
  /** gera frases a partir dos campos (Eu) */
  build: (v: Record<string, string>) => string[];
  /** roteiro audível (para ler/gravar), separado do texto espectral */
  script?: (v: Record<string, string>) => string[];
}

const f = (s: string | undefined, d: string) => (s && s.trim() ? s.trim() : d);
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

export const METHODS: Method[] = [
  {
    id: 'se-entao',
    name: 'Intenções de implementação (se-então)',
    summary: 'Ligar uma situação concreta a uma ação: "Se/Quando X, então eu faço Y".',
    evidence: 'moderada',
    evidenceNote: 'Metanálise de 94 estudos: efeito médio-grande (d ≈ 0,65) sobre o alcance de metas, em comparação com só formar a meta.',
    limitations: 'Funciona melhor para ações específicas e quando a pessoa está comprometida com a meta. Efeito varia muito entre estudos; viés de publicação possível.',
    citations: [
      { ref: 'Gollwitzer, P. M., & Sheeran, P. (2006). Implementation intentions and goal achievement: A meta-analysis of effects and processes. Advances in Experimental Social Psychology, 38, 69–119.', note: 'Metanálise principal.' },
    ],
    fields: [
      { key: 'situacao', label: 'Quando / se…', placeholder: 'eu sentar à mesa depois do almoço' },
      { key: 'acao', label: '…então eu…', placeholder: 'abro o caderno e estudo 25 minutos' },
    ],
    build: (v) => [`Quando ${f(v.situacao, 'eu sentar para estudar')}, eu ${lower(f(v.acao, 'começo pela primeira tarefa'))}.`],
  },
  {
    id: 'woop',
    name: 'Contraste mental / WOOP',
    summary: 'Desejo (Wish), Resultado (Outcome), Obstáculo interno (Obstacle) e Plano se-então (Plan).',
    evidence: 'moderada',
    evidenceNote: 'Metanálise (2021) indica efeito pequeno a médio do contraste mental com intenções de implementação sobre o alcance de metas.',
    limitations: 'Exige identificar um obstáculo real e interno; não é visualização positiva pura (que, isolada, pode reduzir esforço).',
    citations: [
      { ref: 'Oettingen, G. (2012). Future thought and behaviour change. European Review of Social Psychology, 23(1), 1–63.', note: 'Base teórica.' },
      { ref: 'Wang, G., Wang, Y., & Gai, X. (2021). A meta-analysis of the effects of mental contrasting with implementation intentions on goal attainment. Frontiers in Psychology, 12, 565202.', note: 'Metanálise (link fornecido no pacote: PMC8149892).' },
    ],
    fields: [
      { key: 'desejo', label: 'Desejo', placeholder: 'terminar o curso este semestre' },
      { key: 'resultado', label: 'Melhor resultado', placeholder: 'me sentir preparado na prova' },
      { key: 'obstaculo', label: 'Obstáculo interno', placeholder: 'pegar o celular quando fico cansado' },
      { key: 'plano', label: 'Plano (então eu…)', placeholder: 'deixo o celular em outro cômodo' },
    ],
    build: (v) => [
      `Eu quero ${lower(f(v.desejo, 'alcançar meu objetivo'))}.`,
      `Eu imagino ${lower(f(v.resultado, 'o resultado que desejo'))}.`,
      `Quando surgir ${lower(f(v.obstaculo, 'o obstáculo'))}, eu ${lower(f(v.plano, 'sigo meu plano'))}.`,
    ],
  },
  {
    id: 'smart',
    name: 'Metas SMART',
    summary: 'Específica, mensurável, alcançável, relevante e com prazo.',
    evidence: 'limitada',
    evidenceNote: 'O acrônimo é uma ferramenta de gestão; a teoria de definição de metas (metas específicas e desafiadoras) tem ampla pesquisa de base.',
    limitations: 'O acrônimo SMART em si foi pouco testado experimentalmente; metas muito rígidas podem reduzir flexibilidade.',
    citations: [
      { ref: 'Doran, G. T. (1981). There’s a S.M.A.R.T. way to write management’s goals and objectives. Management Review, 70(11), 35–36.', note: 'Origem do acrônimo.' },
      { ref: 'Locke, E. A., & Latham, G. P. (2002). Building a practically useful theory of goal setting and task motivation. American Psychologist, 57(9), 705–717.', note: 'Teoria de definição de metas.' },
    ],
    fields: [
      { key: 'acao', label: 'Ação mensurável', placeholder: 'leio 10 páginas' },
      { key: 'quando', label: 'Quando / prazo', placeholder: 'todos os dias às 7h' },
    ],
    build: (v) => [`Eu ${lower(f(v.acao, 'realizo uma ação concreta'))} ${f(v.quando, 'no horário que escolhi')}.`],
  },
  {
    id: 'autoinstrucao',
    name: 'Autoinstrução (autodiálogo)',
    summary: 'Frases curtas que orientam a ação ("Calma, um passo de cada vez").',
    evidence: 'moderada',
    evidenceNote: 'Metanálise no esporte: efeito moderado do autodiálogo sobre o desempenho, maior para tarefas de precisão e com treino.',
    limitations: 'Evidência concentrada em tarefas motoras/esportivas; transferência para outros contextos é menos estudada.',
    citations: [
      { ref: 'Hatzigeorgiadis, A., Zourbanos, N., Galanis, E., & Theodorakis, Y. (2011). Self-talk and sports performance: A meta-analysis. Perspectives on Psychological Science, 6(4), 348–356.', note: '' },
    ],
    fields: [{ key: 'instrucao', label: 'Instrução curta', placeholder: 'Calma, um passo de cada vez' }],
    build: (v) => [`${f(v.instrucao, 'Calma, um passo de cada vez')}.`],
  },
  {
    id: 'autocompaixao',
    name: 'Autocompaixão',
    summary: 'Tratar-se com a gentileza que daria a um amigo; reconhecer que dificuldades são humanas.',
    evidence: 'moderada',
    evidenceNote: 'Metanálise de ensaios randomizados: intervenções de autocompaixão reduzem autocrítica, ruminação e sintomas de ansiedade/depressão com efeitos pequenos a moderados.',
    limitations: 'Estudos heterogêneos, muitas vezes com amostras não clínicas; não substitui tratamento.',
    citations: [
      { ref: 'Neff, K. D. (2003). Self-compassion: An alternative conceptualization of a healthy attitude toward oneself. Self and Identity, 2(2), 85–101.', note: '' },
      { ref: 'Ferrari, M., Hunt, C., Harrysunker, A., Abbott, M. J., Beath, A. P., & Einstein, D. A. (2019). Self-compassion interventions and psychosocial outcomes: A meta-analysis of RCTs. Mindfulness, 10, 1455–1473.', note: '' },
    ],
    fields: [{ key: 'situacao', label: 'Situação difícil', placeholder: 'errei na apresentação' }],
    build: (v) => [`Mesmo quando ${lower(f(v.situacao, 'algo dá errado'))}, eu me trato com gentileza.`, 'Dificuldades fazem parte da experiência humana.', 'Eu posso aprender e seguir em frente.'],
  },
  {
    id: 'ensaio',
    name: 'Ensaio mental guiado',
    summary: 'Imaginar com detalhes a execução de uma ação antes de fazê-la.',
    evidence: 'moderada',
    evidenceNote: 'Metanálise: prática mental melhora o desempenho, com efeito maior em tarefas cognitivas e menor que a prática física.',
    limitations: 'Complementa, não substitui, a prática real; o efeito decai com o tempo sem reforço.',
    citations: [{ ref: 'Driskell, J. E., Copper, C., & Moran, A. (1994). Does mental practice enhance performance? Journal of Applied Psychology, 79(4), 481–492.', note: '' }],
    fields: [{ key: 'acao', label: 'Ação a ensaiar', placeholder: 'apresentar o trabalho com voz calma' }],
    build: (v) => [`Eu imagino com detalhes ${lower(f(v.acao, 'o próximo passo'))}.`, 'Eu percebo os recursos que tenho para essa tarefa.'],
  },
  {
    id: 'regulacao',
    name: 'Regulação emocional (reavaliação)',
    summary: 'Reinterpretar a situação para mudar seu impacto emocional.',
    evidence: 'moderada',
    evidenceNote: 'Metanálise de 190 estudos: reavaliação cognitiva tem efeito pequeno a moderado; supressão da expressão tem efeito pequeno e pode ser contraproducente.',
    limitations: 'Eficácia depende da situação e da pessoa; não se aplica a perigos reais que exigem ação.',
    citations: [
      { ref: 'Gross, J. J. (1998). The emerging field of emotion regulation: An integrative review. Review of General Psychology, 2(3), 271–299.', note: '' },
      { ref: 'Webb, T. L., Miles, E., & Sheeran, P. (2012). Dealing with feeling: A meta-analysis of the effectiveness of strategies derived from the process model of emotion regulation. Psychological Bulletin, 138(4), 775–808.', note: '' },
    ],
    fields: [{ key: 'situacao', label: 'Situação', placeholder: 'uma prova importante' }],
    build: (v) => [`Eu posso ver ${lower(f(v.situacao, 'este desafio'))} como uma oportunidade de praticar.`, 'Eu percebo a emoção e escolho minha resposta.'],
  },
  {
    id: 'estudo',
    name: 'Aprendizagem e estudo (recuperação e espaçamento)',
    summary: 'Testar-se e espaçar revisões são as técnicas de maior utilidade na revisão de Dunlosky et al.',
    evidence: 'moderada',
    evidenceNote: 'Revisão extensa: prática de testes e prática distribuída classificadas como de alta utilidade; releitura e grifar, de baixa utilidade.',
    limitations: 'Afirmações não substituem a prática em si; as frases servem como lembretes de comportamento.',
    citations: [{ ref: 'Dunlosky, J., Rawson, K. A., Marsh, E. J., Nathan, M. J., & Willingham, D. T. (2013). Improving students’ learning with effective learning techniques. Psychological Science in the Public Interest, 14(1), 4–58.', note: '' }],
    fields: [{ key: 'materia', label: 'Matéria', placeholder: 'anatomia' }],
    build: (v) => [`Depois de estudar ${lower(f(v.materia, 'o conteúdo'))}, eu me testo sem consultar.`, 'Eu revejo em dias diferentes.'],
  },
  {
    id: 'autossugestao',
    name: 'Autossugestão / afirmações',
    summary: 'Frases positivas repetidas. Preferir frases plausíveis e orientadas à ação.',
    evidence: 'limitada',
    evidenceNote: 'Afirmações extremas podem piorar o humor de quem tem baixa autoestima (Wood et al., 2009). "Autoafirmação de valores" é outra técnica, com mais pesquisa (Cohen & Sherman, 2014).',
    limitations: 'Evite absolutos ("sempre", "máxima", "sem bloqueios") se soarem falsos para você.',
    citations: [
      { ref: 'Wood, J. V., Perunovic, W. Q. E., & Lee, J. W. (2009). Positive self-statements: Power for some, peril for others. Psychological Science, 20(7), 860–866.', note: '' },
      { ref: 'Cohen, G. L., & Sherman, D. K. (2014). The psychology of change: Self-affirmation and social psychological intervention. Annual Review of Psychology, 65, 333–371.', note: '' },
    ],
    fields: [{ key: 'tema', label: 'Tema', placeholder: 'estudo' }],
    build: (v) => [`Eu dou um passo de cada vez no ${lower(f(v.tema, 'meu objetivo'))}.`, 'Eu reconheço meus avanços.'],
  },
  {
    id: 'pnl',
    name: 'PNL (inspiração de escrita)',
    summary: 'Recursos de linguagem como "recordar um momento de capacidade" usados como inspiração, não como técnica validada.',
    evidence: 'insuficiente',
    evidenceNote: 'Revisão sistemática sobre PNL e desfechos de saúde: evidência insuficiente para recomendar. Revisões de décadas de pesquisa não sustentam seus pressupostos centrais.',
    limitations: 'Use apenas como inspiração de linguagem; não há suporte para efeitos clínicos.',
    citations: [
      { ref: 'Sturt, J., et al. (2012). Neurolinguistic programming: a systematic review of the effects on health outcomes. British Journal of General Practice, 62(604), e757–e764. (PubMed 23211179)', note: '' },
      { ref: 'Witkowski, T. (2010). Thirty-five years of research on Neuro-Linguistic Programming. Polish Psychological Bulletin, 41(2), 58–66.', note: '' },
    ],
    fields: [{ key: 'recurso', label: 'Momento em que me senti capaz', placeholder: 'quando terminei a maratona' }],
    build: (v) => [`Eu recordo ${lower(f(v.recurso, 'um momento em que me senti capaz'))}.`, 'Eu levo esses recursos para o próximo desafio.'],
  },
  {
    id: 'access',
    name: 'Perguntas reflexivas (estilo Access)',
    summary: 'Perguntas abertas para reflexão.',
    evidence: 'sem respaldo',
    evidenceNote: 'Não há estudos clínicos sólidos sobre Access Consciousness. Incluído apenas como reflexão opcional.',
    limitations: 'Sem alegação de eficácia.',
    citations: [],
    fields: [{ key: 'tema', label: 'Tema', placeholder: 'meu trabalho' }],
    build: (v) => [`Que outras possibilidades existem para ${lower(f(v.tema, 'isto'))}?`, 'Que escolha simples posso fazer hoje?'],
  },
  {
    id: 'autohipnose',
    name: 'Autohipnose guiada (roteiro audível)',
    summary: 'Roteiro para LER ou GRAVAR com a própria voz: introdução, relaxamento, foco de atenção e saída. Separado do texto espectral.',
    evidence: 'limitada',
    evidenceNote: 'Hipnose como complemento à terapia cognitivo-comportamental mostrou benefício em metanálise antiga; apps de hipnose têm evidência ainda limitada (revisão sistemática fornecida no pacote, PubMed 39680713).',
    limitations: 'Não use dirigindo ou operando máquinas. Não substitui atendimento clínico. Pessoas com condições psiquiátricas devem consultar profissional.',
    citations: [
      { ref: 'Kirsch, I., Montgomery, G., & Sapirstein, G. (1995). Hypnosis as an adjunct to cognitive-behavioral psychotherapy: A meta-analysis. Journal of Consulting and Clinical Psychology, 63(2), 214–220.', note: '' },
      { ref: 'Revisão sistemática sobre apps de hipnose — PubMed 39680713 (fornecida no pacote; não reverificada nesta versão).', note: '' },
    ],
    fields: [{ key: 'foco', label: 'Foco da sessão', placeholder: 'descansar antes de dormir' }],
    build: (v) => [`Eu me permito ${lower(f(v.foco, 'descansar'))}.`],
    script: (v) => [
      'INTRODUÇÃO: Escolha um lugar seguro e confortável. Esta é uma prática de relaxamento guiado; você pode abrir os olhos a qualquer momento.',
      'RELAXAMENTO: Observe a respiração sem forçá-la. A cada expiração, solte um pouco os ombros, a mandíbula e as mãos.',
      `ATENÇÃO: Traga à mente seu foco: ${f(v.foco, 'descansar')}. Imagine um pequeno passo concreto nessa direção.`,
      'SAÍDA: Conte devagar de 1 a 5. Mexa os dedos, respire mais fundo e abra os olhos, voltando ao ambiente, desperto e atento.',
    ],
  },
];
