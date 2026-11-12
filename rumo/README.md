# Rumo — app de sobrevivência offline (PWA para iPhone)

Mapa offline do Rio, bússola, SOS, primeiros socorros, guias de sobrevivência e
plano familiar. Funciona sem internet depois de aberto uma vez.

Publicado em **https://rumo-sobrevivencia.pages.dev** (Cloudflare Pages).

## De onde veio esta cópia

O app foi feito numa sessão do Claude no computador com Windows, em 10/11/2026.
Esta pasta foi baixada do site publicado em 12/11/2026: são os mesmos 68 arquivos
do `rumo-site.zip` que foi enviado ao Cloudflare. O código não tem bundler nem
minificação, então `www/` é o próprio código-fonte do app.

**O que não veio** (não foi publicado, ficou só no computador):
- `tools/`: os scripts que geram o mapa (`build-map.mjs`), os pontos vitais
  (`build-pois.mjs`) e a lista de arquivos offline (`build-sw.mjs`);
- `tests/`: os testes automáticos;
- o README original com o passo a passo de publicação.

## Rodar no computador

```bash
./baixar-mapa.sh            # baixa os 3 pedaços do mapa (46 MB) e confere o sha256
cd www && python3 -m http.server 8080
```

Abra http://localhost:8080. Os pedaços do mapa (`www/maps/rio/part-*.bin`) ficam
fora do Git por causa do tamanho; o script baixa de novo do site publicado.

## Ao mudar qualquer arquivo de `www/`

O modo offline usa a lista em `www/precache-manifest.js`. Ela precisa ser gerada
de novo (com uma `version` nova) a cada mudança, senão o iPhone continua com a
versão antiga guardada. O gerador original (`tools/build-sw.mjs`) ficou no
computador e precisa ser recriado aqui antes da primeira mudança.

## Publicar

No Cloudflare: **Workers & Pages → projeto rumo-sobrevivencia → Create deployment**,
e envie a pasta `www` inteira, com os pedaços do mapa. O `index.html` precisa
ficar na raiz do envio.

Dados do mapa: © OpenStreetMap (ODbL) · Protomaps. MapLibre GL: ver
`www/vendor/LICENSE-maplibre.txt`.
