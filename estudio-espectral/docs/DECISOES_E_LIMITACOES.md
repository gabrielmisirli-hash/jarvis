# Decisões técnicas, bugs corrigidos, limitações e estado dos testes

## 1. O que foi reaproveitado da versão Python 1.0

| Item Python | Destino na PWA | Observação |
|---|---|---|
| `image_to_mono` (senos por linha, envelope interpolado, σ 2,5 ms, fade 8 ms) | `src/core/synth.ts` | Princípio mantido; **mapeamento substituído** pelo calibrado (ver CALIBRACAO), fase por traço, normalização RMS |
| `conversor_v03_referencia.py` | preset `v03` em `mapping.ts` | Preservado para comparação |
| `export_session` (sequência, blocos, camadas) | `sequence.ts` + `mixer.ts` + worker | Reescrito em streaming; ver bugs abaixo |
| `plot_spectrogram` | `spectrum.ts` + aba Espectrograma | Reescrito, acoplado ao mesmo mapeamento |
| Ruídos, solfeggio, binaural, isocrônico | `generators.ts`, `mixer.ts` | Geradores contínuos; definições documentadas na interface |
| Nomeação `AA_MM_DD-Nome_frase_Solf…_Vn`, projeto.json, histórico | `project.ts`, `ExportTab`, IndexedDB | Data local do aparelho, nunca sobrescreve |
| Presets/assistente/biblioteca/importação CSV-XLSX-TXT | `content/`, `LibraryTab`, `project.ts` | Grupos “(usuário)” preservados literalmente; XLSX lido sem SheetJS |

O código Python declara MIT, mas não foi auditada a origem de cada trecho; a reescrita em TypeScript é nova.

## 2. Bugs da versão Python encontrados e tratados

1. **`app.py` v1.0 não compila**: linhas 24–40 têm strings entre aspas simples com quebras de linha literais
   (`SyntaxError: unterminated string literal`). O app desktop, como enviado, não abre.
2. Mapeamento v1.0 (180–1800 Hz esticado na altura do texto) se afasta dos originais (correlação 0,55–0,91);
   substituído pelo mapeamento medido (0,98).
3. Visualização Detalhado usava 200/2200 Hz e a síntese 180/1800 Hz → agora uma única configuração.
4. Normalização por pico gerava volumes diferentes entre frases; originais usam RMS constante.
5. Ruído gerado de forma independente a cada bloco de 2 s (descontinuidades) → geradores com estado contínuo.
6. Limitador por bloco mudava o ganho a cada 2 s → ganho mestre fixo calculado antes do render.
7. Música repetida com fade em cada borda (quedas periódicas) → crossfade equal-power real.
8. `importbmps` declarado mas não funcional → importação de BMP é o caminho principal.
9. Pausa padrão 2,0 s no motor × 1000 ms na interface → 1000 ms único.
10. Bug histórico de broadcasting `(1323,2)` × `(1323,)`: envelopes aplicados explicitamente por canal; teste de
    regressão com blocos de 1323 amostras verifica L == R em todas as amostras, inclusive fades.

## 3. Decisões técnicas

- **React + TypeScript + Vite**; **vite-plugin-pwa (Workbox)** com `generateSW`: o manifesto de precache
  é gerado no build e é auditável em `dist/sw.js` (45 entradas, ~780 KB: HTML, JS, CSS, worker, fontes, ícones).
- **Sem WASM**: o DSP em TypeScript é rápido o suficiente (síntese de uma frase ~100 ms; render de 1 h estimado
  em dezenas de segundos em desktop). WASM/SIMD fica como otimização futura se aparelhos fracos exigirem.
- **Web Worker** para síntese, análise e exportação; a interface nunca congela; cancelamento entre blocos.
- **Exportação em streaming**: blocos de 1 s (~0,5 MB) → memória constante. Grava no **OPFS** com
  `createSyncAccessHandle` quando disponível (Chrome/Edge, Safari 15.2+); senão monta um Blob em partes.
  Arquivo cancelado é apagado (nenhuma saída parcial).
- **Validação pós-exportação** na própria interface: cabeçalho, taxa, canais, bits, duração exata, tamanho e
  conteúdo não silencioso.
- **IndexedDB via Dexie** (projetos, instantâneos imutáveis, músicas, biblioteca); salvamento automático;
  **backup ZIP** (fflate) com JSON + BMPs legíveis + músicas originais, e restauração.
- **Codecs próprios**: BMP (inclui OS/2 1.x, 1/4/8/16/24/32 bits, BITFIELDS), WAV, FFT/STFT, SSIM — sem
  dependência de comportamento variável entre navegadores.
- **Decodificação de áudio importado** via `decodeAudioData` num `OfflineAudioContext` de 22050 Hz (reamostra
  automaticamente); fallback: taxa nativa + reamostragem.
- **Fontes OFL embutidas** (Arimo ≈ métrica do Arial; Roboto Condensed ≈ Arial Narrow) para texto→BMP offline
  idêntico em todos os aparelhos. Geometria medida nas referências: base na linha 44, maiúsculas ~28 px.
- **Sem MP3/FLAC nesta fase**: MP3 exige codificador com licença LGPL (lamejs) ou WebCodecs com suporte
  irregular; perdas podem destruir letras. WAV mestre primeiro, como pedido.

## 4. Licenças das dependências

| Pacote | Licença | Uso |
|---|---|---|
| react, react-dom 18.3.1 | MIT | interface |
| dexie 4.0.11 | Apache-2.0 | IndexedDB |
| fflate 0.8.2 | MIT | ZIP (backup, pacote, leitura XLSX) |
| vite-plugin-pwa / workbox | MIT | service worker e manifesto |
| @fontsource/arimo, @fontsource/roboto-condensed | pacotes MIT; fontes SIL OFL 1.1 | texto→BMP |
| vite, typescript, vitest, @vitejs/plugin-react (dev) | MIT / Apache-2.0 | build e testes |

Todas permitem uso comercial. A OFL exige manter o aviso de licença das fontes (incluído pelo Fontsource).
Nenhuma gravação musical é distribuída.

## 5. Estado da matriz de testes (MATRIZ_DE_TESTES.md)

Legenda: ✅ automatizado e passando nesta sessão · 🟡 implementado, verificação manual pendente · ⛔ não testado (exige aparelho)

| Caso | Estado | Evidência |
|---|---|---|
| BMP 1024×60 importado: mesmos pixels na síntese | ✅ | decodificador OS/2 testado; e2e importa o BMP real nº 1 |
| Frase com ç/ã/é → BMP e WAV, reconstrução | ✅ | e2e (“Cada respiração me leva à paz”) |
| Formato 22050 Hz, PCM16, estéreo, 5,020408 s | ✅ | testes de calibração e WAV |
| Inícios 0 / 6,0204 / 12,0408 s (1000 ms) e loop | ✅ | `core.test.ts` |
| Inícios 0 / 5,5204 / 11,0408 s (500 ms) | ✅ | `core.test.ts` |
| Fade estéreo sem broadcasting | ✅ | L == R em todas as amostras, blocos de 1323 |
| Binaural 200/210 Hz canais diferentes | ✅ | pico espectral por canal |
| Isocrônico 7,83 Hz medido | ✅ | envelope medido |
| Espectrograma por frase, 0–4000 Hz, BMP × WAV real | ✅ | e2e + capturas em `e2e/artifacts/` |
| Mistura: camada isolada intacta | ✅ | teste amostra a amostra com ruído rosa |
| Música curta repete sem cliques | ✅ | teste de descontinuidade com senoide |
| Exportação 15/30/60 min | 🟡 | streaming em blocos de 1 s; e2e cobre 30 s e cancelamento de 60 min; medir tempo/memória em celular |
| Versões V1/V2 sem sobrescrever | ✅ | teste de nomeação + e2e |
| Modo avião **desktop Chromium** (instalado, fechado, reaberto, exporta) | ✅ | e2e com rede cortada e navegador reiniciado; 0 requisições externas |
| Modo avião Windows Edge/Chrome real | 🟡 | mesmo motor Chromium do e2e; confirmar em PC real |
| Modo avião Android real | ⛔ | requer aparelho |
| Modo avião iPhone (Tela de Início) | ⛔ | **não validado** — requer iPhone real |
| Backup e restauração | ✅ | e2e offline: exporta ZIP, apaga todos os dados, restaura histórico e frases |
| Cancelar render | ✅ | e2e |
| Nenhum acesso remoto | ✅ | e2e monitora todas as requisições |
| Sessão offline de 30 min / armazenamento pressionado | ⛔ | pendente |

## 6. Limitações conhecidas

- **iOS/Safari**: sem validação em aparelho nesta entrega. Riscos conhecidos: o Safari pode apagar dados de
  sites não usados por semanas (a PWA na Tela de Início é tratada de forma separada e mais favorável, mas sem
  garantia eterna); downloads usam o menu Compartilhar; OGG pode não decodificar; memória limitada em
  exportações muito longas (por isso o OPFS e os blocos).
- **Legibilidade física**: as linhas inferiores (~130–300 Hz) têm espaçamento de 10–25 Hz; qualquer
  espectrograma precisa de janelas longas ali, o que borra o tempo. Os originais têm a mesma limitação.
- **Mistura**: ruído/música na banda 180–2000 Hz mascaram as letras. O app mede (SSIM da mistura) e avisa;
  ducking atua só no fundo. Não há pós-processamento para “simular” legibilidade.
- **Assistente**: modelos locais, sem IA. Conversão Eu→Você por dicionário de verbos (avisa quando incompleta).
- **Evidência**: texto espectral não tem efeito subliminar demonstrado; nada aqui é tratamento.

## 7. Fases

- **F1 (esta entrega)**: conversor fiel offline + PWA instalável — implementado e testado em Chromium.
- **F2**: biblioteca, assistente, planilhas — implementado em versão inicial (catálogos locais, métodos com
  citações, importação CSV/XLSX/TXT, grupos).
- **F3**: mixer, música, ruídos, exportação longa — implementado; falta medir desempenho em celulares.
- **F4 (pendente)**: MP3/FLAC, empacotamento nativo opcional (Capacitor para Android/iOS, Tauri para Windows)
  sobre este mesmo front-end, caso a retenção de dados da PWA se mostre insuficiente nos testes reais.
