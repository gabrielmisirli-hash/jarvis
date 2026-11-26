# Calibração espectral contra os WAVs originais

Medido em 26/11/2026 sobre os 7 pares `referencias_BMP_WAV/` do pacote. Reproduzível com
`npm run calibrar` (os pares ficam em `fixtures/`, fora do git, porque o repositório é público).

## 1. Formato dos originais (verificado, não suposto)

| Propriedade | Valor nos 7 arquivos |
|---|---|
| Taxa | 22050 Hz |
| Formato | PCM 16 bits, estéreo, **L idêntico a R** (diferença máxima 0) |
| Duração | **110700 amostras** = 246/49 s = 5,020408 s |
| Tempo | colunas 0–1023 distribuídas linearmente pela frase inteira (início/fim da energia coincidem com a primeira/última coluna com tinta, erro < 25 ms) |
| BMP | 1024×60, 24 bits, cabeçalho **OS/2 1.x** (BITMAPCOREHEADER, 12 bytes), texto antisserrilhado |
| Nível | **RMS da região ativa 0,105–0,109** em todos; picos variam 0,60–0,79 → normalização por RMS, não por pico |

## 2. Lei linha → frequência

Três métodos independentes convergiram:

1. **Correlação** envelope-da-linha × bin da STFT: linha 30 ≈ 603–608 Hz e linha 20 ≈ 1432–1437 Hz em
   *todos* os arquivos, independentemente da altura do texto → mapeamento **fixo na tela**, não esticado
   pela altura do texto (como faz a v1.0).
2. **Mínimos quadrados** de um modelo seno-por-linha, varrendo frequência da linha 30 e inclinação
   logarítmica: ótimo em f(30)=609 Hz, k=0,0858/linha → linha 0 ≈ 7989 Hz, linha 59 ≈ 50,6 Hz.
3. **Demodulação complexa** na frequência prevista `8000·(50/8000)^(30/59)` = 605,8 Hz: dentro de cada traço
   o desvio de frequência é −0,09…+0,84 Hz e a fase oscila só 0,004–0,033 rad (dois arquivos diferentes).

**Lei adotada (preset “Referência”)**: `f(linha) = 8000 · (50/8000)^(linha/59)` — logarítmica, 50 Hz na base,
8000 Hz no topo da tela de 60 linhas. Texto típico (linhas 16–44) → ~180–2020 Hz; acentos (linhas 8–12) → até ~4 kHz.

Outras observações:
- **Fase**: constante dentro de um traço, diferente a cada novo traço (por isso o R² de um modelo de fase fixa
  por linha é só 0,08 apesar de a frequência estar certa). Reproduzido com fase pseudoaleatória determinística
  trocada onde o envelope é ~0 (sem cliques).
- **Amplitude**: aproximadamente linear no brilho do pixel.
- A v0.3 (`200·11^((44−linha)/28)`) tem praticamente a mesma inclinação (0,0856/linha), porém ~10% acima em
  frequência — por isso “se aproximou visual e auditivamente”. A v1.0 (180–1800 Hz esticado na altura do texto)
  comprime o texto e muda a proporção a cada frase.

## 3. Resultado: nossa síntese × originais

Pipeline testado de ponta a ponta: BMP original → síntese → **WAV PCM16 codificado → decodificado** → análise.
“Corr. espectrograma” = correlação de Pearson do espectrograma em dB (STFT 1024/128, 50–4000 Hz, piso −60 dB)
entre o nosso WAV e o WAV original. “SSIM texto” = SSIM entre o BMP e a reconstrução por banco de filtros a
partir do áudio, na caixa do texto (o mesmo cálculo aplicado ao WAV original serve de linha de base).

| Arquivo | Banda 5–95% original | SSIM do original | **Corr. Referência** | SSIM nosso | Banda nossa | Corr. v0.3 | Corr. v1.0 | Banda v1.0 |
|---|---|---|---|---|---|---|---|---|
| 1-Voce esta seguro e protegido | 205–2019 Hz | 0,705 | **0,983** | 0,713 | 199–2019 Hz | 0,929 | 0,546 | 194–1077 Hz |
| 2-Respire Profundamente… | 301–1852 Hz | 0,682 | **0,980** | 0,719 | 301–1852 Hz | 0,922 | 0,876 | 291–1658 Hz |
| 3-Cada respiração… | 280–1701 Hz | 0,687 | **0,980** | 0,726 | 280–1701 Hz | 0,928 | 0,771 | 307–1281 Hz |
| 4-Sinta a Calma… | 258–1561 Hz | 0,615 | **0,979** | 0,628 | 253–1561 Hz | 0,933 | 0,912 | 199–1626 Hz |
| 5-A cada momento… | 199–1206 Hz | 0,603 | **0,979** | 0,614 | 199–1206 Hz | 0,935 | 0,881 | 194–1034 Hz |
| 6-Seu sono… | 258–1561 Hz | 0,620 | **0,981** | 0,630 | 258–1561 Hz | 0,930 | 0,908 | 199–1631 Hz |
| 7-Voce Dorme em PAz… | 253–1561 Hz | 0,679 | **0,978** | 0,718 | 253–1561 Hz | 0,923 | 0,725 | 296–1152 Hz |

Leitura: o preset Referência reproduz a banda dos originais quase exatamente e o espectrograma com correlação
≈ 0,98 (o resto vem principalmente da fase aleatória por traço, que não pode coincidir). O SSIM BMP×reconstrução
fica igual ou ligeiramente acima do dos próprios originais. A v1.0 é a pior (até 0,55) e perde metade da banda
superior em frases com acento (arquivo 1: 1077 Hz em vez de 2019 Hz).

Diferenças que permanecem: (a) fase por traço gerada por semente, não idêntica; (b) duração, formato e nível
iguais; (c) timbre: mesmo princípio (senos por linha na mesma faixa), portanto a mesma característica sonora
dos originais — mais grave e menos “metálica” que as versões antigas em 3–4 kHz. Avaliação auditiva humana
continua necessária; nenhuma métrica substitui ouvir e olhar.

## 4. Visualização (o que mais custou tempo)

- O mapeamento é **uma única configuração** (`src/core/mapping.ts`) usada pela síntese e por todos os modos de
  exibição — corrige a v1.0, cujo modo Detalhado usava âncoras 200/2200 Hz enquanto a síntese usava 180/1800.
- Os modos só mudam o **enquadramento**: Referência (tela inteira, escala da síntese, proporção do BMP ×2),
  Autozoom moderado, Detalhado, 0–4000 Hz linear fixo, Personalizado. Nenhum altera as frequências do WAV.
- **Problema encontrado e corrigido nesta versão**: com STFT de janela única (2048), as letras borravam na
  horizontal (janela de 93 ms ≈ 19 colunas). Como o texto é logarítmico, linhas baixas precisam de ~10 Hz de
  resolução e linhas altas de ~5 ms. Solução: **STFT multirresolução** (256–4096 amostras, escolha contínua por
  frequência a partir do espaçamento entre linhas do mapeamento, com mistura entre resoluções vizinhas para
  não criar costuras). Isso é análise do áudio, não pós-processamento da imagem.
- Em visualizadores de terceiros (STFT fixa), as linhas superiores ficam mais nítidas com FFT 512–1024 e as
  inferiores com 2048–4096 — a mesma limitação física que os WAVs originais têm.
- “C′” (banco de filtros nas frequências das linhas) também é calculado do áudio e serve às métricas.
