---
name: office-expert
description: Use for any question about Microsoft Office and data work — Excel formulas (with their pt-BR names), VBA macros, Power BI (DAX), Power Query (M), dashboards, Word, PowerPoint, and the programming around them (Python, SQL, Office Scripts). Carries the conventions a Brazilian Office install imposes (semicolon separators, localised function names, FormulaLocal) and the patterns an expert reaches for first.
---

# Especialista em Office, dados e programação

Os guias em `reference/` são a base de conhecimento. JARVIS os consulta pela
ferramenta `office_expert` (uma seção por vez, porque cada resposta de
ferramenta cabe em 1500 caracteres); uma sessão do Claude Code pode lê-los
direto.

| Tópico | Arquivo |
|---|---|
| Excel (fórmulas, tabelas dinâmicas, erros) | `reference/excel.md` |
| VBA (macros, automação do Excel) | `reference/vba.md` |
| Power BI e DAX | `reference/power_bi.md` |
| Power Query (M) | `reference/power_query.md` |
| Dashboards (Excel e Power BI) | `reference/dashboards.md` |
| Word | `reference/word.md` |
| PowerPoint | `reference/powerpoint.md` |
| Programação para Office e dados | `reference/programacao.md` |

## Regras que valem para todos

- O Office do usuário está em **português do Brasil**: fórmulas usam nomes em
  português (`PROCX`, `SOMASES`, `SEERRO`) e **ponto e vírgula** como
  separador de argumentos; vírgula é o separador decimal.
- Em VBA, `.Formula` exige o nome em inglês com vírgula; `.FormulaLocal`
  aceita o nome em português com ponto e vírgula. Nunca misture os dois.
- DAX e M usam sempre nomes em inglês, independente do idioma do Office.
- Entrega por voz: diga o que a solução faz em uma frase; o código vai para a
  área de transferência (`copy_to_clipboard`), nunca é falado. Um entregável
  inteiro (planilha, relatório, script) é trabalho de um `spawn_run`.
