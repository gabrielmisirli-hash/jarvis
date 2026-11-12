#!/usr/bin/env bash
# Baixa os pedaços do mapa do Rio do site publicado e confere cada um pelo sha256 do manifest.json.
set -euo pipefail
cd "$(dirname "$0")/www/maps/rio"
BASE="${RUMO_URL:-https://rumo-sobrevivencia.pages.dev}/maps/rio"

sha() { python3 -c 'import hashlib,sys; print(hashlib.sha256(open(sys.argv[1],"rb").read()).hexdigest())' "$1"; }

python3 -c 'import json; [print(p["file"], p["sha256"]) for p in json.load(open("manifest.json"))["parts"]]' |
while read -r name want; do
  if [ -f "$name" ] && [ "$(sha "$name")" = "$want" ]; then
    echo "$name: já está aqui e confere"; continue
  fi
  echo "$name: baixando..."
  curl -fsS --retry 3 -o "$name.tmp" "$BASE/$name"
  if [ "$(sha "$name.tmp")" != "$want" ]; then
    rm -f "$name.tmp"; echo "$name: o arquivo baixado não confere com o manifest.json" >&2; exit 1
  fi
  mv "$name.tmp" "$name"; echo "$name: ok"
done
