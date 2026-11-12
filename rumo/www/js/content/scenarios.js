// Cenários "Faça agora": passos curtos para os primeiros minutos de cada tipo de crise.
// Baseados em orientações de Defesa Civil, Corpo de Bombeiros e CDC/FEMA. Revise com especialistas antes de distribuir.

export const SCENARIOS = [
  {
    id: 'enchente', emoji: '🌊', title: 'Enchente / alagamento', summary: 'Água subindo em casa ou na rua',
    blocks: [
      { type: 'steps', title: 'Agora', items: [
        'Água subindo: vá já para o ponto mais alto (andar de cima, laje). Não espere chegar na cintura.',
        'Se der para fazer sem pisar na água, desligue a energia no quadro de luz e feche o gás.',
        'Leve: documentos, remédios, água, power bank, lanterna, apito. Use a mochila de emergência.',
        'Mande SMS para a família com sua posição (aba SOS).',
        'Ilhado? Sinalize: pano claro na janela, lanterna ou tela piscando à noite, 3 apitos. Ligue 193.',
      ] },
      { type: 'dont', title: 'Não faça', items: [
        'Não ande nem dirija em água correndo: 15 cm derrubam uma pessoa e 30 cm arrastam um carro.',
        'Não entre em água perto de fios ou postes caídos.',
        'Não volte para casa antes da liberação da Defesa Civil.',
      ] },
      { type: 'steps', title: 'Depois', items: [
        'Não beba água da torneira até ser liberada. Desinfete a água (Guias › Água).',
        'Jogue fora alimentos que tocaram a água da enchente, inclusive enlatados amassados.',
        'Use botas e luvas na limpeza (risco de leptospirose). Febre e dor na batata da perna nos dias seguintes: procure atendimento.',
      ] },
    ],
  },
  {
    id: 'deslizamento', emoji: '⛰️', title: 'Deslizamento de terra', summary: 'Encosta, morro, chuva forte',
    blocks: [
      { type: 'tip', text: 'Sinais de perigo: rachaduras novas em paredes ou no chão, portas e janelas emperrando, árvores e postes inclinando, água barrenta brotando do chão, estalos ou ronco vindo do morro.' },
      { type: 'steps', title: 'Agora', items: [
        'Ouviu sirene da Defesa Civil ou viu os sinais? Saia imediatamente para o ponto de apoio da sua comunidade.',
        'Afaste-se da encosta e também do caminho por onde a lama desceria (vales, canaletas).',
        'Avise vizinhos. Não pare para pegar objetos.',
        'Ligue 199 (Defesa Civil) ou 193 (Bombeiros) quando estiver seguro.',
      ] },
      { type: 'dont', title: 'Não faça', items: [
        'Não volte para buscar nada enquanto chove forte.',
        'Não fique dentro de casa "esperando passar" em área de risco.',
      ] },
      { type: 'tip', text: 'Cadastre seu CEP por SMS no 40199 para receber alertas da Defesa Civil.' },
    ],
  },
  {
    id: 'incendio', emoji: '🔥', title: 'Incêndio', summary: 'Casa, prédio ou mata',
    blocks: [
      { type: 'steps', title: 'Agora', items: [
        'Grite "FOGO!" e saia já. Não junte objetos.',
        'Fumaça: abaixe-se e ande rente ao chão, com pano (de preferência molhado) no nariz e na boca.',
        'Antes de abrir uma porta, toque nela com as costas da mão. Quente? Não abra; use outra saída.',
        'Prédio: use a escada. Nunca o elevador.',
        'Sem saída: feche a porta, tape as frestas com panos molhados, vá para a janela e sinalize. Ligue 193.',
        'Roupa pegando fogo: PARE, DEITE e ROLE no chão, cobrindo o rosto com as mãos.',
      ] },
      { type: 'dont', title: 'Não faça', items: [
        'Não volte para dentro por nenhum motivo.',
        'Não jogue água em fogo de óleo ou de aparelho elétrico ligado. Óleo: abafe com tampa ou pano úmido.',
      ] },
      { type: 'tip', text: 'Incêndio na mata: afaste-se no sentido contrário ao vento e morro abaixo (o fogo sobe mais rápido). Procure área já queimada, de pedra ou de água.' },
    ],
  },
  {
    id: 'apagao', emoji: '🔌', title: 'Apagão prolongado', summary: 'Sem luz por horas ou dias',
    blocks: [
      { type: 'steps', title: 'Agora', items: [
        'Ative o modo bateria crítica (botão 🔋 no topo) e o Modo Pouca Energia do iPhone.',
        'Tire aparelhos da tomada (o pico na volta da luz queima eletrônicos). Deixe uma lâmpada ligada para saber quando voltar.',
        'Geladeira fechada mantém frio por cerca de 4 horas; congelador cheio, cerca de 48 horas. Abra o mínimo possível.',
        'Prédio com bomba d\'água: economize a água da caixa desde já.',
        'Notícias: rádio a pilha ou a manivela. Celular: ligue em horários combinados para economizar.',
      ] },
      { type: 'dont', title: 'Não faça', items: [
        'Nunca use gerador, churrasqueira ou fogareiro dentro de casa ou garagem: o monóxido de carbono mata sem cheiro.',
        'Evite velas. Se usar, longe de cortinas e nunca dormindo.',
      ] },
      { type: 'tip', text: 'Remédios que vão à geladeira (como insulina): veja Guias › Remédios sem geladeira.' },
    ],
  },
  {
    id: 'ciber', emoji: '💻', title: 'Ataque cibernético / sem internet', summary: 'Bancos, Pix e apps fora do ar',
    blocks: [
      { type: 'steps', title: 'Agora', items: [
        'Conte com bancos, Pix, cartões e aplicativos parados por dias. Tenha dinheiro em espécie, em notas pequenas.',
        'Abasteça o carro e garanta água e comida para pelo menos 3 dias.',
        'A rede de celular pode cair junto. Use SMS curtos e combine horários para ligar.',
        'Hospitais e serviços podem funcionar no papel: leve sua ficha médica impressa (Preparo › Kit em papel).',
        'O GPS pode falhar ou mostrar posição errada. Se a posição "pular", confie no mapa offline, na bússola e nas placas.',
      ] },
      { type: 'dont', title: 'Não faça', items: [
        'Não clique em links nem instale apps "de emergência" enviados por mensagem. Golpes explodem em crises.',
        'Não espalhe boatos. Confirme no rádio, na TV aberta ou em canais oficiais da Defesa Civil.',
      ] },
    ],
  },
  {
    id: 'tiroteio', emoji: '🚨', title: 'Tiroteio / conflito armado', summary: 'Disparos perto de você',
    blocks: [
      { type: 'steps', title: 'Agora', items: [
        'Ouviu tiros: abaixe-se e deite no chão imediatamente.',
        'Procure proteção atrás de parede de concreto ou alvenaria. Porta de carro não segura bala; o bloco do motor protege mais.',
        'Em casa: vá para o cômodo mais interno, longe de janelas e portas, e fique deitado.',
        'Coloque o celular no silencioso. Avise a família por SMS, sem ligar.',
        'Só se levante quando tiver certeza de que acabou. Espere mais alguns minutos.',
      ] },
      { type: 'dont', title: 'Não faça', items: [
        'Não vá à janela olhar nem filmar.',
        'Não corra em linha reta por área aberta se puder ficar abrigado.',
      ] },
      { type: 'tip', text: 'Em guerra: afaste-se de possíveis alvos (quartéis, pontes, centrais de energia, antenas), siga as orientações oficiais de abrigo e não divulgue sua localização nem movimentos em redes sociais.' },
    ],
  },
  {
    id: 'quimico', emoji: '☢️', title: 'Vazamento químico ou radiológico', summary: 'Nuvem tóxica, explosão, acidente',
    blocks: [
      { type: 'steps', title: 'Agora: entre, fique, informe-se', items: [
        'Entre no prédio mais próximo, de preferência de concreto. Feche portas e janelas, desligue ar-condicionado e ventiladores.',
        'Químico (gás, cloro, amônia): vá para um cômodo interno de andar alto; muitos gases tóxicos são mais pesados que o ar.',
        'Radiológico: vá para o centro do prédio, no subsolo ou andar do meio, longe das paredes externas e do telhado.',
        'Esteve na rua? Tire a roupa de cima e coloque num saco fechado (isso remove a maior parte da contaminação). Tome banho com água e sabão, sem esfregar forte e sem condicionador.',
        'Fique abrigado pelo menos 24 horas ou até ordem oficial. Ouça o rádio.',
      ] },
      { type: 'dont', title: 'Não faça', items: [
        'Não tome iodeto de potássio por conta própria: só com ordem das autoridades (protege só a tireoide).',
        'Não saia para "ver o que houve" nem para buscar ninguém durante a nuvem.',
      ] },
      { type: 'tip', text: 'Moradores perto das usinas de Angra dos Reis: conheça o plano de emergência e as rotas de saída da Defesa Civil.' },
    ],
  },
  {
    id: 'perdido', emoji: '🌲', title: 'Perdido na mata', summary: 'Trilha, estrada ou área rural',
    blocks: [
      { type: 'steps', title: 'P.A.R.E.', items: [
        'Pare: sente, respire, beba água. Pânico gasta energia e gera decisões ruins.',
        'Avalie: tem água, comida, roupa, bateria? Quanto falta para escurecer? (aba Bússola mostra a luz restante)',
        'Reflita: alguém sabe onde você está? Se sim, ficar parado costuma ser melhor: é mais fácil achar quem não se move.',
        'Escolha: ficar e sinalizar, ou seguir com a bússola até um destino conhecido ou de volta pela trilha gravada.',
      ] },
      { type: 'steps', title: 'Se for passar a noite', items: [
        'Faça abrigo antes de escurecer: fora do vento, isolado do chão com folhas secas ou mochila.',
        'Sinalize: 3 apitos, 3 fogueiras em triângulo, roupa colorida em local aberto.',
        'Economize bateria: modo avião (o GPS continua funcionando) e ligue só para checar a posição.',
      ] },
      { type: 'dont', title: 'Não faça', items: [
        'Não ande à noite.',
        'Não desça córregos por cachoeiras ou pedras molhadas; siga pela margem.',
      ] },
    ],
  },
  {
    id: 'tempestade', emoji: '⛈️', title: 'Vendaval e raios', summary: 'Tempestade forte',
    blocks: [
      { type: 'steps', title: 'Agora', items: [
        'Fique em local fechado e firme, longe de janelas e vidros.',
        'Tire aparelhos da tomada.',
        'Na rua, sem abrigo: agache com os pés juntos, longe de árvores, postes e áreas abertas. Dentro do carro fechado você está protegido de raios.',
      ] },
      { type: 'dont', title: 'Não faça', items: [
        'Não se abrigue sob árvores, marquises, placas ou postes.',
        'Não fique na praia, no mar ou em piscina com raios.',
      ] },
    ],
  },
  {
    id: 'evacuar', emoji: '🎒', title: 'Preciso sair de casa', summary: 'Evacuação rápida',
    blocks: [
      { type: 'steps', title: 'Em 10 minutos', items: [
        'Pegue a mochila de emergência, documentos, remédios, carregadores e power bank.',
        'Feche o gás, desligue a luz no quadro e feche o registro de água.',
        'Mande SMS para a família dizendo para onde vai (aba SOS › Indo para o ponto de encontro).',
        'Vá pela rota planejada até o ponto de encontro. No mapa, toque no ponto e use "Seguir com a bússola".',
        'Leve animais com coleira ou caixa, água e ração.',
      ] },
      { type: 'dont', title: 'Não faça', items: [
        'Não pegue atalhos desconhecidos nem atravesse áreas alagadas.',
        'Não anuncie em redes sociais que a casa ficou vazia.',
      ] },
    ],
  },
];
