/**
 * Teste ponta a ponta OFFLINE em Chromium real (desktop):
 *  1. carrega via HTTP(S)/localhost uma vez, espera o service worker ficar pronto;
 *  2. corta a rede, FECHA o navegador e o reabre (mesmo perfil) — simula reiniciar o app;
 *  3. offline: importa BMP, gera BMP a partir de texto, aprova, analisa o espectrograma
 *     reconstruído do WAV, exporta WAV de 30 s e valida o arquivo baixado;
 *  4. fecha e reabre de novo offline: o projeto continua salvo (IndexedDB);
 *  5. falha se houver QUALQUER requisição para fora de localhost.
 *
 * Uso: npm run build && npm run e2e   (requer o Playwright instalado; usa vite preview)
 * NÃO substitui testes em aparelhos Android/iOS reais.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require('/opt/node-tools/node_modules/playwright'); }
const { chromium } = pw;

const PORT = 4173;
const URL_ = `http://localhost:${PORT}/`;
const art = join(here, 'artifacts');
mkdirSync(art, { recursive: true });
const log = (...a) => console.log('[e2e]', ...a);
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); log(ok ? 'OK  ' : 'FALHA', name, detail); };

// BMP de teste: OS/2 1.x 24 bits (mesmo formato dos originais), 1024x60, blocos brancos
function os2Bmp() {
  const W = 1024, H = 60, stride = W * 3;
  const u8 = new Uint8Array(26 + stride * H);
  const dv = new DataView(u8.buffer);
  u8[0] = 0x42; u8[1] = 0x4d; dv.setUint32(2, u8.length, true); dv.setUint32(10, 26, true);
  dv.setUint32(14, 12, true); dv.setUint16(18, W, true); dv.setInt16(20, H, true); dv.setUint16(22, 1, true); dv.setUint16(24, 24, true);
  for (let y = 16; y <= 44; y++) for (let x = 150; x < 870; x++) {
    const on = ((x - 150) % 60 < 8) || ((y === 16 || y === 44) && (x - 150) % 60 < 40);
    if (!on) continue;
    const o = 26 + (H - 1 - y) * stride + x * 3;
    u8[o] = u8[o + 1] = u8[o + 2] = 255;
  }
  return u8;
}

const fixtureDir = join(root, 'fixtures', 'referencias_BMP_WAV');
const realBmp = existsSync(fixtureDir) ? readdirSync(fixtureDir).find((f) => f.endsWith('.bmp')) : null;
const bmpPath = realBmp ? join(fixtureDir, realBmp) : join(art, 'teste_os2.bmp');
if (!realBmp) writeFileSync(bmpPath, os2Bmp());

const server = spawn(process.execPath, [join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: 'pipe' });
process.on('exit', () => server.kill('SIGKILL'));
await new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error('preview não iniciou')), 20000);
  server.stdout.on('data', (d) => { if (String(d).includes('localhost')) { clearTimeout(t); res(); } });
  server.stderr.on('data', (d) => process.stderr.write(d));
});

const profile = mkdtempSync(join(tmpdir(), 'espectral-e2e-'));
const external = [];
const launch = async () => {
  const ctx = await chromium.launchPersistentContext(profile, { acceptDownloads: true, viewport: { width: 1200, height: 900 }, deviceScaleFactor: 1 });
  ctx.on('request', (r) => { const u = new URL(r.url()); if (!['localhost', '127.0.0.1'].includes(u.hostname) && !u.protocol.startsWith('blob') && !u.protocol.startsWith('data')) external.push(r.url()); });
  return ctx;
};

let ctx;
try {
  // 1) primeira visita, online
  ctx = await launch();
  let page = ctx.pages()[0] ?? (await ctx.newPage());
  await page.goto(URL_);
  await page.waitForFunction(() => navigator.serviceWorker?.controller || null, null, { timeout: 30000 }).catch(() => null);
  await page.reload(); // garante página controlada pelo SW
  await page.getByTestId('offline-ready').filter({ hasText: 'Pronto para modo avião' }).waitFor({ timeout: 30000 });
  check('service worker instalado e app em cache', true);
  await ctx.close();

  // 2) reabre o navegador SEM rede
  ctx = await launch();
  await ctx.setOffline(true);
  page = ctx.pages()[0] ?? (await ctx.newPage());
  await page.goto(URL_);
  await page.getByRole('heading', { name: 'Estúdio Espectral' }).waitFor({ timeout: 15000 });
  check('app abre offline após reiniciar o navegador', true);
  const offlineFlag = await page.evaluate(() => navigator.onLine);
  check('navegador realmente offline', offlineFlag === false, `navigator.onLine=${offlineFlag}`);

  // 3) importa BMP original + frase digitada
  await page.locator('input[type=file][accept*=".bmp"][multiple]').setInputFiles(bmpPath);
  await page.locator('.phrase').first().waitFor();
  await page.getByPlaceholder(/Uma frase por linha/).fill('Cada respiração me leva à paz');
  await page.getByRole('button', { name: 'Adicionar à sequência' }).click();
  await page.locator('.phrase').nth(1).waitFor();
  check('BMP importado e texto→BMP (ç/ã/à) criados', (await page.locator('.phrase').count()) === 2, realBmp ? `BMP real: ${realBmp}` : 'BMP OS/2 sintético');
  await page.getByRole('button', { name: /Aprovar sequência/ }).click();
  await page.getByText('Aprovada', { exact: true }).waitFor();
  await page.screenshot({ path: join(art, '1_frases.png'), fullPage: true });

  // espectrograma reconstruído do WAV
  await page.getByRole('tab', { name: 'Espectrograma' }).click();
  const ssimEl = page.locator('.metrics b').first();
  await ssimEl.waitFor({ timeout: 60000 });
  const ssim = parseFloat(await ssimEl.innerText());
  check('espectrograma reconstruído do WAV + SSIM', ssim > 0.4, `SSIM texto=${ssim}`);
  await page.screenshot({ path: join(art, '2_espectrograma.png'), fullPage: true });
  for (const m of ['Autozoom moderado', 'Detalhado', '0–4000 Hz fixo (linear)']) {
    await page.getByLabel('Modo de visualização').selectOption({ label: m });
    await page.waitForTimeout(300);
    await page.locator('#comparacao:not(.busy)').waitFor({ timeout: 30000 });
    await page.locator('#comparacao').screenshot({ path: join(art, `2_${m.split(' ')[0]}.png`) });
  }

  // 4) exporta 30 s com ruído rosa e binaural
  await page.getByRole('tab', { name: 'Fundo e mixer' }).click();
  await page.getByLabel('Tipo').selectOption({ label: 'Rosa (1/f)' });
  await page.getByRole('tab', { name: 'Exportar' }).click();
  const dur = page.getByLabel('Duração total');
  await dur.fill('30');
  await page.getByRole('button', { name: 'Gerar WAV' }).click();
  await page.locator('.checks li').first().waitFor({ timeout: 60000 });
  const checks = await page.locator('.checks li').allInnerTexts();
  check('exportação validada pelo app', checks.length >= 2 && checks.every((c) => c.includes('OK') || c.startsWith('Atenção')), checks.join(' | '));
  const btn = page.getByRole('button', { name: /^⬇ .*\.wav/ }).first();
  const [dl] = await Promise.all([page.waitForEvent('download'), btn.click()]);
  const wavPath = join(art, dl.suggestedFilename());
  await dl.saveAs(wavPath);
  const w = readFileSync(wavPath);
  const sr = w.readUInt32LE(24), ch = w.readUInt16LE(22), bits = w.readUInt16LE(34), frames = w.readUInt32LE(40) / 4;
  check('WAV baixado offline: 22050 Hz, estéreo, 16 bits, 30 s', sr === 22050 && ch === 2 && bits === 16 && frames === 30 * 22050, `${dl.suggestedFilename()} ${sr} Hz ${ch} ch ${bits} bits ${frames} amostras`);
  check('nome versionado com data local', /^\d\d_\d\d_\d\d-.+_frase_.*_V1\.wav$/.test(dl.suggestedFilename()), dl.suggestedFilename());
  await page.screenshot({ path: join(art, '3_exportar.png'), fullPage: true });

  // cancelamento de render longo
  await dur.fill('3600');
  await page.getByRole('button', { name: 'Gerar WAV' }).click();
  await page.getByRole('button', { name: 'Cancelar' }).click({ timeout: 10000 });
  await page.getByText(/cancelada/).waitFor({ timeout: 20000 });
  check('cancelamento sem travar a interface', true);
  await dur.fill('30');
  await page.waitForTimeout(800); // salvamento automático
  await ctx.close();

  // 5) reabre offline: projeto persistido
  ctx = await launch();
  await ctx.setOffline(true);
  page = ctx.pages()[0] ?? (await ctx.newPage());
  await page.goto(URL_);
  await page.locator('.phrase').first().waitFor({ timeout: 15000 });
  check('projeto persiste após fechar e reabrir offline', (await page.locator('.phrase').count()) === 2);
  await page.getByRole('tab', { name: 'Histórico e backup' }).click();
  await page.locator('.list code').first().waitFor();
  check('histórico gravado', (await page.locator('.list code').count()) >= 1);
  await page.screenshot({ path: join(art, '4_historico.png'), fullPage: true });

  // 6) backup: exportar -> apagar tudo -> restaurar (offline)
  page.on('dialog', (d) => d.accept());
  const [bk] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Exportar backup (ZIP)' }).click()]);
  const bkPath = join(art, bk.suggestedFilename());
  await bk.saveAs(bkPath);
  await page.getByRole('button', { name: 'Apagar dados locais' }).click();
  await page.getByText('Dados locais apagados.').waitFor();
  const afterWipe = await page.locator('.list code').count();
  await page.locator('input[type=file][accept*="zip"]').setInputFiles(bkPath);
  await page.getByText(/Backup restaurado/).waitFor({ timeout: 15000 });
  const restoredSnaps = await page.locator('.list code').count();
  await page.locator('.list li', { hasText: 'Meu projeto' }).filter({ has: page.getByRole('button', { name: 'Abrir' }) }).first().getByRole('button', { name: 'Abrir' }).click();
  await page.getByRole('tab', { name: 'Frases' }).click();
  const restoredPhrases = await page.locator('.phrase').count();
  check('backup ZIP: apagar e restaurar offline', afterWipe === 0 && restoredSnaps >= 1 && restoredPhrases === 2, `após apagar=${afterWipe}, histórico restaurado=${restoredSnaps}, frases=${restoredPhrases}`);
} catch (e) {
  check('execução', false, e.message);
} finally {
  await ctx?.close().catch(() => undefined);
  server.kill();
}
check('nenhuma requisição externa', external.length === 0, external.slice(0, 5).join(', '));
writeFileSync(join(art, 'resultado.json'), JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.ok);
log(failed.length ? `${failed.length} falha(s)` : 'TODOS OS PASSOS OK');
process.exit(failed.length ? 1 : 0);
