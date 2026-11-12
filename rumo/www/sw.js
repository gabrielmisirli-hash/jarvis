// Service worker: guarda o app inteiro no aparelho para funcionar sem internet.
// A versão nova só substitui a antiga depois de baixada por completo (instalação atômica).

importScripts('precache-manifest.js');

const { version, files } = self.__PRECACHE;
const CACHE = `rumo-${version}`;
const scopeUrl = (path) => new URL(path, self.registration.scope).href;
// A página do app é guardada pela raiz ("./"). O Cloudflare Pages redireciona /index.html para /,
// e o Safari e o Chrome recusam abrir uma página que o service worker entrega vinda de redirecionamento.
const INDEX_URL = scopeUrl('./');

// Recria a resposta sem a marca de redirecionamento (protege contra respostas antigas no cache).
async function withoutRedirect(res) {
  if (!res.redirected) return res;
  const body = await res.blob();
  return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
}

self.addEventListener('install', (event) => {
  // cache: 'reload' ignora o cache HTTP do navegador: nunca guardar arquivo velho sob a versão nova.
  const requests = files.map((f) => new Request(scopeUrl(f), { cache: 'reload' }));
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(requests)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('rumo-') && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Pacotes de mapa vão direto para o IndexedDB: não duplicar no cache.
  if (url.pathname.includes('/maps/')) return;
  if (req.mode === 'navigate') {
    event.respondWith(caches.match(INDEX_URL).then((cached) => (cached ? withoutRedirect(cached) : fetch(req))));
    return;
  }
  event.respondWith(caches.match(req, { ignoreSearch: true }).then((cached) => cached || fetch(req)));
});
