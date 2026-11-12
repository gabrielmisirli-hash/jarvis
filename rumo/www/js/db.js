// IndexedDB: "kv" guarda dados do usuário (plano, ficha, pontos...), "blobs" guarda o mapa offline.
// O iOS às vezes derruba a conexão ("Connection to Indexed Database server lost"): reabrimos e tentamos de novo.

const DB_NAME = 'rumo';
const DB_VERSION = 1;
let dbPromise = null;

function forget(db) {
  try {
    db?.close();
  } catch {
    // conexão já fechada
  }
  dbPromise = null;
}

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) {
      reject(new Error('Este navegador não permite salvar dados offline'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs');
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onclose = () => forget(db);
      db.onversionchange = () => forget(db);
      resolve(db);
    };
    req.onerror = () => reject(req.error || new Error('Falha ao abrir o banco local'));
    req.onblocked = () => reject(new Error('Feche outras abas do app e tente de novo'));
  }).catch((err) => {
    dbPromise = null;
    throw err;
  });
  return dbPromise;
}

async function runOnce(storeName, mode, action) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    let tx;
    try {
      tx = db.transaction(storeName, mode);
    } catch (err) {
      forget(db); // conexão morta: a próxima tentativa reabre
      reject(err);
      return;
    }
    const request = action(tx.objectStore(storeName));
    tx.oncomplete = () => resolve(request ? request.result : undefined);
    tx.onerror = () => reject(tx.error || new Error('Falha ao salvar'));
    tx.onabort = () => reject(tx.error || new Error('Operação cancelada (espaço cheio?)'));
  });
}

async function run(storeName, mode, action) {
  try {
    return await runOnce(storeName, mode, action);
  } catch (err) {
    if (err?.name === 'QuotaExceededError') throw new Error('Sem espaço no aparelho para salvar');
    return runOnce(storeName, mode, action); // uma nova tentativa com conexão reaberta
  }
}

export const kvGet = (key) => run('kv', 'readonly', (s) => s.get(key));
export const kvSet = (key, value) => run('kv', 'readwrite', (s) => s.put(value, key));
export const kvDel = (key) => run('kv', 'readwrite', (s) => s.delete(key));
export const blobGet = (key) => run('blobs', 'readonly', (s) => s.get(key));
export const blobSet = (key, value) => run('blobs', 'readwrite', (s) => s.put(value, key));
export const blobDel = (key) => run('blobs', 'readwrite', (s) => s.delete(key));
export const blobKeys = () => run('blobs', 'readonly', (s) => s.getAllKeys());

/** Apaga tudo: fecha a conexão e espera o banco ser removido de verdade. */
export async function deleteAllData() {
  if (dbPromise) forget(await dbPromise.catch(() => null));
  await new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error || new Error('Não foi possível apagar os dados'));
    req.onblocked = () => reject(new Error('Feche outras abas do app e tente de novo'));
  });
}
