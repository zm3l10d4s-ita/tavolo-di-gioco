// API della scheda personaggio per le altre sezioni (es. combat tracker dell'Agente 5).
//   characterSummary(character) → { id, name, ac, maxHp, hp, tempHp, initBonus, passivePerception, speedFt }
//   applyHpChange(characterId, delta) → danno (delta < 0, prima i PF temporanei) o cura (delta > 0, fino al massimo); salva nello store.
//   emitRoll(characterId, label, result) → evento window 'dnd:roll' (detail { characterId, label, result }) per il log di sessione.
import * as store from '../../lib/store.js';
import * as srd from '../../lib/srd.js';
import { summarize, applyHp, normalizeCharacter } from './logic.js';

// Precarica l'equipaggiamento SRD (per la CA da armatura/scudo) quando gira nell'app.
if (typeof window !== 'undefined' && typeof document !== 'undefined') srd.load('equipment').catch(() => {});

/** Riepilogo di combattimento calcolato con rules.js (CA include armatura/scudo equipaggiati e la CA temporanea). */
export function characterSummary(character, equipmentItems) {
  if (!character) return null;
  return summarize(character, equipmentItems || srd.cached('equipment') || []);
}

/** Riepilogo per id (null se il personaggio non esiste). */
export function characterSummaryById(id) { return characterSummary(store.get('characters', id)); }

/**
 * Applica danno/cura al personaggio nello store (autosave). Ritorna { hp, tempHp, maxHp, info } o null se non trovato.
 * info: { fromTemp, damage, healed, before, after, max, droppedToZero }.
 */
export function applyHpChange(characterId, delta) {
  const cur = store.get('characters', characterId);
  if (!cur) return null;
  let info = null;
  const saved = store.update('characters', characterId, (c) => {
    const r = applyHp(c, delta);
    info = r.info;
    return r.character;
  });
  const n = normalizeCharacter(saved);
  return { hp: n.hp.current, tempHp: n.hp.temp, maxHp: info.max, info };
}

/** Imposta i PF temporanei (non cumulabili: tiene il valore più alto, salvo force). */
export function setTempHp(characterId, value, { force = false } = {}) {
  const cur = store.get('characters', characterId);
  if (!cur) return null;
  return store.update('characters', characterId, (c) => {
    const v = Math.max(0, Math.trunc(Number(value) || 0));
    const t = Number(c.hp?.temp) || 0;
    return { ...c, hp: { ...(c.hp || {}), temp: force ? v : Math.max(t, v) } };
  });
}

/** Notifica un tiro (il log di sessione può ascoltare `window.addEventListener('dnd:roll', …)`). */
export function emitRoll(characterId, label, result) {
  if (typeof window === 'undefined' || typeof CustomEvent === 'undefined') return;
  window.dispatchEvent(new CustomEvent('dnd:roll', { detail: { characterId, label, result } }));
}
