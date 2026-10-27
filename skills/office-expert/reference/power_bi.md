# Power BI e DAX

## Princípios
- Modelo **estrela**: tabelas fato (vendas, eventos) no centro, dimensões (Cliente, Produto, Calendário) em volta, relação 1:N com filtro em direção única.
- Sempre uma tabela **Calendário** própria, marcada como tabela de datas, ligada à data da fato. Desligue "Data/hora automática" em Opções.
- **Medidas** para tudo que é agregado; coluna calculada só quando precisa fatiar/filtrar por ela.
- Faça transformação no Power Query, não em DAX. Regra de Roche: o mais cedo possível na cadeia.
- DAX usa nomes em inglês e vírgula como separador, mesmo com Office em português (a menos que "Usar separadores DAX locais" esteja ligado em Opções > Regionais; então é `;`).
- Nomeie medidas como frases (`Vendas Total`, `Margem %`) e guarde-as numa tabela vazia "_Medidas".

## DAX essencial
```dax
Vendas Total = SUM ( Vendas[Valor] )
Qtde Pedidos = DISTINCTCOUNT ( Vendas[Pedido] )
Ticket Médio = DIVIDE ( [Vendas Total], [Qtde Pedidos] )
Vendas Sul = CALCULATE ( [Vendas Total], Loja[Região] = "Sul" )
Vendas Todas Regiões = CALCULATE ( [Vendas Total], REMOVEFILTERS ( Loja[Região] ) )
```
- `DIVIDE` em vez de `/`: trata divisão por zero.
- `CALCULATE` muda o contexto de filtro: cada argumento de filtro substitui o filtro existente naquela coluna. `KEEPFILTERS` para intersectar em vez de substituir.
- `VAR` ... `RETURN` para legibilidade e para não calcular duas vezes.

## Inteligência de tempo
Exigem a tabela Calendário marcada como tabela de datas.
```dax
Vendas Acum Ano = TOTALYTD ( [Vendas Total], Calendario[Data] )
Vendas Ano Ant = CALCULATE ( [Vendas Total], SAMEPERIODLASTYEAR ( Calendario[Data] ) )
Cresc % = DIVIDE ( [Vendas Total] - [Vendas Ano Ant], [Vendas Ano Ant] )
Vendas Mês Ant = CALCULATE ( [Vendas Total], DATEADD ( Calendario[Data], -1, MONTH ) )
Média Móvel 3M =
    AVERAGEX ( DATESINPERIOD ( Calendario[Data], MAX ( Calendario[Data] ), -3, MONTH ), [Vendas Total] )
```
Calendário em DAX: `Calendario = ADDCOLUMNS ( CALENDARAUTO (), "Ano", YEAR ( [Date] ), "Mês", FORMAT ( [Date], "mmm" ), "MêsNum", MONTH ( [Date] ) )` — ordene "Mês" por "MêsNum" (Ferramentas de coluna > Classificar por coluna).

## Padrões frequentes
```dax
% do Total = DIVIDE ( [Vendas Total], CALCULATE ( [Vendas Total], ALLSELECTED ( Produto ) ) )
Ranking Produto = RANKX ( ALLSELECTED ( Produto[Nome] ), [Vendas Total], , DESC, DENSE )
Acumulado =
    VAR d = MAX ( Calendario[Data] )
    RETURN CALCULATE ( [Vendas Total], Calendario[Data] <= d, ALLSELECTED ( Calendario ) )
Clientes Novos =
    COUNTROWS ( FILTER ( VALUES ( Vendas[Cliente] ),
        CALCULATE ( MIN ( Vendas[Data] ), ALL ( Calendario ) ) >= MIN ( Calendario[Data] ) ) )
Meta Atingida = IF ( [Vendas Total] >= [Meta], "✔", "✖" )
```
- Pareto/ABC: ranking + acumulado de % e `SWITCH ( TRUE (), x <= 0.8, "A", x <= 0.95, "B", "C" )`.
- Título dinâmico: `"Vendas de " & SELECTEDVALUE ( Loja[Região], "todas as regiões" )`.

## Contexto e armadilhas
- Contexto de **linha** (coluna calculada, iteradores `SUMX`, `FILTER`) não filtra nada sozinho; `CALCULATE` faz a transição para contexto de filtro.
- Total da tabela "errado": o total recalcula a medida no contexto total, não soma as linhas. Para somar linhas: `SUMX ( VALUES ( Produto[Nome] ), [Medida] )`.
- `FILTER ( Tabela, ... )` em tabela fato inteira é lento; filtre colunas: `CALCULATE ( [m], Vendas[Valor] > 100 )`.
- Relação muitos-para-muitos ou bidirecional gera ambiguidade; prefira uma tabela ponte e `CROSSFILTER` dentro da medida quando precisar.
- `ALL` ignora filtros de segmentação; `ALLSELECTED` respeita o que o usuário escolheu na página.
- Valores em branco somem do visual; `+ 0` força a aparecer, mas pode criar milhares de linhas vazias.

## Desempenho e boas práticas
- Tamanho do modelo depende da **cardinalidade**: remova colunas que ninguém usa, separe data e hora, arredonde decimais, troque IDs texto por inteiros.
- Importação é o padrão; DirectQuery só quando os dados não podem sair da fonte ou precisam ser em tempo real.
- Analisador de Desempenho (Exibir > Analisador de desempenho) mostra o tempo de cada visual e a consulta DAX; DAX Studio para aprofundar.
- Atualização agendada no serviço exige gateway para fontes locais (arquivos na rede, SQL interno).
- Segurança por linha (RLS): Modelagem > Gerenciar funções, filtro `[Email] = USERPRINCIPALNAME ()`.
- Versionar: salve como `.pbip` (projeto) para ter o modelo em texto e usar Git.
