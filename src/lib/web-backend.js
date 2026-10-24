// Backend di persistenza per il browser / telefono (PWA), con la stessa interfaccia di window.dndAPI.
// Dati in IndexedDB (database "tavolo-di-gioco"): store "collections" (un documento per collezione) e
// "backups" (istantanee complete). La scrittura sincrona di emergenza (pagehide) usa localStorage come
// "diario" che viene riassorbito al caricamento successivo.
const DB_NAME = 'tavolo-di-gioco';
const DB_VERSION = 1;
const PENDING_PREFIX = 'dnd-pending:';
const LEGACY_PREFIX = 'dnd:';
export const KNOWN = ['campaigns', 'characters', 'sessions', 'journal', 'notes', 'encounters', 'homebrew', 'settings', 'deleted'];
const MAX_AUTO = 15;
const MAX_SAFETY = 10;
const REASON_LABELS = {
  avvio: 'Avvio app', giornaliero: 'Giornaliero', manuale: 'Manuale', 'pre-ripristino': 'Prima del ripristino',
  'pre-importazione': "Prima dell'importazione", 'pre-sincronizzazione': 'Prima della sincronizzazione',
};
const SAFETY = new Set(['pre-ripristino', 'pre-importazione', 'pre-sincronizzazione']);

let dbp = null;
function db() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains('collections')) d.createObjectStore('collections');
      if (!d.objectStoreNames.contains('backups')) d.createObjectStore('backups', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Database bloccato da un\'altra scheda aperta'));
  });
  return dbp;
}
async function tx(store, mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(store, mode);
    const s = t.objectStore(store);
    let out;
    Promise.resolve(fn(s)).then((v) => { out = v; });
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('transazione annullata'));
  });
}
const reqP = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const isValidDoc = (d) => !!d && typeof d === 'object' && Array.isArray(d.items);
const docTime = (d) => Date.parse(d?.updatedAt || '') || 0;
function lsGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } }
function lsDel(k) { try { localStorage.removeItem(k); } catch { /* */ } }

// Ripiego senza IndexedDB (node nei test, browser molto vecchi): localStorage + backup in memoria.
const HAS_IDB = typeof indexedDB !== 'undefined';
const memBackups = new Map();
async function readCollection(c) {
  if (!HAS_IDB) { const t = lsGet(LEGACY_PREFIX + c); return t ? JSON.parse(t) : null; }
  return tx('collections', 'readonly', (s) => reqP(s.get(c)));
}
async function writeCollection(c, doc) {
  if (!HAS_IDB) { lsSet(LEGACY_PREFIX + c, JSON.stringify(doc)); return; }
  await tx('collections', 'readwrite', (s) => { s.put(doc, c); });
}
const backupsAll = () => (HAS_IDB ? tx('backups', 'readonly', (s) => reqP(s.getAll())) : Promise.resolve([...memBackups.values()]));
const backupGet = (id) => (HAS_IDB ? tx('backups', 'readonly', (s) => reqP(s.get(id))) : Promise.resolve(memBackups.get(id)));
const backupPut = (b) => (HAS_IDB ? tx('backups', 'readwrite', (s) => { s.put(b); }) : Promise.resolve(memBackups.set(b.id, b)));
const backupDel = (ids) => (HAS_IDB ? tx('backups', 'readwrite', (s) => { ids.forEach((id) => s.delete(id)); }) : Promise.resolve(ids.forEach((id) => memBackups.delete(id))));

let changedSinceBackup = false;

export const webBackend = {
  async load(c) {
    let doc = await readCollection(c);
    // diario di emergenza (pagehide) più recente del database → lo riassorbo
    const pend = lsGet(PENDING_PREFIX + c);
    if (pend) {
      try { const p = JSON.parse(pend); if (isValidDoc(p) && docTime(p) >= docTime(doc)) { doc = p; await writeCollection(c, p); } } catch { /* */ }
      lsDel(PENDING_PREFIX + c);
    }
    // vecchia versione (localStorage) → migrazione una tantum
    if (!doc) {
      const legacy = lsGet(LEGACY_PREFIX + c);
      if (legacy) { try { const l = JSON.parse(legacy); if (isValidDoc(l)) { doc = l; await writeCollection(c, l); } } catch { /* */ } }
    }
    return doc || null;
  },
  async save(c, doc) {
    await writeCollection(c, doc);
    lsDel(PENDING_PREFIX + c);
    changedSinceBackup = true;
    return { ok: true, savedAt: new Date().toISOString() };
  },
  /** Chiusura/pagina nascosta: IndexedDB è asincrono, quindi scrivo anche un diario sincrono. */
  saveSync(c, doc) {
    const okLs = lsSet(PENDING_PREFIX + c, JSON.stringify(doc));
    writeCollection(c, doc).then(() => lsDel(PENDING_PREFIX + c)).catch(() => {});
    changedSinceBackup = true;
    return okLs ? { ok: true } : { ok: false, error: 'memoria piena' };
  },
  async listCollections() { return KNOWN; },

  // ---------------------------------------------------------------- backup
  async listBackups() {
    const all = await backupsAll();
    return (all || []).map(({ data, ...meta }) => meta).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
  async createBackup(label, reason = 'manuale') {
    const data = {};
    const counts = {};
    let bytes = 0;
    for (const c of KNOWN) {
      const doc = await readCollection(c);
      if (doc) { data[c] = doc; counts[c] = doc.items.length; bytes += JSON.stringify(doc).length; }
    }
    const createdAt = new Date().toISOString();
    const kind = reason === 'manuale' ? 'manual' : SAFETY.has(reason) ? 'safety' : 'auto';
    const b = { id: createdAt.replace(/[:.]/g, '-') + '-' + reason, createdAt, label: reason === 'manuale' ? label : null, reason, reasonLabel: REASON_LABELS[reason] || reason, kind, counts, bytes, data };
    await backupPut(b);
    await this._rotate();
    changedSinceBackup = false;
    return { ok: true, id: b.id, label: b.label || b.reasonLabel, counts };
  },
  async _rotate() {
    const list = await this.listBackups();
    const drop = [...list.filter((b) => b.kind === 'auto').slice(MAX_AUTO), ...list.filter((b) => b.kind === 'safety').slice(MAX_SAFETY)];
    if (drop.length) await backupDel(drop.map((b) => b.id));
  },
  async restoreBackup(id) {
    const b = await backupGet(id);
    if (!b) return { ok: false, error: 'backup non trovato' };
    await this.createBackup(null, 'pre-ripristino');
    for (const c of KNOWN) {
      const doc = b.data[c] || { schemaVersion: 1, collection: c, updatedAt: new Date().toISOString(), items: [] };
      await writeCollection(c, doc);
      lsDel(PENDING_PREFIX + c);
    }
    return { ok: true };
  },
  async deleteBackup(id) { await backupDel([id]); return { ok: true }; },
  /** Backup automatico all'avvio (al massimo uno ogni 6 ore) se ci sono dati. */
  async autoBackup() {
    const list = await this.listBackups();
    const lastAuto = list.find((b) => b.kind === 'auto');
    if (lastAuto && Date.now() - Date.parse(lastAuto.createdAt) < 6 * 3600 * 1000) return null;
    const chars = await readCollection('characters');
    if (!chars?.items?.length) return null;
    return this.createBackup(null, 'avvio');
  },

  // ---------------------------------------------------------------- export / import completi
  async exportDoc() {
    const collections = {};
    for (const c of KNOWN) { const d = await readCollection(c); if (d) collections[c] = d; }
    return { format: 'dnd-tavolo-export', version: 1, exportedAt: new Date().toISOString(), collections };
  },
  async importDoc(doc) {
    if (!doc || doc.format !== 'dnd-tavolo-export' || typeof doc.collections !== 'object') return { ok: false, error: 'File non valido: non è un\'esportazione di Tavolo di Gioco' };
    const cols = Object.entries(doc.collections).filter(([c, d]) => KNOWN.includes(c) && isValidDoc(d));
    if (!cols.length) return { ok: false, error: 'Il file non contiene dati riconosciuti' };
    await this.createBackup(null, 'pre-importazione');
    const counts = {};
    for (const [c, d] of cols) { await writeCollection(c, d); counts[c] = d.items.length; }
    return { ok: true, counts };
  },

  async info() {
    let persisted = false; let usage = null; let quota = null;
    try { persisted = await navigator.storage?.persisted?.(); } catch { /* */ }
    try { const e = await navigator.storage?.estimate?.(); usage = e?.usage; quota = e?.quota; } catch { /* */ }
    return { dataDir: 'Memoria interna dell\'app (questo dispositivo)', version: 'web', packaged: false, persisted, usage, quota };
  },
  /** Chiede al browser di non cancellare mai i dati (Chrome lo concede alle app installate). */
  async requestPersistence() {
    try { if (navigator.storage?.persist) return await navigator.storage.persist(); } catch { /* */ }
    return false;
  },
  get changedSinceBackup() { return changedSinceBackup; },
};
