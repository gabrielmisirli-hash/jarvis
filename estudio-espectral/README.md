# Estúdio Espectral — PWA offline

Converte frases ou **BMPs originais** (1024×60, fundo preto, texto branco) em áudio WAV cuja frase aparece
legível no espectrograma **reconstruído a partir do WAV exportado**. Tudo roda no aparelho (Web Audio, Web
Worker, IndexedDB/OPFS): depois do primeiro carregamento funciona em modo avião, sem servidor.

## Fluxo
Frases (importar BMP / texto→BMP / biblioteca) → **aprovar** → Espectrograma por frase (BMP × reconstrução do
WAV, métricas) → Fundo e mixer (ruídos, solfeggio, binaural, isocrônico 7,83 Hz, música própria, prévia com/sem
fundo) → Exportar (duração, pausa em ms, formato WAV / FLAC / MP3 em 22050 ou 44100 Hz, mistura + camada espectral + ZIP, validação) → Histórico e backup.

Padrões: 110700 amostras (5,020408 s) por frase a 22050 Hz, PCM 16 bits estéreo, pausa 1000 ms, loop até 900 s.

## Desenvolvimento
Requer Node 18+.

```bash
npm install
```

```bash
npm run dev
```

Testes unitários e de calibração (os de calibração rodam só se houver os pares originais em `fixtures/`):

```bash
npm test
```

Build de produção (gera `dist/` com `sw.js` e `manifest.webmanifest`):

```bash
npm run build
```

Teste ponta a ponta offline em Chromium (instala o SW, corta a rede, reinicia o navegador, importa, exporta):

```bash
npm run build && npm run e2e
```

### Pares de referência (fora do git)
O repositório é público, então os BMP/WAV pessoais não são versionados. Para rodar a calibração, copie as
pastas do pacote para `fixtures/referencias_BMP_WAV/` e `fixtures/novos_BMPs/` (ou defina `ESTUDIO_REF_DIR`).

## Publicar via HTTPS (necessário para instalar e funcionar offline)
`dist/` é um site estático. Qualquer hospedagem HTTPS serve; o app usa caminhos relativos (funciona em subpasta).
- **Cloudflare Pages / Netlify / Vercel**: diretório de build `dist`, comando `npm run build`, raiz `estudio-espectral`.
- **GitHub Pages**: publicar o conteúdo de `dist/` num branch `gh-pages` ou via Actions.
- Servir `sw.js` sem cache longo (`Cache-Control: no-cache`) para que atualizações cheguem.
- `file://` não funciona: service workers exigem HTTPS ou `localhost`.

Instruções de instalação para Android, iPhone e Windows estão na aba **Instalar e sobre** do app.

## Documentação
- [docs/CALIBRACAO_ESPECTRAL.md](docs/CALIBRACAO_ESPECTRAL.md) — medições nos WAVs originais, lei linha→frequência, comparação v0.3/v1.0.
- [docs/DECISOES_E_LIMITACOES.md](docs/DECISOES_E_LIMITACOES.md) — reaproveitamento, bugs corrigidos, licenças, matriz de testes, limitações e fases.

## Estrutura
```
src/core/      DSP puro em TypeScript (testável em Node): mapeamento, síntese, BMP, WAV, STFT, métricas, mixer
src/workers/   worker de áudio (síntese, análise, exportação em streaming com OPFS)
src/browser/   integração com o navegador (texto→BMP, decodificação, IndexedDB, backup, download)
src/ui/        interface React (pt-BR)
src/content/   biblioteca de frases e assistente (offline, com citações)
tests/         Vitest (núcleo + calibração);  e2e/  teste offline em Chromium
```

Licença: MIT.
