// Gera o par de chaves VAPID (P-256) e imprime só a chave privada em JWK, para ir direto
// ao segredo do vigia: node tools/gerar-vapid.mjs | wrangler secret put VAPID_PRIVATE_JWK
// A chave pública sai da privada (o vigia a calcula), então nada precisa ser copiado à mão.
const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const { kty, crv, x, y, d } = await crypto.subtle.exportKey('jwk', pair.privateKey);
process.stdout.write(JSON.stringify({ kty, crv, x, y, d }));
