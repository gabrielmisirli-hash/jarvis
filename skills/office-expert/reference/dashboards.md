# Dashboards

## Princípios
- Comece pela **pergunta** e por quem decide: cada indicador responde a uma decisão. Se ninguém agiria diferente vendo o número, ele não entra.
- Regra dos 5 segundos: o leitor precisa saber se está bom ou ruim sem ler legenda.
- Todo número precisa de **comparação**: meta, período anterior ou média. "R$ 1,2 mi" sozinho não diz nada; "R$ 1,2 mi, 8% acima da meta" diz.
- Poucos indicadores (3 a 6 KPIs) no topo, detalhe abaixo, detalhe do detalhe em outra página ou no drill.
- Um dashboard por público: diretoria (tendência e exceções) não é operação (lista do que fazer hoje).
- Dados com data de atualização visível no canto.

## Layout
- Leitura em Z: KPIs no topo da esquerda para a direita, tendência no meio, detalhe/tabela embaixo.
- Filtros (segmentações) num só lugar, à esquerda ou no topo, sempre visíveis.
- Grade alinhada, espaçamento igual, margens generosas; nada de visual encostado em outro.
- Cartão de KPI: valor grande, rótulo curto, variação colorida (▲ verde / ▼ vermelho) e um minigráfico de tendência.
- Proporção da tela de quem vai abrir (16:9 no notebook, retrato no celular — o Power BI tem layout móvel próprio).

## Escolha do gráfico
- Evolução no tempo: **linha** (colunas se forem poucos períodos).
- Comparar categorias: **barras horizontais** ordenadas do maior para o menor; nomes longos cabem.
- Parte do todo: barras empilhadas 100% ou um único número em %; **pizza só com 2 ou 3 fatias**.
- Meta vs realizado: bullet chart, ou coluna com linha de meta.
- Composição da variação (ponte de resultado): cascata.
- Relação entre duas medidas: dispersão.
- Geografia: mapa só quando a localização importa para a decisão; senão, barras por região.
- Muitos números exatos: tabela/matriz com formatação condicional, não gráfico.
- Evite: 3D, eixo que não começa no zero em barras, dois eixos Y, velocímetro.

## Cores e formatação
- Uma cor neutra (cinza) para o normal e **uma** cor de destaque para o que pede atenção.
- Verde/vermelho só para bom/ruim, e nunca como única pista (daltonismo): use também ▲▼ ou texto.
- Mesma categoria, mesma cor em todos os visuais.
- Números formatados para leitura: `R$ 1,2 mi`, `12,5%`, sem casas decimais inúteis. No Excel: formato `[>=1000000]R$ #.##0,0.. "mi";[>=1000]R$ #.##0, "mil";R$ #.##0`.
- Remova linhas de grade, bordas, rótulos de eixo redundantes; rótulo de dados direto na barra substitui o eixo.
- Título que diz a conclusão ("Sul puxou o crescimento") vale mais que título que diz o conteúdo ("Vendas por região").

## Dashboard no Excel
1. Dados numa Tabela (ou no Modelo de Dados via Power Query).
2. Uma aba "Cálculos" com tabelas dinâmicas, uma por visual; nunca construa o painel sobre dados soltos.
3. Gráficos dinâmicos a partir delas, levados para a aba "Painel" (sem linhas de grade: Exibir > desmarcar Linhas de Grade).
4. Segmentações e Linha do Tempo conectadas a todas as dinâmicas (botão direito > Conexões de Relatório).
5. KPIs em células grandes que leem das dinâmicas com `INFODADOSTABELADINÂMICA` ou de medidas com `CUBEVALOR`.
6. Formatação condicional (barras de dados, ícones) para tabelas de detalhe.
7. Proteja a aba Painel deixando segmentações utilizáveis; Atualizar Tudo (Ctrl+Alt+F5) ao abrir.

## Dashboard no Power BI
- Uma página = uma pergunta; navegação por botões e indicadores (bookmarks).
- Drill-through: página de detalhe que recebe o filtro de um clique com o botão direito.
- Dicas de ferramenta (tooltip) como página: mostra um minirrelatório ao passar o mouse.
- Interações entre visuais: Formatar > Editar interações, para que um filtro não desmonte o visual errado.
- Tema JSON com as cores da empresa (Exibir > Temas > Personalizar).
- Medidas de título e de rótulo dinâmicas (`SELECTEDVALUE`) para o texto acompanhar o filtro.
- Publicar num workspace, atualização agendada, e compartilhar via aplicativo, não por arquivo.

## Checklist antes de entregar
- Os números batem com a fonte oficial num caso conferido à mão?
- Todo KPI tem comparação e direção (bom/ruim) clara?
- Filtros limpos mostram o total certo; com filtro, os visuais respondem como esperado?
- Data de atualização visível; atualização automática testada?
- Funciona na tela de quem vai usar (notebook, projetor, celular)?
- Alguém que não construiu o painel entende sem explicação em 1 minuto?
