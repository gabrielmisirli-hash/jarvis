# Power Query (M)

## Princípios
- Existe no Excel (Dados > Obter Dados) e no Power BI, com a mesma linguagem M. Cada clique vira uma etapa; a consulta toda refaz ao clicar Atualizar.
- Defina os **tipos** de coluna logo no início e com a localidade certa: Alterar Tipo > Usando Localidade > Português (Brasil), senão "01/02/2025" vira 2 de janeiro e "1.234,56" vira texto.
- Remova colunas e filtre linhas o mais cedo possível; isso deixa a fonte (SQL) fazer o trabalho (dobramento de consulta). Botão direito na etapa > "Exibir consulta nativa" mostra se ainda está dobrando.
- Renomeie as etapas com nomes que digam o que fazem.
- Caminho de arquivo num **parâmetro**, nunca fixo em cada consulta.
- M diferencia maiúsculas e minúsculas: `Table.SelectRows`, não `table.selectrows`.

## Combinar arquivos de uma pasta
- Obter Dados > De Arquivo > De Pasta > Combinar e Transformar. Ele cria uma função de exemplo aplicada a cada arquivo.
- Todos os arquivos precisam ter a mesma estrutura; filtre a coluna `Extension` (`.xlsx`) e exclua temporários que começam com `~$`.
- Guarde a coluna `Source.Name` para saber de que arquivo veio cada linha (útil para extrair mês do nome).
- Arquivos em SharePoint/OneDrive: use o conector SharePoint Folder com a URL do site, não o caminho sincronizado local.

## Transformações que resolvem quase tudo
- **Remover dinamização de colunas** (Unpivot): meses lado a lado viram linhas `Mês | Valor`. Selecione as colunas fixas > botão direito > Remover dinamização das outras colunas.
- **Dinamizar coluna** (Pivot) faz o inverso; escolha "Não agregar" quando cada célula é única.
- **Mesclar consultas** = PROCV/JOIN. Tipos: Externa esquerda (padrão), Interna, Anti esquerda (o que não casou — ótimo para auditoria).
- **Acrescentar consultas** = empilhar tabelas com as mesmas colunas.
- **Preencher abaixo** para relatórios em que a categoria aparece só na primeira linha.
- **Agrupar por** para totais antes de carregar.
- **Coluna a partir de exemplos**: digite o resultado esperado e ele escreve o M.
- Cabeçalhos duplicados/promover: Usar Primeira Linha como Cabeçalho.

## Trechos de M úteis
```m
// filtrar e tipar com localidade brasileira
Filtrado = Table.SelectRows(Origem, each [Status] = "Ativo" and [Valor] > 0),
Tipado = Table.TransformColumnTypes(Filtrado, {{"Data", type date}, {"Valor", type number}}, "pt-BR"),

// coluna condicional
Faixa = Table.AddColumn(Tipado, "Faixa", each if [Valor] >= 1000 then "Alto" else "Normal", type text),

// tratar erro numa coluna
SemErro = Table.ReplaceErrorValues(Faixa, {{"Valor", 0}}),

// limpar texto
Limpo = Table.TransformColumns(SemErro, {{"Cliente", each Text.Proper(Text.Trim(_)), type text}})
```
- Calendário em M: `List.Dates(#date(2024,1,1), 731, #duration(1,0,0,0))` e depois Para Tabela.
- `try ... otherwise` para valores que às vezes falham: `each try Number.From([x]) otherwise null`.

## Erros comuns
- "A coluna X da tabela não foi encontrada": a fonte renomeou ou removeu uma coluna; a etapa Tipo Alterado gerada automaticamente cita colunas pelo nome. Ajuste a etapa ou remova colunas pelo que manter, não pelo que tirar.
- DataFormat.Error: valor que não converte no tipo — quase sempre localidade errada; use "Usando Localidade".
- Formula.Firewall (privacidade): consultas combinando fontes de níveis diferentes. Arquivo > Opções > Privacidade, ou referencie fontes em consultas separadas.
- Atualização lenta: dobramento quebrou cedo (uma etapa como Adicionar Índice antes do filtro), ou a mesma fonte é lida várias vezes. Use `Table.Buffer` com cuidado e só em tabelas pequenas.
- Carregar só como conexão as consultas intermediárias (botão direito > Carregar para > Apenas Criar Conexão).
