// Catalogo "da completare" + salvataggio delle voci importate da testo incollato.
import * as store from './store.js';
import { slug, uid } from './util.js';

export const DATASET_LABEL = {
  spells: 'Incantesimo', monsters: 'Mostro', magicItems: 'Oggetto magico', equipment: 'Equipaggiamento', races: 'Razza / specie',
  subclasses: 'Sottoclasse', classes: 'Classe', feats: 'Talento', backgrounds: 'Background', classOptions: 'Opzione di classe',
};

/** Sigla breve della fonte per le etichette nelle liste. */
export function shortSource(item) {
  const s = item?.source || '';
  if (s === 'SRD 5.1') return '5.1';
  if (s === 'SRD 5.2') return '5.2';
  if (item?.sourceKey) return item.sourceKey;
  if (s === 'Homebrew' || !s) return 'HB';
  return s.split(/[\s:]+/).filter((w) => /^[A-Z]/.test(w)).map((w) => w[0]).join('').slice(0, 5) || 'HB';
}
/** Tono del tag fonte: SRD 5.1 accent, 5.2 magic, homebrew good, manuali da completare faint. */
export function sourceTone(item) {
  const s = item?.source || '';
  if (item?.stub) return 'stub';
  if (s === 'SRD 5.2') return 'magic';
  if (s === 'SRD 5.1') return 'accent';
  if (s === 'Homebrew') return 'good';
  return 'book';
}
export const isStub = (item) => !!item?.stub;

function isEmpty(v) { return v == null || v === '' || (Array.isArray(v) && !v.length) || (typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length); }
function strip(o) { const r = {}; for (const [k, v] of Object.entries(o || {})) if (!k.startsWith('_')) r[k] = v; return r; }

/**
 * Salva una voce importata come homebrew.
 * - stub: voce del catalogo da completare → stessa id, fonte del manuale, completed:true (sostituisce lo stub nelle liste)
 * - hbId: voce homebrew esistente da aggiornare
 * Ritorna { hbId, id } (documento homebrew, id della voce nel dataset).
 */
export function saveEntry(dataset, parsed, { stub = null, hbId = null, normalize = null } = {}) {
  const clean = strip(parsed);
  const existing = hbId ? store.get('homebrew', hbId) : null;
  let data;
  if (stub) {
    const base = strip(stub);
    data = { ...base };
    for (const [k, v] of Object.entries(clean)) if (!isEmpty(v) || !(k in base)) data[k] = v;
    Object.assign(data, { id: stub.id, stub: false, completed: true, source: stub.source, sourceKey: stub.sourceKey, name: clean.name || stub.name });
  } else if (existing) {
    data = { ...existing.data, ...clean, id: existing.data?.id || existing.id };
  } else {
    data = { ...clean, id: (dataset === 'monsters' ? 'hb-' : '') + slug(clean.name || 'voce') + '-' + uid().slice(-4), source: clean.source || 'Homebrew' };
  }
  if (normalize) data = { ...normalize(data), id: data.id };
  if (stub && normalize) Object.assign(data, { source: stub.source, sourceKey: stub.sourceKey, completed: true, stub: false });
  const prev = existing || store.list('homebrew', (h) => h.kind === dataset && h.data?.id === data.id)[0];
  if (prev) { store.put('homebrew', { ...prev, kind: dataset, data }); return { hbId: prev.id, id: data.id }; }
  const doc = store.put('homebrew', { id: dataset === 'monsters' ? data.id : undefined, kind: dataset, data });
  return { hbId: doc.id, id: data.id };
}

/** Rimuove la versione completata: la voce torna "da completare". */
export function resetEntry(hbId) { store.remove('homebrew', hbId); }

/** Testo d'esempio del formato atteso, per ogni dataset (mostrato nel campo vuoto). */
export const PASTE_EXAMPLES = {
  spells: 'Nome dell\'incantesimo\n3rd-level evocation   (oppure: Invocazione di 3° livello)\nCasting Time: 1 action\nRange: 150 feet\nComponents: V, S, M (…)\nDuration: Instantaneous\nTesto della descrizione…\nAt Higher Levels. …',
  monsters: 'Nome del mostro\nSmall humanoid (goblinoid), neutral evil\nArmor Class 15 (…)\nHit Points 7 (2d6)\nSpeed 30 ft.\nSTR DEX CON INT WIS CHA\n8 (-1) 14 (+2) 10 (+0) 10 (+0) 8 (-1) 8 (-1)\nSenses …, passive Perception 9\nLanguages …\nChallenge 1/4 (50 XP)\nTratto. …\nActions\nAzione. …',
  magicItems: 'Nome dell\'oggetto\nWondrous item, rare (requires attunement)\nTesto della descrizione…',
  equipment: 'Nome\nTipo, rarità\nDescrizione…',
  races: 'Nome della razza\nIntroduzione…\nAbility Score Increase. …\nSize. … Medium.\nSpeed. Your base walking speed is 30 feet.\nNome del tratto. Descrizione…',
  subclasses: 'Nome della sottoclasse\nIntroduzione…\nNome del privilegio\nStarting at 3rd level, …\nAltro privilegio\nBeginning at 6th level, …',
  classes: 'Nome della classe\nNome del privilegio\nAt 1st level, …',
  feats: 'Nome del talento\nPrerequisite: …\nDescrizione…',
  backgrounds: 'Nome del background\nDescrizione…\nSkill Proficiencies: …\nFeature: Nome del privilegio\nTesto del privilegio…',
  classOptions: 'Nome dell\'opzione\nPrerequisite: …\nDescrizione…',
};
