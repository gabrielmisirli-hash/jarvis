# Programação para Office e dados

## Escolha da ferramenta
- Tarefa repetida dentro de uma planilha, para quem só tem Excel: **VBA** (desktop) ou **Office Scripts** (Excel na web, TypeScript).
- Juntar e limpar dados que chegam todo mês: **Power Query** — sem código para manter.
- Fluxo entre aplicativos (e-mail chegou → salva anexo → atualiza planilha → avisa no Teams): **Power Automate**.
- Volume grande, lógica complexa, integração com API ou banco, ou roda sem ninguém olhando: **Python**.
- Dados que vivem num banco: **SQL** na fonte, e o Excel/Power BI só lê o resultado.
- Regra prática: a solução mais simples que o próximo responsável consegue manter.

## Python com Excel
```python
import pandas as pd

df = pd.read_excel("vendas.xlsx", sheet_name="Base", dtype={"CNPJ": str})
df["Data"] = pd.to_datetime(df["Data"], dayfirst=True)
resumo = (df.groupby([df["Data"].dt.to_period("M"), "Região"])["Valor"]
            .sum().unstack(fill_value=0))
with pd.ExcelWriter("resumo.xlsx", engine="openpyxl") as w:
    resumo.to_excel(w, sheet_name="Resumo")
```
- `pandas` para dados; `openpyxl` para formatar, fórmulas e manter um modelo existente; `xlwings` para controlar o Excel aberto (e chamar Python de dentro do Excel); `python-docx` e `python-pptx` para Word e PowerPoint.
- Ler CSV brasileiro: `pd.read_csv(f, sep=";", decimal=",", thousands=".", encoding="latin-1")` (ou `utf-8-sig`).
- Gravar CSV que o Excel pt-BR abre certo: `df.to_csv(f, sep=";", decimal=",", index=False, encoding="utf-8-sig")`.
- CNPJ, CPF, CEP e códigos com zero à esquerda: leia sempre como `str`.
- O Excel 365 também tem `=PY()` (Python no Excel), que roda na nuvem da Microsoft.

## SQL para análise
```sql
SELECT r.nome AS regiao,
       DATE_TRUNC('month', v.data) AS mes,
       SUM(v.valor) AS total,
       SUM(v.valor) / SUM(SUM(v.valor)) OVER (PARTITION BY DATE_TRUNC('month', v.data)) AS pct_mes
FROM vendas v
JOIN regioes r ON r.id = v.regiao_id
WHERE v.data >= DATE '2025-01-01'
GROUP BY r.nome, DATE_TRUNC('month', v.data)
ORDER BY mes, total DESC;
```
- `JOIN` = PROCV; `GROUP BY` = tabela dinâmica; funções de janela (`OVER`, `ROW_NUMBER`, `LAG`) = acumulado, ranking e mês anterior sem subconsulta.
- No SQL Server, mês é `DATEFROMPARTS(YEAR(data), MONTH(data), 1)` e limite é `TOP 10`; no PostgreSQL/MySQL, `LIMIT 10`.
- Filtre por intervalo de datas (`>=` início e `<` dia seguinte ao fim), não com função sobre a coluna, para usar o índice.

## Office Scripts e Power Automate
```typescript
function main(workbook: ExcelScript.Workbook) {
  const tabela = workbook.getTable("Vendas");
  const valores = tabela.getColumnByName("Valor").getRangeBetweenHeaderAndTotal().getValues();
  const total = valores.reduce((s, [v]) => s + (v as number), 0);
  workbook.getWorksheet("Resumo").getRange("B2").setValue(total);
}
```
- Office Scripts (guia Automatizar no Excel web) é o substituto moderno do VBA para arquivos no OneDrive/SharePoint; não acessa o disco local.
- Power Automate chama o script com a ação "Executar script": agende ou dispare por e-mail, formulário ou arquivo novo.

## Boas práticas de código
- Nomes que dizem o que é (`total_por_regiao`, não `x2`); funções pequenas com uma responsabilidade.
- Nunca senha ou token dentro do código: variável de ambiente ou cofre.
- Versionar com Git, mesmo sozinho; mensagens de commit que dizem o porquê.
- Teste com uma amostra pequena conhecida antes de rodar na base inteira; confira o total contra a fonte.
- Registre (log) o que o script fez e quantas linhas tocou, para auditoria.
- Automação que apaga ou sobrescreve: faça cópia antes, ou grave em arquivo novo.
