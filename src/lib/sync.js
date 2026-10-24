// Sincronizzazione tra dispositivi tramite file (PC ↔ telefono ↔ portatile). Modulo PURO (testabile con node).
//
// File di sincronizzazione: { format: 'dnd-tavolo-sync', version: 1, exportedAt, device: { id, name },
//   collections: { <col>: [items] }, deleted: [ { id: '<col>:<itemId>', collection, itemId, deletedAt } ] }
//
// Unione: per ogni elemento vince l'evento più recente tra
//   - la versione locale (updatedAt), la versione ricevuta (updatedAt), un'eliminazione (deletedAt, da uno dei due lati).
// A parità vince il locale. Nessun dato viene perso senza un backup: l'app crea un backup prima di applicare.

export const SYNC_FORMAT = 'dnd-tavolo-sync';
/** Collezioni sincronizzate (le impostazioni restano per-dispositivo). */
export const SYNC_COLLECTIONS = ['campaigns', 'characters', 'sessions', 'journal', 'notes', 'encounters', 'homebrew'];

const t = (iso) => { const n = Date.parse(iso || ''); return Number.isFinite(n) ? n : 0; };

export function buildSyncDoc({ collections, deleted = [], device = {}, now = new Date().toISOString() }) {
  const out = {};
  for (const c of SYNC_COLLECTIONS) out[c] = (collections[c] || []).map((x) => x);
  return { format: SYNC_FORMAT, version: 1, exportedAt: now, device, collections: out, deleted: deleted.filter((d) => SYNC_COLLECTIONS.includes(d.collection)) };
}

/** Accetta anche un'esportazione completa ("dnd-tavolo-export") e la converte. */
export function normalizeIncoming(doc) {
  if (!doc || typeof doc !== 'object') throw new Error('File non valido');
  if (doc.format === SYNC_FORMAT) return doc;
  if (doc.format === 'dnd-tavolo-export' && doc.collections) {
    const collections = {};
    for (const c of SYNC_COLLECTIONS) collections[c] = doc.collections[c]?.items || [];
    return { format: SYNC_FORMAT, version: 1, exportedAt: doc.exportedAt, device: { name: 'esportazione completa' }, collections, deleted: doc.collections.deleted?.items || [] };
  }
  throw new Error('Questo file non è un file di Tavolo di Gioco');
}

/**
 * Calcola l'unione. local = { collections: { col: [items] }, deleted: [tombstones] }, incoming = sync doc.
 * Ritorna { collections: { col: [items] }, deleted: [tombstones], changed: Set(col), summary: { col: {added, updated, removed, kept} }, totals }
 */
export function mergeSync(local, incoming) {
  const inc = normalizeIncoming(incoming);
  const tomb = new Map();
  for (const d of [...(local.deleted || []), ...(inc.deleted || [])]) {
    const key = d.id || `${d.collection}:${d.itemId}`;
    const prev = tomb.get(key);
    if (!prev || t(d.deletedAt) > t(prev.deletedAt)) tomb.set(key, { ...d, id: key });
  }
  const collections = {}; const summary = {}; const changed = new Set();
  const totals = { added: 0, updated: 0, removed: 0, kept: 0 };
  for (const c of SYNC_COLLECTIONS) {
    const L = new Map((local.collections?.[c] || []).map((x) => [x.id, x]));
    const R = new Map((inc.collections?.[c] || []).filter((x) => x && x.id).map((x) => [x.id, x]));
    const ids = new Set([...L.keys(), ...R.keys()]);
    const res = []; const s = { added: 0, updated: 0, removed: 0, kept: 0 };
    for (const id of ids) {
      const l = L.get(id); const r = R.get(id); const d = tomb.get(`${c}:${id}`);
      const tl = l ? t(l.updatedAt) : -1; const tr = r ? t(r.updatedAt) : -1; const td = d ? t(d.deletedAt) : -1;
      if (td >= 0 && td >= Math.max(tl, tr)) { if (l) { s.removed++; changed.add(c); } continue; }
      if (r && (!l || tr > tl)) {
        res.push(r);
        if (!l) s.added++; else if (JSON.stringify(l) !== JSON.stringify(r)) s.updated++; else s.kept++;
        if (!l || JSON.stringify(l) !== JSON.stringify(r)) changed.add(c);
      } else if (l) { res.push(l); s.kept++; }
    }
    collections[c] = res; summary[c] = s;
    for (const k of Object.keys(totals)) totals[k] += s[k];
  }
  // le eliminazioni restano registrate (servono agli altri dispositivi); quelle più vecchie di 180 giorni si scartano
  const cutoff = Date.now() - 180 * 24 * 3600 * 1000;
  const deleted = [...tomb.values()].filter((d) => t(d.deletedAt) > cutoff);
  const unified = unifyCampaigns(collections, deleted, changed, summary, totals);
  return { collections, deleted, changed, summary, totals, unified, from: inc.device || {}, exportedAt: inc.exportedAt };
}

export const DEFAULT_CAMPAIGN_ID = 'campagna-principale';
const CAMPAIGN_REFS = ['sessions', 'characters', 'journal', 'notes', 'encounters'];
const nameKey = (c) => String(c.name || '').trim().toLowerCase();

/**
 * Ogni dispositivo crea al primo avvio la propria "La mia campagna": dopo l'unione ci sarebbero due campagne
 * con lo stesso nome. Le campagne con nome identico vengono fuse in una sola (scelta deterministica, così tutti
 * i dispositivi convergono): sessioni, schede e voci di diario passano alla campagna tenuta, le altre vengono eliminate.
 * Modifica `collections`/`deleted` sul posto; ritorna [{ name, merged }].
 */
export function unifyCampaigns(collections, deleted, changed = new Set(), summary = {}, totals = {}, now = new Date().toISOString()) {
  const groups = new Map();
  for (const c of collections.campaigns || []) {
    const k = nameKey(c); if (!k) continue;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(c);
  }
  const out = [];
  const count = (id) => (collections.sessions || []).filter((s) => s.campaignId === id).length;
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    list.sort((a, b) => (b.id === DEFAULT_CAMPAIGN_ID) - (a.id === DEFAULT_CAMPAIGN_ID) || count(b.id) - count(a.id)
      || t(a.createdAt) - t(b.createdAt) || String(a.id).localeCompare(String(b.id)));
    const keep = list[0]; const drop = list.slice(1); const dropIds = new Set(drop.map((c) => c.id));
    const party = [...new Set([...(keep.partyIds || []), ...drop.flatMap((c) => c.partyIds || [])])];
    const active = keep.activeSessionId || drop.map((c) => c.activeSessionId).find(Boolean) || null;
    collections.campaigns = collections.campaigns.filter((c) => !dropIds.has(c.id))
      .map((c) => (c.id === keep.id ? { ...c, partyIds: party, activeSessionId: active, updatedAt: now } : c));
    for (const col of CAMPAIGN_REFS) {
      if (!collections[col]) continue;
      let touched = false;
      collections[col] = collections[col].map((x) => (dropIds.has(x.campaignId) ? ((touched = true), { ...x, campaignId: keep.id, updatedAt: now }) : x));
      if (touched) changed.add(col);
    }
    for (const id of dropIds) deleted.push({ id: `campaigns:${id}`, collection: 'campaigns', itemId: id, deletedAt: now });
    changed.add('campaigns');
    if (summary.campaigns) { summary.campaigns.merged = (summary.campaigns.merged || 0) + drop.length; }
    totals.merged = (totals.merged || 0) + drop.length;
    out.push({ name: keep.name, merged: drop.length });
  }
  return out;
}

/** Descrizione leggibile del riepilogo. */
export function describeSummary(m, labels = {}) {
  const parts = [];
  for (const [c, s] of Object.entries(m.summary)) {
    const bits = [];
    const w = (n, one, many) => `${n} ${n === 1 ? one : many}`;
    if (s.added) bits.push(w(s.added, 'nuovo', 'nuovi'));
    if (s.updated) bits.push(w(s.updated, 'aggiornato', 'aggiornati'));
    if (s.removed) bits.push(w(s.removed, 'eliminato', 'eliminati'));
    if (bits.length) parts.push(`${labels[c] || c}: ${bits.join(', ')}`);
  }
  for (const u of m.unified || []) parts.push(`Campagne con lo stesso nome unite in una sola: «${u.name}»`);
  return parts;
}
