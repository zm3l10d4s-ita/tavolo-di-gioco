// Adattatore verso le schede personaggio (Agente 4: src/views/characters/api.js).
// Se api.js espone characterSummary/applyHpChange li usa; altrimenti calcola con rules.js e aggiorna lo store direttamente.
import * as store from '../../lib/store.js';
import * as rules from '../../lib/rules.js';

let api = null;
export const apiReady = import('../characters/api.js').then((m) => { api = m; return m; }).catch(() => null);
export function hasApi() { return !!api; }

const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? undefined : Number(v));
const first = (...vals) => vals.find((v) => v !== undefined);

/** Riepilogo uniforme di un PG: { name, ac, maxHp, hp, tempHp, initBonus, level, dead }. */
export function pcSummary(ch, equipment) {
  if (!ch) return null;
  let s = null;
  if (api?.characterSummary) { try { s = api.characterSummary(ch, equipment && equipment.length ? equipment : undefined) || null; } catch (e) { console.warn('[session] characterSummary', e); } }
  const fbMax = rules.maxHp(ch);
  const fb = {
    ac: rules.armorClass(ch, equipment), maxHp: fbMax,
    hp: num(ch.hp?.current) ?? fbMax, tempHp: num(ch.hp?.temp) ?? 0,
    initBonus: rules.initiative(ch), level: rules.totalLevel(ch),
  };
  const sv = s || {};
  return {
    name: sv.name || ch.name || 'PG',
    ac: first(num(sv.ac), num(sv.armorClass), num(sv.ac?.ac), fb.ac),
    maxHp: first(num(sv.maxHp), num(sv.hpMax), num(sv.hp?.max), fb.maxHp),
    hp: first(num(sv.hp?.current), num(sv.currentHp), typeof sv.hp === 'number' ? sv.hp : undefined, fb.hp),
    tempHp: first(num(sv.tempHp), num(sv.hp?.temp), fb.tempHp),
    initBonus: first(num(sv.initiative), num(sv.initBonus), num(sv.initiativeBonus), fb.initBonus),
    level: first(num(sv.level), num(sv.totalLevel), fb.level),
  };
}

/** Applica una variazione di PF alla scheda (delta < 0 = danno: consuma prima i PF temporanei). */
export function applyPcHp(characterId, delta) {
  if (!delta) return;
  if (api?.applyHpChange) { try { api.applyHpChange(characterId, delta); return; } catch (e) { console.warn('[session] applyHpChange', e); } }
  const ch = store.get('characters', characterId);
  if (!ch) return;
  store.update('characters', characterId, (c) => {
    const max = rules.maxHp(c);
    const hp = { current: num(c.hp?.current) ?? max, temp: num(c.hp?.temp) ?? 0, maxOverride: c.hp?.maxOverride ?? null, ...c.hp };
    hp.current = num(hp.current) ?? max; hp.temp = num(hp.temp) ?? 0;
    if (delta < 0) {
      const dmg = -delta;
      const fromTemp = Math.min(hp.temp, dmg);
      hp.temp -= fromTemp;
      hp.current = Math.max(0, hp.current - (dmg - fromTemp));
    } else hp.current = Math.min(max, hp.current + delta);
    return { ...c, hp };
  });
}

/** Imposta i PF temporanei sulla scheda. */
export function setPcTemp(characterId, temp) {
  const ch = store.get('characters', characterId);
  if (!ch) return;
  if (api?.setTempHp) { try { api.setTempHp(characterId, temp, { force: true }); return; } catch (e) { console.warn('[session] setTempHp', e); } }
  store.update('characters', characterId, (c) => ({ ...c, hp: { ...(c.hp || {}), temp: Math.max(0, Number(temp) || 0) } }));
}
/** Imposta i PF attuali sulla scheda (via delta, così l'API dei personaggi resta la sola a scrivere i PF). */
export function setPcHp(characterId, value, equipment) {
  const ch = store.get('characters', characterId);
  if (!ch) return;
  const cur = pcSummary(ch, equipment).hp;
  const target = Math.max(0, Number(value) || 0);
  if (target === cur) return;
  // Per "imposta" non vogliamo consumare i PF temporanei: scrittura diretta.
  store.update('characters', characterId, (c) => ({ ...c, hp: { ...(c.hp || {}), current: target } }));
}
