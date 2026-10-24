// Store del renderer: dati utente in memoria + autosave su disco (via window.dndAPI).
// API stabile — vedi CONTRACTS.md. Ogni modifica (put/update/remove) è salvata
// automaticamente dopo SAVE_DEBOUNCE_MS (al massimo dopo SAVE_MAX_WAIT_MS anche con modifiche continue),
// con retry in caso di errore, flush su richiesta del main alla chiusura e saveSync su beforeunload.
import { uid, nowIso } from './util.js';
import { webBackend } from './web-backend.js';
import { downloadText, pickText, stampForFile } from './files.js';
import { buildSyncDoc, mergeSync, SYNC_COLLECTIONS, DEFAULT_CAMPAIGN_ID } from './sync.js';

export const SCHEMA_VERSION = 1;
export const COLLECTIONS = [
  'campaigns', 'characters', 'sessions', 'journal', 'notes', 'encounters', 'homebrew', 'settings',
  'deleted', // registro delle eliminazioni (serve alla sincronizzazione tra dispositivi)
];
const NO_TOMBSTONE = new Set(['settings', 'deleted']);
const SAVE_DEBOUNCE_MS = 300;
const SAVE_MAX_WAIT_MS = 2000;
const RETRY_DELAYS_MS = [500, 1000, 2000, 5000, 10000];
const UNDO_LIMIT = 30;
const UNDO_COALESCE_MS = 1200;
const SEED_URL = new URL('../../data/seed/seed-fjellbjorn.json', import.meta.url);

// Adattatore di persistenza: Electron (file JSON su disco) oppure browser/telefono (IndexedDB, vedi web-backend.js).
const hasElectron = typeof window !== 'undefined' && !!window.dndAPI;
const backend = hasElectron ? window.dndAPI : webBackend;

const data = {};            // collection -> Map(id -> item)
const schemaVersions = {};  // collection -> schemaVersion del documento caricato
const dirty = new Set();    // collezioni con modifiche non ancora scritte
const timers = {};
const firstDirtyAt = {};    // collection -> timestamp della prima modifica non salvata
const inflight = {};        // collection -> Promise del salvataggio in corso
const retries = {};         // collection -> tentativi falliti consecutivi
const undoStacks = {};      // collection -> [{ id, before, at }]
const listeners = new Set();
const statusListeners = new Set();
const storageListeners = new Set();
const storageEvents = [];
let status = { state: 'idle', lastSavedAt: null, error: null };
let initialized = false;
let suspended = false;      // durante ripristino/import: niente salvataggi

function setStatus(patch) {
  status = { ...status, ...patch };
  statusListeners.forEach((fn) => { try { fn(status); } catch (e) { console.error(e); } });
}
function emit(collection, id) { listeners.forEach((fn) => { try { fn(collection, id); } catch (e) { console.error(e); } }); }
function ensure(collection) {
  if (!data[collection]) data[collection] = new Map();
  return data[collection];
}

function serialize(collection) {
  return {
    schemaVersion: schemaVersions[collection] || SCHEMA_VERSION,
    collection,
    updatedAt: nowIso(),
    items: [...ensure(collection).values()],
  };
}

function refreshStatus() {
  if (status.state === 'error' && dirty.size) return;
  const busy = dirty.size || Object.values(inflight).some(Boolean);
  setStatus({ state: busy ? (Object.values(inflight).some(Boolean) ? 'saving' : 'pending') : 'saved' });
}

async function writeCollection(collection) {
  dirty.delete(collection);
  delete firstDirtyAt[collection];
  clearTimeout(timers[collection]);
  setStatus({ state: 'saving' });
  try {
    const res = await backend.save(collection, serialize(collection));
    if (!res || res.ok === false) throw new Error(res?.error || 'salvataggio fallito');
    if (res.schemaVersion) schemaVersions[collection] = res.schemaVersion;
    retries[collection] = 0;
    status.lastSavedAt = nowIso();
    status.error = null;
    if (status.state === 'error') status.state = 'saving';
  } catch (err) {
    if (!dirty.has(collection)) { dirty.add(collection); firstDirtyAt[collection] = Date.now(); }
    const n = (retries[collection] = (retries[collection] || 0) + 1);
    const delay = RETRY_DELAYS_MS[Math.min(n - 1, RETRY_DELAYS_MS.length - 1)];
    setStatus({ state: 'error', error: `${collection}: ${String(err.message || err)} (nuovo tentativo tra ${Math.round(delay / 1000) || 1} s)` });
    console.error('[store] errore salvataggio', collection, err);
    clearTimeout(timers[collection]);
    timers[collection] = setTimeout(() => flushCollection(collection), delay);
  }
}

/** Salva una collezione; le scritture della stessa collezione sono serializzate. */
function flushCollection(collection) {
  if (suspended) return Promise.resolve();
  const prev = inflight[collection] || Promise.resolve();
  const p = prev.then(() => (dirty.has(collection) && !suspended ? writeCollection(collection) : undefined));
  inflight[collection] = p;
  return p.finally(() => {
    if (inflight[collection] === p) inflight[collection] = null;
    refreshStatus();
  });
}

function scheduleSave(collection) {
  if (!dirty.has(collection)) { dirty.add(collection); firstDirtyAt[collection] = Date.now(); }
  if (status.state !== 'error') setStatus({ state: 'pending' });
  clearTimeout(timers[collection]);
  const waited = Date.now() - (firstDirtyAt[collection] || Date.now());
  const delay = Math.max(0, Math.min(SAVE_DEBOUNCE_MS, SAVE_MAX_WAIT_MS - waited));
  timers[collection] = setTimeout(() => flushCollection(collection), delay);
}

// ------------------------------------------------------------------ undo locale
function changedKeys(before, after) {
  if (!before || !after) return '*';
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  keys.delete('updatedAt');
  const out = [];
  for (const k of keys) {
    const a = before[k]; const b = after[k];
    if (a === b) continue;
    if (a && b && typeof a === 'object' && typeof b === 'object' && JSON.stringify(a) === JSON.stringify(b)) continue;
    out.push(k);
  }
  return out.sort().join(',');
}
function pushUndo(collection, id, before, after) {
  if (collection === 'settings') return;
  const st = (undoStacks[collection] ||= []);
  const last = st[st.length - 1];
  const now = Date.now();
  const keys = changedKeys(before, after);
  if (keys === '') return; // nessun cambiamento reale
  // modifiche rapide e consecutive agli stessi campi dello stesso elemento (digitazione) = un solo passo
  if (last && last.id === id && last.keys === keys && keys !== '*' && now - last.at < UNDO_COALESCE_MS) { last.at = now; return; }
  st.push({ id, before: before ? structuredClone(before) : null, at: now, keys });
  if (st.length > UNDO_LIMIT) st.shift();
}

/** Numero di passi annullabili per la collezione. */
export function canUndo(collection) { return (undoStacks[collection] || []).length; }

/** Annulla l'ultima modifica (put/update/remove) della collezione. Ritorna { id, restored } o null. */
export function undoLast(collection) {
  const st = undoStacks[collection];
  const entry = st?.pop();
  if (!entry) return null;
  const map = ensure(collection);
  if (entry.before) { map.set(entry.id, entry.before); clearTombstone(collection, entry.id); } else map.delete(entry.id);
  scheduleSave(collection);
  emit(collection, entry.id);
  return { id: entry.id, restored: entry.before ? 'previous' : 'removed' };
}
function clearUndo(collection) { if (collection) delete undoStacks[collection]; else Object.keys(undoStacks).forEach((k) => delete undoStacks[k]); }

// ------------------------------------------------------------------ caricamento
async function loadCollection(c) {
  let doc = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      doc = await backend.load(c);
      if (doc && doc.ok === false) throw new Error(doc.error);
      break;
    } catch (err) {
      console.error('[store] errore caricamento', c, err);
      if (attempt === 2) throw new Error(`Impossibile caricare «${c}»: ${err.message || err}`);
      await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
    }
  }
  schemaVersions[c] = doc?.schemaVersion || SCHEMA_VERSION;
  data[c] = new Map((Array.isArray(doc?.items) ? doc.items : []).filter((it) => it && it.id).map((it) => [it.id, it]));
}

function onStorageEvent(ev) {
  storageEvents.push(ev);
  if (storageEvents.length > 50) storageEvents.shift();
  storageListeners.forEach((fn) => { try { fn(ev); } catch (e) { console.error(e); } });
  if (ev.level === 'warn' || ev.level === 'error') {
    console.warn('[storage]', ev.message);
    // notifica visibile (il ToastHost può non essere ancora montato all'avvio)
    setTimeout(() => import('../components/ui.js').then((m) => m.toast(ev.message, ev.level === 'error' ? 'bad' : '')).catch(() => {}), initialized ? 0 : 1500);
  }
}

/** Primo avvio: importa il personaggio dell'utente (Fjellbjørn) e crea la campagna di default. */
async function seedIfNeeded() {
  const settings = get('settings', 'app');
  if (settings?.seeded) return false;
  if (ensure('characters').size || ensure('homebrew').size) { setSetting('seeded', true); return false; }
  let seed;
  try {
    const r = await fetch(SEED_URL);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    seed = await r.json();
  } catch (err) {
    console.warn('[store] seme non disponibile', err);
    return false;
  }
  const chars = Array.isArray(seed?.characters) ? seed.characters : [];
  const hb = Array.isArray(seed?.homebrew) ? seed.homebrew : [];
  const campaign = put('campaigns', {
    id: DEFAULT_CAMPAIGN_ID, name: 'La mia campagna', description: '', partyIds: [], activeSessionId: null,
  });
  const ids = [];
  for (const ch of chars) {
    const saved = put('characters', { ...ch, campaignId: ch.campaignId || campaign.id });
    ids.push(saved.id);
  }
  for (const h of hb) put('homebrew', h);
  put('campaigns', { ...campaign, partyIds: ids });
  const cur = get('settings', 'app') || { id: 'app' };
  put('settings', { ...cur, seeded: true, activeCampaignId: cur.activeCampaignId || campaign.id });
  clearUndo();
  return true;
}

/** Carica tutte le collezioni dal disco. Da chiamare una volta all'avvio. */
export async function initStore() {
  if (initialized) return;
  if (hasElectron && backend.onStorageEvent) backend.onStorageEvent(onStorageEvent);
  for (const c of COLLECTIONS) await loadCollection(c);
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('beforeunload', flushAllSync);
    window.addEventListener('pagehide', flushAllSync);
  }
  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushAll(); });
  }
  if (hasElectron && backend.onFlushRequest) backend.onFlushRequest(() => flushAll());
  try { if (await seedIfNeeded()) await flushAll(); } catch (err) { console.error('[store] seme', err); }
  if (!hasElectron) {
    webBackend.requestPersistence().catch(() => {});
    webBackend.autoBackup().catch((e) => console.warn('[store] backup automatico', e));
  }
  initialized = true;
  setStatus({ state: dirty.size ? 'pending' : 'saved' });
}

/** Scrive subito tutto ciò che è in sospeso (asincrono). Attende anche i salvataggi già in corso. */
export async function flushAll() {
  COLLECTIONS.forEach((c) => clearTimeout(timers[c]));
  const cols = new Set([...dirty, ...Object.keys(inflight).filter((c) => inflight[c])]);
  await Promise.all([...cols].map(flushCollection));
}
/** Scrittura sincrona (chiusura finestra). */
export function flushAllSync() {
  if (suspended) return;
  for (const c of [...dirty]) {
    clearTimeout(timers[c]);
    try {
      const res = backend.saveSync(c, serialize(c));
      if (res && res.ok === false) throw new Error(res.error);
      dirty.delete(c);
      delete firstDirtyAt[c];
    } catch (err) { console.error('[store] saveSync fallito', c, err); }
  }
}

export function list(collection, filterFn) {
  const arr = [...(data[collection]?.values() || [])];
  return filterFn ? arr.filter(filterFn) : arr;
}
export function get(collection, id) { return data[collection]?.get(id) || null; }

/** Inserisce o sostituisce un oggetto. Assegna id/createdAt se mancanti. Ritorna l'oggetto salvato. */
export function put(collection, obj) {
  const item = { ...obj };
  if (!item.id) item.id = uid();
  if (!item.createdAt) item.createdAt = nowIso();
  item.updatedAt = nowIso();
  const map = ensure(collection);
  pushUndo(collection, item.id, map.get(item.id) || null, item);
  map.set(item.id, item);
  clearTombstone(collection, item.id);
  scheduleSave(collection);
  emit(collection, item.id);
  return item;
}

/** Aggiorna un oggetto: `patch` è un oggetto (merge superficiale) o una funzione (item) => nuovoItem. */
export function update(collection, id, patch) {
  const cur = get(collection, id);
  if (!cur) throw new Error(`update: ${collection}/${id} non trovato`);
  const next = typeof patch === 'function' ? patch(structuredClone(cur)) : { ...cur, ...patch };
  return put(collection, { ...(next ?? cur), id });
}

export function remove(collection, id) {
  const map = ensure(collection);
  if (map.has(id)) {
    pushUndo(collection, id, map.get(id), null);
    if (!NO_TOMBSTONE.has(collection)) {
      const key = `${collection}:${id}`;
      ensure('deleted').set(key, { id: key, collection, itemId: id, deletedAt: nowIso() });
      scheduleSave('deleted');
    }
  }
  map.delete(id);
  scheduleSave(collection);
  emit(collection, id);
}

function clearTombstone(collection, id) {
  if (NO_TOMBSTONE.has(collection)) return;
  const del = ensure('deleted');
  if (del.delete(`${collection}:${id}`)) scheduleSave('deleted');
}

/** Sostituisce un'intera collezione (usato da import/ripristino). */
export function replaceCollection(collection, items) {
  data[collection] = new Map(items.map((it) => [it.id, it]));
  clearUndo(collection);
  scheduleSave(collection);
  emit(collection, null);
}

/** Ricarica tutto dal disco (dopo un ripristino backup). Scarta le modifiche in sospeso. */
export async function reloadAll() {
  COLLECTIONS.forEach((c) => clearTimeout(timers[c]));
  await Promise.all(Object.values(inflight).filter(Boolean));
  dirty.clear();
  for (const c of COLLECTIONS) { delete firstDirtyAt[c]; retries[c] = 0; }
  clearUndo();
  for (const c of COLLECTIONS) {
    await loadCollection(c);
    emit(c, null);
  }
  setStatus({ state: 'saved', error: null });
}

// ------------------------------------------------------------------ backup / rollback (wrapper del main)
async function guarded(fn, { reload = false } = {}) {
  await flushAll();
  if (reload) suspended = true;
  try {
    const res = await fn();
    if (reload && res?.ok) { suspended = false; await reloadAll(); }
    return res;
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  } finally { suspended = false; }
}
export async function listBackups() { return backend.listBackups(); }
/** Backup manuale con etichetta (scrive prima le modifiche in sospeso). */
export function createBackup(label) { return guarded(() => backend.createBackup(label || 'Backup manuale')); }
/** Ripristina un backup (il main crea prima un backup "pre-ripristino") e ricarica tutto. */
export function restoreBackup(id) { return guarded(() => backend.restoreBackup(id), { reload: true }); }
export function deleteBackup(id) { return backend.deleteBackup(id); }
/** Esporta tutti i dati in un file JSON (desktop: finestra "Salva"; telefono: cartella Download). */
export function exportAll() {
  if (hasElectron) return guarded(() => backend.exportAll());
  return guarded(async () => {
    const doc = await webBackend.exportDoc();
    return downloadText(`tavolo-di-gioco-completo_${stampForFile()}.json`, JSON.stringify(doc));
  });
}
/** Importa dati da un file JSON (con validazione e backup preventivo) e ricarica tutto. Sostituisce i dati. */
export async function importAll() {
  if (hasElectron) return guarded(() => backend.importAll(), { reload: true });
  const f = await pickText(); // prima il selettore: deve partire dal gesto dell'utente
  if (!f) return { ok: false, canceled: true };
  let doc;
  try { doc = JSON.parse(f.text); } catch { return { ok: false, error: 'Il file non è un JSON valido' }; }
  return guarded(() => webBackend.importDoc(doc), { reload: true });
}
export async function appInfo() { return backend.info(); }
export function openDataDir() { return hasElectron ? backend.openDataDir() : Promise.resolve(); }
export const isDesktop = hasElectron;

// ------------------------------------------------------------------ sincronizzazione tra dispositivi
const DEVICE_KEY = 'dnd-device';
const SYNC_KEY = 'dnd-sync-info';
function lsJson(k, def) { try { return JSON.parse(localStorage.getItem(k)) ?? def; } catch { return def; } }
function lsPut(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* */ } }
/** Identità di questo dispositivo (per il nome dei file e il riepilogo). */
export function deviceInfo() {
  let d = lsJson(DEVICE_KEY, null);
  if (!d?.id) {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    const name = hasElectron ? 'PC' : /Android|iPhone|iPad|Mobile/i.test(ua) ? 'Telefono' : 'Browser';
    d = { id: uid(), name };
    lsPut(DEVICE_KEY, d);
  }
  return d;
}
export function setDeviceName(name) { const d = deviceInfo(); lsPut(DEVICE_KEY, { ...d, name: String(name || d.name).slice(0, 40) }); }
/** { lastSentAt, lastReceivedAt, lastReceivedFrom } */
export function syncInfo() { return lsJson(SYNC_KEY, {}); }
/** Elementi modificati dopo l'ultimo invio (per ricordare di sincronizzare). */
export function changesSinceLastSend() {
  const since = Date.parse(syncInfo().lastSentAt || '') || 0;
  let n = 0;
  for (const c of SYNC_COLLECTIONS) for (const it of ensure(c).values()) if ((Date.parse(it.updatedAt || '') || 0) > since) n++;
  for (const d of ensure('deleted').values()) if ((Date.parse(d.deletedAt || '') || 0) > since) n++;
  return n;
}
function localSnapshot() {
  const collections = {};
  for (const c of SYNC_COLLECTIONS) collections[c] = [...ensure(c).values()];
  return { collections, deleted: [...ensure('deleted').values()] };
}
/** Prepara il file da inviare a un altro dispositivo. Ritorna { filename, text, count }. */
export async function syncExport() {
  await flushAll();
  const dev = deviceInfo();
  const doc = buildSyncDoc({ ...localSnapshot(), device: dev });
  const count = SYNC_COLLECTIONS.reduce((n, c) => n + doc.collections[c].length, 0);
  const slugName = dev.name.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-');
  return { filename: `tavolo-sync_${slugName}_${stampForFile()}.json`, text: JSON.stringify(doc), count };
}
export function markSent() { lsPut(SYNC_KEY, { ...syncInfo(), lastSentAt: nowIso() }); }
/** Anteprima dell'unione di un file ricevuto (nessuna modifica ai dati). */
export function syncPreview(text) {
  let doc;
  try { doc = JSON.parse(text); } catch { throw new Error('Il file non è un JSON valido'); }
  return mergeSync(localSnapshot(), doc);
}
/** Applica l'unione calcolata da syncPreview: backup, poi sostituzione delle collezioni cambiate. */
export async function syncApply(merge) {
  await flushAll();
  const b = hasElectron ? await backend.createBackup('Prima della sincronizzazione') : await backend.createBackup(null, 'pre-sincronizzazione');
  if (b && b.ok === false) return { ok: false, error: 'Backup preventivo non riuscito: ' + (b.error || '') };
  for (const c of merge.changed) replaceCollection(c, merge.collections[c]);
  replaceCollection('deleted', merge.deleted);
  await flushAll();
  lsPut(SYNC_KEY, { ...syncInfo(), lastReceivedAt: nowIso(), lastReceivedFrom: merge.from?.name || '' });
  return { ok: true, totals: merge.totals };
}

// Impostazioni: singolo documento id='app' nella collezione settings
export function getSetting(key, fallback) { return get('settings', 'app')?.[key] ?? fallback; }
export function setSetting(key, value) {
  const cur = get('settings', 'app') || { id: 'app' };
  if (cur[key] === value) return;
  put('settings', { ...cur, [key]: value });
}

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function subscribeStatus(fn) { statusListeners.add(fn); fn(status); return () => statusListeners.delete(fn); }
export function getStatus() { return status; }
/** Eventi dello storage (recuperi da .bak/backup, errori di salvataggio, migrazioni, ripristini). */
export function subscribeStorageEvents(fn) { storageListeners.add(fn); return () => storageListeners.delete(fn); }
export function getStorageEvents() { return storageEvents.slice(); }
/** True se ci sono modifiche non ancora scritte su disco. */
export function hasPendingChanges() { return dirty.size > 0 || Object.values(inflight).some(Boolean); }
