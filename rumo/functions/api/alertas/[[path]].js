// Encaminha /api/alertas/* para o vigia (Worker "rumo-vigia") pela ligação de serviço VIGIA.
// Assim o app conversa com o vigia no mesmo endereço do site.
export function onRequest({ request, env }) {
  if (!env.VIGIA) {
    return new Response(JSON.stringify({ error: 'serviço de avisos indisponível' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
  }
  return env.VIGIA.fetch(request);
}
