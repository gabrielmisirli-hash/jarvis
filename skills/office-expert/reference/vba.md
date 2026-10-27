# VBA

## Princípios
- `Option Explicit` no topo de todo módulo; declare tudo com tipo (`Dim i As Long`, nunca `Integer` para linhas).
- Nunca `Select`/`Activate`: trabalhe com objetos qualificados (`ws.Range("A1")`), sempre a partir de `ThisWorkbook` ou de uma pasta aberta por variável.
- Leia e escreva em lote com arrays; célula a célula num laço é cem vezes mais lento.
- Desligue `ScreenUpdating`, `EnableEvents` e o cálculo durante a macro e religue SEMPRE no fim, inclusive no erro.
- `.Formula` usa nome em inglês e vírgula (`"=SUMIFS(C:C,A:A,""Sul"")"`); `.FormulaLocal` usa o português com `;`. Para matriz dinâmica: `.Formula2`.
- Salvar como `.xlsm`; macro que roda em todas as pastas fica na `PERSONAL.XLSB`.
- Atalhos: Alt+F11 abre o editor, F8 executa linha a linha, Ctrl+G abre a janela Imediata (`?Range("A1").Value`).

## Esqueleto de macro
```vba
Option Explicit

Public Sub ProcessarRelatorio()
    Dim calcAnterior As XlCalculation
    calcAnterior = Application.Calculation
    On Error GoTo Falha
    Application.ScreenUpdating = False
    Application.EnableEvents = False
    Application.Calculation = xlCalculationManual

    Dim ws As Worksheet
    Set ws = ThisWorkbook.Worksheets("Dados")
    ' ... trabalho aqui ...

Saida:
    Application.Calculation = calcAnterior
    Application.EnableEvents = True
    Application.ScreenUpdating = True
    Exit Sub
Falha:
    MsgBox "Erro " & Err.Number & ": " & Err.Description, vbCritical
    Resume Saida
End Sub
```

## Ler e escrever em lote
```vba
Dim ultima As Long, dados As Variant, i As Long
ultima = ws.Cells(ws.Rows.Count, "A").End(xlUp).Row
dados = ws.Range("A2:D" & ultima).Value      ' array 2D, base 1
For i = 1 To UBound(dados, 1)
    If dados(i, 3) > 1000 Then dados(i, 4) = "Alto" Else dados(i, 4) = "Normal"
Next i
ws.Range("A2:D" & ultima).Value = dados      ' uma escrita só
```
- Última coluna: `ws.Cells(1, ws.Columns.Count).End(xlToLeft).Column`.
- Intervalo de 1 célula devolve valor, não array: trate `ultima = 2` à parte.
- Busca rápida em memória: `Scripting.Dictionary` (`CreateObject("Scripting.Dictionary")`) em vez de PROCV dentro do laço.

## Tabelas (ListObject)
```vba
Dim lo As ListObject, nova As ListRow
Set lo = ws.ListObjects("Vendas")
Set nova = lo.ListRows.Add
nova.Range(1, lo.ListColumns("Data").Index).Value = Date
nova.Range(1, lo.ListColumns("Valor").Index).Value = 150.5
lo.Range.AutoFilter Field:=lo.ListColumns("Região").Index, Criteria1:="Sul"
lo.DataBodyRange.SpecialCells(xlCellTypeVisible).Copy destino.Range("A2")
If lo.ShowAutoFilter Then lo.AutoFilter.ShowAllData
```
- Referenciar coluna por nome, nunca por letra: sobrevive a colunas inseridas.
- Limpar a tabela mantendo cabeçalho: `If Not lo.DataBodyRange Is Nothing Then lo.DataBodyRange.Delete`.

## Arquivos e consolidação
```vba
Dim pasta As String, arq As String, wb As Workbook
pasta = "C:\Relatorios\"
arq = Dir(pasta & "*.xlsx")
Do While arq <> ""
    Set wb = Workbooks.Open(pasta & arq, ReadOnly:=True, UpdateLinks:=False)
    ' copiar wb.Worksheets(1).UsedRange para a base, via array
    wb.Close SaveChanges:=False
    arq = Dir()
Loop
```
- Para consolidar arquivos de uma pasta, o Power Query (Obter Dados > De Pasta) costuma ser melhor que VBA: atualiza com um clique e ninguém precisa habilitar macros.
- Exportar PDF: `ws.ExportAsFixedFormat xlTypePDF, pasta & "rel.pdf"`.
- Escolher arquivo: `Application.GetOpenFilename("Excel (*.xlsx), *.xlsx")`.
- Enviar e-mail pelo Outlook: `CreateObject("Outlook.Application").CreateItem(0)` com `.To`, `.Subject`, `.HTMLBody`, `.Attachments.Add`, e `.Display` antes de `.Send` para o usuário conferir.

## Eventos e UserForm
- `Worksheet_Change(ByVal Target As Range)` no módulo da planilha; filtre com `If Intersect(Target, Me.Range("B:B")) Is Nothing Then Exit Sub` e desligue `EnableEvents` antes de escrever na própria planilha, ou entra em laço.
- `Workbook_Open` em `EstaPasta_de_trabalho` para rotinas de abertura.
- UserForm: valide no `Click` do botão antes de gravar; preencha ComboBox com `.List = lo.ListColumns(1).DataBodyRange.Value`.
- Botão na planilha: Desenvolvedor > Inserir > Botão (Controle de Formulário) e atribua a macro.

## Erros comuns
- 1004: intervalo inválido, planilha protegida, ou nome de planilha errado; também `.Formula` com nome em português.
- 91 (variável de objeto não definida): faltou `Set`, ou `Find` não achou nada — teste `If Not r Is Nothing`.
- 9 (subscrito fora do intervalo): planilha/pasta com outro nome, ou índice de array fora dos limites.
- 13 (tipos incompatíveis): célula com erro ou texto; teste com `IsError`/`IsNumeric` antes.
- Macro lenta: está escrevendo célula a célula, ou ScreenUpdating ligado, ou `Select` dentro do laço.
- Macros desabilitadas em arquivo baixado: propriedades do arquivo > Desbloquear, ou salvar em Local Confiável.
