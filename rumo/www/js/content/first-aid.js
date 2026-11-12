// Primeiros socorros. Referência rápida alinhada às diretrizes gerais de primeiros socorros
// (Cruz Vermelha, Ministério da Saúde/SAMU). Não substitui curso: revise com profissional de saúde antes de distribuir.

export const FIRST_AID = [
  {
    id: 'avaliacao', emoji: '🩹', title: 'Primeiro de tudo (avaliação)', summary: 'Sempre comece por aqui',
    blocks: [
      { type: 'steps', title: 'Em ordem', items: [
        'Segurança: o local é seguro para você? Fogo, fios, trânsito, desabamento? Não vire a segunda vítima.',
        'Peça ajuda: 192 (SAMU) ou 193 (Bombeiros). Diga o endereço ou leia as coordenadas da aba SOS.',
        'Responde? Toque nos ombros e chame alto.',
        'Respira normalmente? Olhe o peito por até 10 segundos. Não respira ou só "puxa o ar" de vez em quando: comece a RCP.',
        'Sangramento forte? Pressione com força agora.',
        'Inconsciente mas respirando: coloque de lado (posição lateral de segurança) e vigie a respiração.',
      ] },
    ],
  },
  {
    id: 'sangramento', emoji: '🩸', title: 'Sangramento grave', summary: 'Pressão direta e torniquete',
    blocks: [
      { type: 'steps', title: 'Agora', items: [
        'Use luvas ou um saco plástico nas mãos, se tiver.',
        'Aperte forte sobre o ferimento com pano limpo ou gaze e não solte.',
        'Encharcou? Não tire: coloque mais pano por cima e continue apertando.',
        'Ferimento fundo: preencha o buraco com o pano e aperte.',
        'Braço ou perna sangrando sem parar mesmo com pressão: torniquete 5 a 8 cm acima do ferimento (nunca sobre a articulação). Aperte até o sangue parar e anote o horário.',
      ] },
      { type: 'dont', title: 'Não faça', items: [
        'Não afrouxe o torniquete depois de colocado. Só a equipe médica retira.',
        'Não retire objetos cravados: fixe-os no lugar com panos ao redor.',
      ] },
      { type: 'tip', text: 'Torniquete improvisado: faixa larga (5 cm ou mais) de pano, dê um nó, coloque um bastão por cima, gire até parar o sangue e prenda o bastão.' },
    ],
  },
  {
    id: 'rcp', emoji: '❤️', title: 'Parada cardíaca (RCP)', summary: 'Não responde e não respira',
    blocks: [
      { type: 'steps', title: 'Adulto', items: [
        'Ligue 192 e coloque no viva-voz. Peça para alguém buscar um DEA (desfibrilador) se houver.',
        'Pessoa de costas no chão firme. Mãos sobrepostas no centro do peito.',
        'Braços retos: afunde o peito 5 a 6 cm, 100 a 120 vezes por minuto (no ritmo de "Stayin\' Alive").',
        'Deixe o peito voltar todo entre as compressões. Não pare.',
        'Treinado? 30 compressões e 2 ventilações. Não treinado: só compressões, sem parar.',
        'Chegou o DEA: ligue e siga a voz do aparelho.',
        'Continue até a pessoa reagir, a equipe chegar ou você não aguentar mais (revezem a cada 2 minutos).',
      ] },
      { type: 'tip', text: 'Criança: use uma ou duas mãos, afundando cerca de 1/3 do peito. Bebê: dois dedos no centro do peito, logo abaixo da linha dos mamilos.' },
    ],
  },
  {
    id: 'engasgo', emoji: '😮', title: 'Engasgo', summary: 'Não consegue respirar, falar ou tossir',
    blocks: [
      { type: 'steps', title: 'Adulto e criança maior de 1 ano', items: [
        'Consegue tossir? Incentive a tossir forte. Não bata nas costas de quem está tossindo bem.',
        'Não tosse, não fala: fique atrás, feche a mão logo acima do umbigo, cubra com a outra mão e puxe para dentro e para cima com força (manobra de Heimlich).',
        'Repita até sair ou a pessoa desmaiar.',
        'Desmaiou: deite no chão, ligue 192 e comece a RCP.',
      ] },
      { type: 'steps', title: 'Bebê (menos de 1 ano)', items: [
        'Bebê de bruços no seu antebraço, cabeça mais baixa, segurando o queixo.',
        '5 tapas firmes nas costas, entre as escápulas.',
        'Vire de barriga para cima: 5 compressões com dois dedos no centro do peito.',
        'Alterne 5 tapas e 5 compressões até desengasgar. Desmaiou: RCP de bebê e 192.',
      ] },
    ],
  },
  {
    id: 'queimadura', emoji: '♨️', title: 'Queimaduras', summary: 'Esfriar com água corrente',
    blocks: [
      { type: 'steps', title: 'Agora', items: [
        'Afaste da fonte de calor. Retire anéis, relógios e roupas que não estejam grudadas.',
        'Esfrie com água corrente fria (não gelada) por 20 minutos.',
        'Cubra com filme plástico ou pano limpo, sem apertar.',
        'Procure atendimento se for grande, no rosto, mãos, pés, genitais, articulações, ou se for elétrica ou química.',
      ] },
      { type: 'dont', title: 'Não faça', items: [
        'Não use gelo, manteiga, pasta de dente, óleo ou pó de café.',
        'Não estoure bolhas.',
      ] },
    ],
  },
  {
    id: 'fratura', emoji: '🦴', title: 'Fraturas e entorses', summary: 'Imobilizar como está',
    blocks: [
      { type: 'steps', title: 'Agora', items: [
        'Não tente colocar o osso no lugar. Imobilize na posição em que está.',
        'Tala: papelão, revista, galho, preso com faixas acima e abaixo da lesão, pegando as articulações vizinhas.',
        'Osso exposto: cubra com pano limpo e não empurre para dentro.',
        'Confira se os dedos continuam rosados e com sensibilidade. Ficaram frios ou roxos: afrouxe.',
        'Suspeita de lesão na coluna (queda alta, batida forte): não mova a pessoa, a menos que haja perigo imediato.',
      ] },
    ],
  },
  {
    id: 'choque', emoji: '🥶', title: 'Estado de choque', summary: 'Pálido, frio, suando, confuso',
    blocks: [
      { type: 'steps', title: 'Agora', items: [
        'Ligue 192. Trate a causa (sangramento, queimadura).',
        'Deite a pessoa de costas. Se não houver lesão nas pernas, quadril ou coluna, eleve as pernas uns 30 cm.',
        'Mantenha aquecida, com algo por baixo e por cima do corpo.',
        'Acalme e não deixe sozinha.',
      ] },
      { type: 'dont', title: 'Não faça', items: ['Não dê comida nem bebida.'] },
    ],
  },
  {
    id: 'hipotermia', emoji: '🧊', title: 'Hipotermia', summary: 'Frio extremo, tremores, confusão',
    blocks: [
      { type: 'steps', title: 'Agora', items: [
        'Leve para local abrigado do vento e da chuva. Isole do chão.',
        'Troque roupas molhadas por secas. Cubra cabeça e pescoço.',
        'Aqueça o tronco primeiro: peito, pescoço, axilas e virilha (cobertor, contato corpo a corpo, garrafas mornas enroladas em pano).',
        'Se estiver bem acordada e conseguir engolir: bebida morna e doce.',
        'Manuseie com delicadeza. Ligue 192.',
      ] },
      { type: 'dont', title: 'Não faça', items: ['Não dê álcool.', 'Não esfregue braços e pernas.', 'Não use água quente direto na pele.'] },
    ],
  },
  {
    id: 'insolacao', emoji: '🥵', title: 'Insolação / intermação', summary: 'Calor extremo, pele quente, confusão',
    blocks: [
      { type: 'steps', title: 'Agora (é emergência)', items: [
        'Ligue 192. Leve para a sombra ou lugar fresco.',
        'Esfrie rápido: molhe o corpo todo e abane; compressas frias no pescoço, axilas e virilha. Banho frio, se der.',
        'Se estiver acordada e engolindo bem: água em goles.',
        'Desmaiada e respirando: de lado. Não respira: RCP.',
      ] },
      { type: 'tip', text: 'Prevenção: beba água antes de ter sede, evite esforço entre 10h e 16h, use chapéu e roupa clara.' },
    ],
  },
  {
    id: 'desidratacao', emoji: '💦', title: 'Desidratação e soro caseiro', summary: 'Diarreia, vômito, calor',
    blocks: [
      { type: 'steps', title: 'Soro caseiro (receita da OMS)', items: [
        '1 litro de água limpa (fervida e fria, ou desinfetada).',
        '6 colheres de chá rasas de açúcar.',
        'Meia colher de chá rasa de sal.',
        'Misture bem. O gosto não deve ser mais salgado que uma lágrima.',
        'Dê em pequenos goles, com frequência, após cada evacuação ou vômito. Use em até 24 horas.',
      ] },
      { type: 'tip', text: 'Sinais de alerta: boca muito seca, pouco xixi ou xixi escuro, sonolência, olhos fundos, moleira funda em bebês. Bebês, idosos e quem não melhora: procure atendimento.' },
    ],
  },
  {
    id: 'cobra', emoji: '🐍', title: 'Picada de cobra', summary: 'Hospital o quanto antes',
    blocks: [
      { type: 'steps', title: 'Agora', items: [
        'Afaste-se da cobra. Se for seguro, fotografe-a de longe (ajuda a escolher o soro).',
        'Deite e acalme a pessoa. Mantenha a parte picada parada e na altura do corpo.',
        'Tire anéis, pulseiras, relógio e calçados apertados (vai inchar).',
        'Lave com água e sabão.',
        'Leve ao hospital imediatamente: só o soro antiofídico trata. Ligue 192.',
      ] },
      { type: 'dont', title: 'Não faça', items: [
        'Não faça torniquete nem garrote.',
        'Não corte, não chupe, não queime o local.',
        'Não passe nada (folhas, querosene, borra de café) e não dê bebida alcoólica.',
      ] },
      { type: 'tip', text: 'Disque-Intoxicação (ANVISA): 0800 722 6001.' },
    ],
  },
  {
    id: 'escorpiao', emoji: '🦂', title: 'Escorpião e aranha', summary: 'Dor forte no local',
    blocks: [
      { type: 'steps', title: 'Agora', items: [
        'Lave o local com água e sabão.',
        'Compressa morna no local alivia a dor.',
        'Procure atendimento médico logo, principalmente crianças, idosos e quem tem doença cardíaca.',
        'Sinais graves (vômitos, suor intenso, agitação, falta de ar): emergência, ligue 192.',
      ] },
      { type: 'dont', title: 'Não faça', items: ['Não faça torniquete.', 'Não corte nem esprema o local.'] },
    ],
  },
  {
    id: 'afogamento', emoji: '🏊', title: 'Afogamento', summary: 'Salve sem virar vítima',
    blocks: [
      { type: 'steps', title: 'Agora', items: [
        'Não entre na água se não for treinado. Jogue algo que boie (garrafa PET fechada, isopor, prancha) ou estenda galho ou corda.',
        'Ligue 193.',
        'Fora da água, não respira: comece a RCP. Se for treinado, dê 5 ventilações antes das compressões.',
        'Respira: deite de lado, aqueça e vigie. Precisa de avaliação médica mesmo parecendo bem.',
      ] },
    ],
  },
  {
    id: 'convulsao', emoji: '⚡', title: 'Convulsão', summary: 'Proteger e cronometrar',
    blocks: [
      { type: 'steps', title: 'Agora', items: [
        'Afaste objetos. Proteja a cabeça com algo macio.',
        'Marque o tempo. Afrouxe roupas apertadas.',
        'Quando os movimentos pararem, vire de lado e deixe descansar.',
        'Ligue 192 se durar mais de 5 minutos, se repetir, se for a primeira vez, se houver ferimento ou se não acordar.',
      ] },
      { type: 'dont', title: 'Não faça', items: ['Não coloque nada na boca nem puxe a língua.', 'Não segure os movimentos.'] },
    ],
  },
  {
    id: 'intoxicacao', emoji: '☠️', title: 'Intoxicação e envenenamento', summary: 'Produto químico, remédio, planta',
    blocks: [
      { type: 'steps', title: 'Agora', items: [
        'Ligue para o Disque-Intoxicação: 0800 722 6001, ou 192.',
        'Tenha a embalagem do produto em mãos.',
        'Produto na pele ou nos olhos: lave com muita água corrente por 15 minutos.',
        'Gás ou fumaça: leve para o ar livre.',
      ] },
      { type: 'dont', title: 'Não faça', items: ['Não provoque vômito.', 'Não dê leite, óleo ou "antídotos caseiros".'] },
    ],
  },
];
