# PowerPoint

## Princípios
- **Uma ideia por slide**, e o título do slide é a frase que diz a ideia ("Custos caíram 12% com a nova rota"), não o assunto ("Custos").
- A história: situação, complicação, resolução. O primeiro slide depois da capa já dá a conclusão; o resto prova.
- Texto mínimo: o slide apoia quem fala, não substitui. Detalhe vai nas notas do orador ou no apêndice.
- Gráfico com um destaque só (uma cor forte, o resto cinza) e o número que importa escrito por cima.
- Fonte de leitura a distância: corpo de 18 pt no mínimo.

## Slide mestre e modelo
- Exibir > Slide Mestre: fontes, cores, logo e rodapé uma única vez; todo slide herda.
- Use os **espaços reservados** dos layouts em vez de caixas de texto soltas: o Designer, o sumário e a troca de modelo dependem deles.
- Salve como `.potx` para a equipe começar sempre do mesmo modelo.
- Trocar a fonte do arquivo inteiro: Página Inicial > Substituir > Substituir Fontes.

## Gráficos e dados do Excel
- Colar Especial > Colar Vínculo mantém o gráfico ligado à planilha; Arquivo > Informações > Editar Links para Arquivos para atualizar ou quebrar o vínculo antes de enviar.
- Gráfico nativo do PowerPoint (Inserir > Gráfico) abre uma planilha embutida: bom para dados pequenos e estáticos.
- Para dezenas de slides gerados a partir de dados, automatize: VBA no PowerPoint, ou Python com `python-pptx` preenchendo um modelo.
- Tabelas grandes não cabem num slide: mostre o top 5 e mande o resto em anexo.

## Produtividade
- Alinhar e distribuir: selecione objetos > Formato da Forma > Alinhar; Ctrl+G agrupa.
- Ctrl+D duplica; Shift ao arrastar trava o eixo; Ctrl+Shift ao arrastar copia alinhado.
- Pincel de animação e Pincel de formatação (duplo clique para usar várias vezes).
- Transição **Transformar** (Morph) entre dois slides com os mesmos objetos movidos dá animação suave sem configurar efeito.
- Zoom de Resumo cria um sumário clicável.
- Reduzir tamanho: Arquivo > Compactar Imagens, e excluir áreas cortadas das imagens.

## Apresentando
- Modo de exibição do apresentador (Alt+F5): notas, próximo slide e cronômetro só na sua tela.
- Durante a apresentação: número + Enter vai ao slide; B escurece a tela; Ctrl+L apontador laser.
- Legendas ao vivo: Apresentação de Slides > Configurações de Legenda.
- Ensaiar Intervalos e Gravar para versão narrada que roda sozinha.
- Exportar para PDF com notas: Arquivo > Exportar > Criar Folhetos, ou Imprimir > Páginas de Anotações.
