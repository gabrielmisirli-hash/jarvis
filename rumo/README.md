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
- `tools/build-map.mjs` e `tools/build-pois.mjs`: os scripts que geram o mapa e os
  pontos vitais (`tools/build-sw.mjs` foi recriado aqui);
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

O modo offline usa a lista em `www/precache-manifest.js`. Gere de novo depois de
qualquer mudança, senão o celular continua com a versão antiga guardada:

```bash
node tools/build-sw.mjs
```

A `version` é um hash do conteúdo e muda sozinha. `index.html` fica fora da
lista de propósito: o Cloudflare redireciona `/index.html` para `/`, e o app
guarda a página pela raiz (`./`).

## Tempo e avisos

- `www/js/lib/weather.js`: regras de alerta (escala de cores do INMET para chuva e vento,
  trovoada) sobre a previsão hora a hora do Open-Meteo. O app e o vigia usam o mesmo arquivo.
- `www/js/weather-view.js`: selo no topo, folha "Tempo" e o botão de ligar os avisos.
- `vigia/`: Cloudflare Worker que guarda as inscrições (KV `rumo-alertas`) e, a cada 15 min,
  manda notificação (Web Push, sem bibliotecas) quando há risco nas próximas 3 horas.
- `functions/api/alertas/`: encaminha `/api/alertas/*` do site ao vigia, no mesmo endereço.
- Testes: `node --test tests/*.test.mjs`.

A publicação (`.github/workflows/rumo-deploy.yml`) cria o banco e as chaves de notificação
na primeira vez. As chaves nunca são impressas; trocá-las desligaria os avisos de todos.

## Publicar

Automático: cada mudança em `rumo/` neste branch é publicada pelo GitHub Actions
(`.github/workflows/rumo-deploy.yml`), com o segredo `CLOUDFLARE_API_TOKEN` do repositório.

Dados do mapa: © OpenStreetMap (ODbL) · Protomaps. MapLibre GL: ver
`www/vendor/LICENSE-maplibre.txt`.
