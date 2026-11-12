// Guias de sobrevivência: água, comida, abrigo, orientação sem GPS, sinalização, energia e comunicação.
// Blocos do tipo "calc" mostram uma calculadora (views/calcs.js).

export const SURVIVAL = [
  {
    id: 'agua', emoji: '💧', title: 'Água', summary: 'Achar, desinfetar e guardar',
    blocks: [
      { type: 'tip', text: 'Regra dos 3: cerca de 3 minutos sem ar, 3 horas sem abrigo no frio ou calor extremo, 3 dias sem água, 3 semanas sem comida. Água vem antes de comida.' },
      { type: 'steps', title: 'Quanto guardar', items: [
        'Cerca de 4 litros por pessoa por dia (beber, cozinhar, higiene mínima). Mais no calor e para quem amamenta.',
        'Meta mínima: 3 dias. Ideal: 2 semanas.',
        'Fontes escondidas em casa: caixa d\'água, reservatório do aquecedor, gelo, enlatados.',
      ] },
      { type: 'steps', title: 'Ferver (o método mais seguro)', items: [
        'Se estiver turva, deixe decantar e coe num pano limpo antes.',
        'Ferva em fervura forte por pelo menos 1 minuto (3 minutos acima de 2.000 m de altitude).',
        'Deixe esfriar tampada. Para tirar o gosto "chato", passe de uma vasilha limpa para outra algumas vezes.',
      ] },
      { type: 'steps', title: 'Água sanitária (sem ferver)', items: [
        'Use só água sanitária comum: hipoclorito de sódio 2 a 2,5% e água, sem perfume, sem alvejante "com cloro ativo" de outra fórmula.',
        'Água clara: 2 gotas por litro. Turva: filtre antes; se não der, dobre a dose.',
        'Misture e espere 30 minutos. Deve ficar um leve cheiro de cloro; se não tiver, repita a dose e espere mais 15 minutos.',
      ] },
      { type: 'calc', calc: 'bleach' },
      { type: 'steps', title: 'Sem fogo e sem cloro (SODIS)', items: [
        'Garrafa PET transparente de até 2 litros, sem rótulo, com água clara.',
        'Deixe deitada ao sol forte por 6 horas (2 dias se estiver nublado).',
        'Não funciona com água turva.',
      ] },
      { type: 'dont', title: 'Não faça', items: [
        'Não beba água de enchente, de esgoto ou com cheiro de combustível: ferver não remove produto químico.',
        'Não beba água do mar nem urina.',
      ] },
      { type: 'calc', calc: 'waterDays' },
    ],
  },
  {
    id: 'comida', emoji: '🥫', title: 'Comida', summary: 'Estoque, racionamento e segurança',
    blocks: [
      { type: 'steps', title: 'Prioridades', items: [
        'Primeiro coma o que estraga: geladeira, depois congelador, por último enlatados e secos.',
        'Estoque de 3 dias a 2 semanas: enlatados, arroz, feijão, macarrão, aveia, leite em pó, castanhas, barras, sal, açúcar.',
        'Não esqueça abridor manual, combustível para cozinhar e comida de bebês, idosos e animais.',
        'Coma menos, mas não pare de beber água. Sem água, coma pouco proteína e salgado.',
      ] },
      { type: 'dont', title: 'Não faça', items: [
        'Não coma plantas, frutos ou cogumelos que você não conhece com certeza.',
        'Não coma lata estufada, enferrujada ou que esguicha ao abrir.',
        'Na dúvida se estragou, jogue fora.',
      ] },
      { type: 'calc', calc: 'foodDays' },
    ],
  },
  {
    id: 'abrigo', emoji: '⛺', title: 'Abrigo e fogo', summary: 'Proteção do tempo',
    blocks: [
      { type: 'steps', title: 'Abrigo', items: [
        'Local: seco, fora do vento, longe de encostas, leitos de rio e árvores secas.',
        'Isole do chão: o chão rouba calor mais rápido que o ar. Use folhas secas, papelão ou a mochila.',
        'Pequeno é melhor: menos espaço para aquecer.',
        'Lona ou capa de chuva amarrada entre árvores faz um telhado rápido.',
      ] },
      { type: 'steps', title: 'Fogo', items: [
        'Junte antes de acender: isca (papel, algodão, folha bem seca), gravetos finos e lenha.',
        'Comece pequeno e alimente devagar. Fogo precisa de ar.',
        'Faça longe de barracas e vegetação, com pedras ou terra em volta. Apague com água e terra antes de dormir ou sair.',
      ] },
      { type: 'dont', title: 'Não faça', items: ['Nunca acenda fogo, fogareiro ou braseiro em local fechado.'] },
    ],
  },
  {
    id: 'orientacao', emoji: '🧭', title: 'Orientação sem GPS', summary: 'Sol, sombra, estrelas e passos',
    blocks: [
      { type: 'steps', title: 'Pelo Sol', items: [
        'O Sol nasce do lado Leste e se põe do lado Oeste.',
        'Ao meio-dia, no Rio, o Sol fica do lado Norte quase o ano todo (em dezembro e começo de janeiro, quase a pino).',
        'Método da sombra: finque uma vara, marque a ponta da sombra, espere 15 minutos e marque de novo. A linha da 1ª para a 2ª marca aponta para o Leste.',
      ] },
      { type: 'steps', title: 'Pelo relógio de ponteiros (hemisfério Sul)', items: [
        'Aponte o número 12 para o Sol.',
        'O meio do caminho entre o 12 e o ponteiro das horas aponta para o Norte.',
      ] },
      { type: 'steps', title: 'Pelo Cruzeiro do Sul (à noite)', items: [
        'Ache a cruz de 4 estrelas brilhantes (há uma 5ª menor, a "Intrometida").',
        'Prolongue o braço maior da cruz, a partir do pé, 4 vezes e meia o seu tamanho.',
        'Desse ponto, desça uma linha reta até o horizonte: ali é o Sul.',
      ] },
      { type: 'steps', title: 'Contando passos', items: [
        'Meça em terreno plano quantos pares de passos você dá em 100 m (um adulto dá cerca de 60 a 70).',
        'Na mata e na subida o passo encurta: some uns 20%.',
        'Combine com a bússola: siga um rumo e conte a distância.',
      ] },
      { type: 'tip', text: 'Se o GPS "pular" para um lugar impossível, pode ser interferência. Confira com placas, rios, morros e o mapa offline antes de seguir.' },
    ],
  },
  {
    id: 'sinalizacao', emoji: '🪞', title: 'Sinalização para resgate', summary: 'Ser visto e ouvido',
    blocks: [
      { type: 'steps', title: 'Universal: tudo em 3', items: [
        '3 apitos, 3 flashes, 3 fogueiras em triângulo = pedido de socorro. Repita a cada minuto.',
        'Apito alcança muito mais longe que a voz e gasta menos energia.',
        'De dia, fumaça branca (folhas verdes no fogo) contrasta com a mata; de noite, fogo e luz.',
      ] },
      { type: 'steps', title: 'Espelho ou tela do celular', items: [
        'Estique o braço e faça um "V" com os dedos em direção ao alvo (avião, barco, casa).',
        'Reflita o sol nos dedos e mova o espelho até o reflexo passar pelo alvo.',
        'Brilho do espelho pode ser visto a muitos quilômetros.',
      ] },
      { type: 'steps', title: 'Sinais no chão (para aeronaves, letras grandes de 3 m ou mais)', items: [
        'V = preciso de ajuda.',
        'X = preciso de ajuda médica.',
        'Seta → = fui nesta direção.',
        'N = não. Y = sim.',
      ] },
    ],
  },
  {
    id: 'energia', emoji: '🔋', title: 'Bateria e energia solar', summary: 'Fazer o celular durar',
    blocks: [
      { type: 'steps', title: 'Economizar', items: [
        'Ative o modo bateria crítica do app (🔋) e o Modo Pouca Energia do iPhone.',
        'Modo avião quando não precisar de rede: o GPS continua funcionando.',
        'Brilho no mínimo legível. Tela escura gasta menos em iPhones com OLED.',
        'Combine horários com a família para ligar o celular (ex.: 5 minutos ao meio-dia e às 18h).',
        'Frio descarrega a bateria: guarde o celular junto ao corpo.',
      ] },
      { type: 'steps', title: 'Carregar com o sol', items: [
        'Ligue painel → power bank → celular. Direto no celular, cada nuvem interrompe a carga.',
        'Painel dobrável de uns 20 W com saída USB e power bank de 10.000 a 20.000 mAh.',
        'Painel virado para o sol, inclinado; ajuste a cada hora.',
        'O celular e o power bank na sombra: o iPhone para de carregar quando esquenta.',
      ] },
      { type: 'calc', calc: 'battery' },
    ],
  },
  {
    id: 'comunicacao', emoji: '📻', title: 'Comunicação', summary: 'Quando a rede falha',
    blocks: [
      { type: 'steps', title: 'O que funciona primeiro', items: [
        'SMS passa quando ligação e internet não passam. Mensagem curta, com local e situação.',
        'Combine um contato fora da cidade: ligações para longe às vezes completam quando as locais não.',
        'Rádio AM/FM a pilha ou manivela: as emissoras são a fonte oficial em apagões.',
        'Alertas da Defesa Civil: mande seu CEP por SMS para 40199 (grátis).',
      ] },
      { type: 'steps', title: 'Sem rede nenhuma', items: [
        'Rádios Meshtastic (LoRa) trocam mensagens de texto por quilômetros sem internet nem operadora, pareados ao celular por Bluetooth.',
        'iPhone 14 ou mais novo: veja em Ajustes se o SOS via satélite já está disponível no Brasil.',
        'Deixe recados combinados em pontos de encontro (papel em saco plástico).',
      ] },
    ],
  },
  {
    id: 'remedios', emoji: '💊', title: 'Remédios sem geladeira', summary: 'Insulina e uso contínuo',
    blocks: [
      { type: 'steps', title: 'Uso contínuo', items: [
        'Tenha reserva de pelo menos 2 semanas dos remédios de uso contínuo e a receita (foto e papel).',
        'Anote nomes, doses e horários na Ficha médica (Preparo).',
      ] },
      { type: 'steps', title: 'Insulina sem energia', items: [
        'A maioria das insulinas em uso aguenta cerca de 28 dias fora da geladeira, abaixo de 30 °C. Confira a bula da sua.',
        'Proteja do sol e do calor: caixa de isopor, pote de barro com pano úmido, local mais fresco da casa.',
        'Nunca congele. Insulina turva, com grumos ou cor diferente: não use.',
      ] },
    ],
  },
  {
    id: 'seguranca', emoji: '🛡️', title: 'Segurança e discrição', summary: 'Proteger você e o estoque',
    blocks: [
      { type: 'steps', title: 'Em crise prolongada', items: [
        'Não divulgue o que você tem guardado nem onde mora em redes sociais.',
        'Ande em grupo, de dia, por rotas conhecidas.',
        'Combine senhas com a família para confirmar mensagens e não cair em golpes.',
        'Este app não envia sua localização para lugar nenhum: só você decide quando compartilhar.',
      ] },
    ],
  },
];
