# Word

## Princípios
- **Estilos** para tudo (Título 1, Título 2, Normal, Legenda); nunca formate título à mão. Mudar o estilo muda o documento inteiro de uma vez.
- Sumário, numeração de capítulos, painel de navegação e referências cruzadas dependem dos estilos de título.
- Quebra de página (Ctrl+Enter) e quebra de seção, nunca Enter repetido.
- Mostrar marcas de formatação (Ctrl+Shift+8) quando algo "pula" sem explicação.
- Modelo `.dotx` para documentos que se repetem (proposta, ofício, relatório mensal).

## Sumário, numeração e referências
- Sumário: Referências > Sumário; atualizar com F9 (ou botão direito > Atualizar Campo > Atualizar índice inteiro).
- Títulos numerados (1, 1.1, 1.1.1): Página Inicial > Lista de Vários Níveis > escolha a que vincula aos estilos Título.
- Legendas em figuras e tabelas: Referências > Inserir Legenda; depois Inserir Índice de Ilustrações.
- Referência cruzada ("ver Tabela 3"): Referências > Referência Cruzada; atualiza sozinha se a numeração mudar.
- Cabeçalho/rodapé diferente por seção: quebra de seção + desmarcar "Vincular ao Anterior".
- Numeração de página começando depois da capa: quebra de seção após a capa, Formatar Números de Página > Iniciar em 1.

## Mala direta
1. Lista em Excel: uma linha por destinatário, cabeçalho na primeira linha, sem mesclas.
2. Correspondências > Iniciar Mala Direta > Cartas (ou Etiquetas/E-mail).
3. Selecionar Destinatários > Usar Lista Existente.
4. Inserir Campo de Mesclagem nos lugares certos; Regras > Se...Então...Senão para texto condicional.
5. Valores em R$ e datas saem sem formato: Alt+F9 mostra o código do campo e acrescente `\# "R$ #.##0,00"` ou `\@ "dd/MM/yyyy"`; Alt+F9 de novo.
6. Visualizar Resultados, depois Concluir e Mesclar > Editar documentos individuais (para revisar) ou Enviar E-mail.
- Um PDF por destinatário não sai nativo: macro VBA ou Power Automate.

## Revisão e colaboração
- Controlar Alterações (Ctrl+Shift+E) antes de qualquer edição em documento de outra pessoa.
- Revisão > Comparar: mostra as diferenças entre duas versões quando alguém editou sem controlar alterações.
- Restringir Edição: permitir só comentários ou só preenchimento de formulários.
- Coautoria em tempo real exige o arquivo no OneDrive/SharePoint.

## Atalhos e truques
- Ctrl+Shift+N estilo Normal; Ctrl+Alt+1/2/3 Títulos 1/2/3.
- Shift+F3 alterna maiúsculas/minúsculas; Ctrl+Espaço remove formatação de caractere; Ctrl+Q remove de parágrafo.
- Localizar e substituir com curingas (Mais > Usar caracteres curinga): `^p` parágrafo, `^t` tabulação; `^p^p` → `^p` limpa linhas em branco duplicadas de texto colado.
- Colar como texto sem formatação: Ctrl+Shift+V (ou Colar Especial).
- Tabela vinda do Excel que precisa atualizar: Colar Especial > Colar Vínculo.
- Alt+Shift+↑/↓ move o parágrafo inteiro.
- Converter para PDF com marcadores: Salvar Como PDF > Opções > Criar indicadores usando Títulos.
