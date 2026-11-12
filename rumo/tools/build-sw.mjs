// Gera www/precache-manifest.js: a lista de arquivos que o app guarda para funcionar sem internet.
// Rode depois de qualquer mudança em www/: node tools/build-sw.mjs
// A "version" é um hash do conteúdo, então muda sozinha quando algum arquivo muda,
// e o iPhone baixa a versão nova inteira antes de trocar.

import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WWW = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'www');
const OUT = path.join(WWW, 'precache-manifest.js');

// Fora do cache: o próprio service worker, a lista, os pacotes de mapa (vão para o IndexedDB)
// e o index.html, que o Cloudflare redireciona para "/" (a raiz "./" já guarda a página).
const SKIP = (rel) => rel === 'sw.js' || rel === 'precache-manifest.js' || rel === 'index.html' || rel.startsWith('maps/');

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(full));
    else out.push(full);
  }
  return out;
}

const files = (await walk(WWW))
  .map((f) => path.relative(WWW, f).split(path.sep).join('/'))
  .filter((rel) => !SKIP(rel))
  .sort();

const hash = createHash('sha256');
for (const rel of [...files, 'index.html', 'sw.js']) {
  hash.update(rel);
  hash.update(await readFile(path.join(WWW, rel)));
}
const version = hash.digest('hex').slice(0, 12);

// encodeURI (e não encodeURIComponent): mantém "@" de "dark@2x.json" igual à URL que o mapa pede.
const list = ['./', ...files.map((rel) => encodeURI(rel))];
const body = `// Gerado por tools/build-sw.mjs — não edite à mão.
self.__PRECACHE = ${JSON.stringify({ version, files: list }, null, 1)};
`;
await writeFile(OUT, body);

const bytes = (await Promise.all(files.map((rel) => readFile(path.join(WWW, rel))))).reduce((n, b) => n + b.length, 0);
console.log(`Versão ${version}: ${list.length} arquivos, ${(bytes / 1e6).toFixed(1)} MB no cache do app`);
