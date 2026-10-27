# Excel

## Princípios
- Office em pt-BR: nomes de função em português e `;` entre argumentos. Vírgula é decimal: `=ARRED(A2*1,5;2)`.
- Dados em **Tabela** (Ctrl+Alt+T), uma linha por registro, uma coluna por atributo, sem células mescladas e sem linhas em branco no meio. Referência estruturada: `=SOMA(Vendas[Valor])`.
- Prefira `PROCX` a `PROCV`; matrizes dinâmicas (`FILTRO`, `ÚNICO`) a fórmulas copiadas mil linhas abaixo.
- `LET` para nomear partes de uma fórmula longa; `LAMBDA` em Gerenciador de Nomes para reaproveitar.
- Nunca digite um número fixo dentro de fórmula: ponha numa célula de parâmetro e referencie.
- Função deu `#NOME?`: o nome em português difere ou a versão do Excel não tem a função. Shift+F3 abre o assistente com os nomes locais.

## Nomes das funções em português
PROCV=VLOOKUP, PROCH=HLOOKUP, PROCX=XLOOKUP, CORRESP=MATCH, CORRESPX=XMATCH, ÍNDICE=INDEX, DESLOC=OFFSET, INDIRETO=INDIRECT, ESCOLHER=CHOOSE.
SE=IF, SES=IFS, SEERRO=IFERROR, SENÃODISP=IFNA, E=AND, OU=OR, NÃO=NOT.
SOMASE=SUMIF, SOMASES=SUMIFS, CONT.SE=COUNTIF, CONT.SES=COUNTIFS, MÉDIASES=AVERAGEIFS, MÁXIMOSES=MAXIFS, MÍNIMOSES=MINIFS, SOMARPRODUTO=SUMPRODUCT, CONT.VALORES=COUNTA, CONT.NÚM=COUNT, SUBTOTAL, AGREGAR=AGGREGATE.
FILTRO=FILTER, ÚNICO=UNIQUE, CLASSIFICAR=SORT, CLASSIFICARPOR=SORTBY, SEQUÊNCIA=SEQUENCE, EMPILHARV=VSTACK, EMPILHARH=HSTACK, LET, LAMBDA.
TEXTO=TEXT, CONCAT, UNIRTEXTO=TEXTJOIN, ESQUERDA=LEFT, DIREITA=RIGHT, EXT.TEXTO=MID, NÚM.CARACT=LEN, ARRUMAR=TRIM, SUBSTITUIR=SUBSTITUTE, PROCURAR=FIND, LOCALIZAR=SEARCH, VALOR=VALUE, DIVIDIRTEXTO=TEXTSPLIT.
HOJE=TODAY, AGORA=NOW, DATA=DATE, ANO, MÊS, DIA, DIA.DA.SEMANA=WEEKDAY, NÚMSEMANA=WEEKNUM, FIMMÊS=EOMONTH, DATAM=EDATE, DIATRABALHOTOTAL=NETWORKDAYS, DATADIF.
ARRED=ROUND, ARREDONDAR.PARA.CIMA=ROUNDUP, ARREDONDAR.PARA.BAIXO=ROUNDDOWN, ÉERRO=ISERROR, ÉNÚM=ISNUMBER, ÉCÉL.VAZIA=ISBLANK.

## Pesquisa e cruzamento de dados
- Padrão moderno: `=PROCX(A2;Clientes[ID];Clientes[Nome];"Não encontrado")`. Busca à esquerda, valor padrão embutido, sem número de coluna que quebra ao inserir colunas.
- Duas chaves: `=PROCX(1;(T[Loja]=F2)*(T[Mês]=G2);T[Valor])`.
- Último registro: `=PROCX(F2;T[Cliente];T[Data];;0;-1)` (modo de pesquisa -1, de baixo para cima).
- Sem PROCX (Excel 2016/2019): `=ÍNDICE(C:C;CORRESP(A2;A:A;0))`.
- PROCV só com `FALSO` no fim: `=PROCV(A2;Tabela;3;FALSO)`. Sem ele a busca é aproximada e devolve valores errados sem aviso.
- Contar/somar por critérios: `=SOMASES(T[Valor];T[Região];"Sul";T[Data];">="&H1)`. Critério de data sempre concatenado com a célula.

## Matrizes dinâmicas
- `=FILTRO(Vendas;Vendas[Região]="Sul";"Nada")` — várias condições: `(cond1)*(cond2)` para E, `(cond1)+(cond2)` para OU.
- `=CLASSIFICAR(ÚNICO(Vendas[Cliente]))` lista de clientes sem repetição, ordenada.
- Top 5: `=PEGAR(CLASSIFICARPOR(T[Cliente];T[Valor];-1);5)`; sem PEGAR, `=ÍNDICE(CLASSIFICARPOR(...);SEQUÊNCIA(5);1)`.
- Referenciar o resultado inteiro com `#`: `=CONT.VALORES(E2#)`.
- `#DESPEJO!` = há algo no caminho do resultado; limpe as células abaixo/à direita.
- `LET`: `=LET(v;T[Valor];m;MÉDIA(v);FILTRO(T[Cliente];v>m))`.

## Datas e texto
- Data é número; se `=ÉNÚM(A2)` dá FALSO, é texto. Converter: Dados > Texto para Colunas > Data DMA, ou `=DATA(DIREITA(A2;4);EXT.TEXTO(A2;4;2);ESQUERDA(A2;2))`.
- Primeiro dia do mês: `=FIMMÊS(A2;-1)+1`. Último: `=FIMMÊS(A2;0)`.
- Mês por extenso: `=TEXTO(A2;"mmmm")`; ano-mês para agrupar: `=TEXTO(A2;"aaaa-mm")`.
- Dias úteis com feriados: `=DIATRABALHOTOTAL(A2;B2;Feriados[Data])`.
- Idade/tempo de casa: `=DATADIF(A2;HOJE();"a")` (função oculta, não aparece no assistente).
- Limpar texto importado: `=ARRUMAR(SUBSTITUIR(A2;CARACT(160);" "))` remove espaço não separável.
- Número que veio como texto com R$: `=VALOR(SUBSTITUIR(SUBSTITUIR(A2;"R$";"");".";""))`.

## Tabela dinâmica
- Origem sempre numa Tabela, para crescer sozinha; atualizar com Alt+F5 (Ctrl+Alt+F5 atualiza tudo).
- Agrupar datas: botão direito no campo > Agrupar > Meses e Anos.
- "Mostrar valores como" > % do Total Geral, % da linha pai, Diferença de: análises sem fórmula.
- Campo calculado só soma e divide totais; para lógica real, use Power Pivot com medida DAX (Inserir > Tabela Dinâmica > Adicionar ao Modelo de Dados).
- Ler valor de dentro dela: `=INFODADOSTABELADINÂMICA("Valor";$A$3;"Região";"Sul")`.
- Segmentação de dados (Slicer) e Linha do Tempo filtram várias tabelas dinâmicas: botão direito > Conexões de Relatório.

## Erros comuns e diagnóstico
- `#N/D`: chave não encontrada. Causas: espaço sobrando (`ARRUMAR`), número vs texto (`=A2&""` ou `VALOR`), PROCV sem `FALSO`.
- `#VALOR!`: texto onde se esperava número, ou matrizes de tamanhos diferentes.
- `#REF!`: linha/coluna referenciada foi excluída.
- `#DIV/0!`: `=SEERRO(A2/B2;0)`, mas melhor `=SE(B2=0;"";A2/B2)` para não esconder outros erros.
- `#NOME?`: nome de função em inglês ou digitado errado, ou intervalo nomeado inexistente.
- Fórmula aparece como texto: célula formatada como Texto; mude para Geral e reedite (F2, Enter).
- Resultado não atualiza: Fórmulas > Opções de Cálculo > Automático.
- Avaliar Fórmula (Fórmulas > Avaliar Fórmula) mostra passo a passo; F9 sobre um trecho selecionado mostra o valor dele.

## Desempenho
- Evite funções voláteis em massa: `INDIRETO`, `DESLOC`, `HOJE`, `AGORA`, `ALEATÓRIO` recalculam a cada mudança.
- Nunca colunas inteiras em `SOMARPRODUTO` ou fórmulas de matriz; use a Tabela.
- Muitos PROCX na mesma chave: calcule `CORRESPX` uma vez numa coluna auxiliar e use `ÍNDICE` nas outras.
- Mais de algumas centenas de milhares de linhas: leve os dados para o Power Query/Power Pivot, não para a planilha.
- Arquivo pesado: formatação condicional duplicada (Gerenciar Regras), estilos e nomes órfãos, imagens. Salvar como `.xlsb` reduz tamanho e acelera.
