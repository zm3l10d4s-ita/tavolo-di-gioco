// Caricatore dati di riferimento (SRD) in sola lettura + contenuti homebrew dell'utente.
// File: data/srd/<name>.json  formato { meta: {...}, items: [...] }
// Homebrew: collezione 'homebrew' dello store, item { id, kind: <name>, data: {...} }
import * as store from './store.js';

const BASE = new URL('../../data/srd/', import.meta.url);
const CATALOG_BASE = new URL('../../data/catalog/', import.meta.url);
/** Dataset con un catalogo di voci "da completare" (nomi non SRD, senza testo): data/catalog/<name>.json */
export const CATALOG_DATASETS = new Set(['spells', 'classes', 'subclasses', 'races', 'feats', 'backgrounds', 'magicItems', 'classOptions']);
/** Dataset senza file SRD (solo catalogo + homebrew). */
const NO_SRD = new Set(['classOptions']);
const rawCatalog = new Map();
const cache = new Map();
const raw = new Map();

export const DATASETS = [
  'races', 'subraces', 'classes', 'subclasses', 'spells', 'skills', 'abilities', 'conditions',
  'damageTypes', 'languages', 'backgrounds', 'feats', 'equipment', 'magicItems', 'monsters',
  'levels', 'tables', 'weaponProperties', 'rules', 'classOptions',
];

async function loadCatalog(name) {
  if (!CATALOG_DATASETS.has(name)) return { items: [] };
  if (rawCatalog.has(name)) return rawCatalog.get(name);
  const p = fetch(new URL(name + '.json', CATALOG_BASE)).then((r) => (r.ok ? r.json() : { items: [] })).catch(() => ({ items: [] }));
  rawCatalog.set(name, p);
  return p;
}

async function loadRaw(name) {
  if (NO_SRD.has(name)) return { items: [] };
  if (raw.has(name)) return raw.get(name);
  const p = fetch(new URL(name + '.json', BASE)).then((r) => {
    if (!r.ok) throw new Error(`Dataset SRD mancante: ${name}`);
    return r.json();
  });
  raw.set(name, p);
  return p;
}

/** Ritorna gli item SRD + catalogo "da completare" (stub:true) + homebrew (source:'Homebrew', _homebrew:true).
 *  Una voce homebrew con lo stesso id di una voce del catalogo la sostituisce (voce "completata"). */
export async function load(name) {
  if (cache.has(name)) return cache.get(name);
  let doc;
  try { doc = await loadRaw(name); } catch (e) { doc = { items: [] }; console.warn(e.message); }
  const cat = await loadCatalog(name);
  const hb = store.list('homebrew', (h) => h.kind === name)
    .map((h) => ({ source: 'Homebrew', ...h.data, id: h.data?.id || h.id, _homebrew: true, _hbId: h.id }));
  const hbIds = new Set(hb.map((h) => h.id));
  const stubs = (cat.items || []).filter((x) => !hbIds.has(x.id)).map((x) => ({ ...x, _catalog: true }));
  const items = [...(doc.items || []), ...stubs, ...hb];
  cache.set(name, items);
  return items;
}
export async function meta(name) { return (await loadRaw(name)).meta || {}; }
export function cached(name) { return cache.get(name); }
export function invalidate(name) { cache.delete(name); }
export async function byId(name, id) { return (await load(name)).find((x) => x.id === id) || null; }
