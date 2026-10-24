// Mutazioni del combattimento e del log di una sessione (tutto persistito subito via store → autosave).
import * as store from '../../lib/store.js';
import { uid } from '../../lib/util.js';
import { monsterToCombatant } from '../../lib/combat.js';
import {
  normCombat, sortCombat, startCombat, nextTurn, prevTurn, moveCombatant, removeCombatant,
  rollInitiative, applyHp, parseHpInput, logEntry, xpSummary, statusOf, emptyCombat,
} from '../../lib/session-core.js';
import { pcSummary, applyPcHp, setPcTemp, setPcHp } from './pc.js';

/** Allinea i PG del combattimento con le loro schede (PF, PF temp, PF max, CA). */
export function syncPcs(combat, equipment) {
  const c = normCombat(combat);
  return {
    ...c,
    combatants: c.combatants.map((x) => {
      if (x.kind !== 'pc' || !x.refId) return x;
      const ch = store.get('characters', x.refId);
      if (!ch) return x;
      const s = pcSummary(ch, equipment);
      return { ...x, name: x.nameOverride ? x.name : s.name, hp: s.hp, maxHp: s.maxHp, tempHp: s.tempHp, ac: x.acOverride ?? s.ac };
    }),
  };
}

/** Applica fn(combat) → combat (o { combat, log: [entries] }) alla sessione, in una sola scrittura. */
export function mutate(sid, fn, equipment) {
  let out = null;
  store.update('sessions', sid, (s) => {
    const cur = syncPcs(s.combat || emptyCombat(), equipment);
    const res = fn(cur, s) || cur;
    const combat = res.combat ? res.combat : res;
    const log = res.log ? [...(s.log || []), ...res.log.filter(Boolean)] : (s.log || []);
    out = { ...s, combat, log };
    return out;
  });
  return out;
}

const L = (type, text) => logEntry(type, text);
const turnText = (c) => `Round ${c.round} — turno di ${c.combatants[c.turnIndex]?.name ?? '—'}`;

export function addPcs(sid, characters, equipment) {
  return mutate(sid, (c) => {
    const have = new Set(c.combatants.filter((x) => x.kind === 'pc').map((x) => x.refId));
    const added = [];
    const list = [...c.combatants];
    for (const ch of characters) {
      if (have.has(ch.id)) continue;
      const s = pcSummary(ch, equipment);
      list.push({ id: uid(), kind: 'pc', refId: ch.id, name: s.name, initiative: null, initBonus: s.initBonus, hp: s.hp, maxHp: s.maxHp,
        tempHp: s.tempHp, ac: s.ac, conditions: [], notes: '', hidden: false });
      added.push(s.name);
    }
    if (!added.length) return c;
    return { combat: { ...c, combatants: list }, log: [L('combat', `Entrano in combattimento: ${added.join(', ')}.`)] };
  }, equipment);
}

function nextIndex(combatants, base) {
  const re = new RegExp('^' + base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' (\\d+)$');
  return combatants.reduce((mx, c) => { const m = String(c.name).match(re); return m ? Math.max(mx, Number(m[1])) : mx; }, 0) + 1;
}

/** Aggiunge `count` copie di un mostro alla sessione indicata ("Goblin 1", "Goblin 2"…). */
export function addMonsters(sid, monster, count = 1) {
  const n = Math.max(1, Math.min(50, Math.floor(Number(count) || 1)));
  return mutate(sid, (c) => {
    const list = [...c.combatants];
    let i = nextIndex(list, monster.name);
    const names = [];
    for (let k = 0; k < n; k++) {
      const cb = { ...monsterToCombatant(monster, `${monster.name} ${i++}`), xp: Number(monster.xp) || 0 };
      if (c.active) { const r = rollInitiative(cb); cb.initiative = r.total; }
      list.push(cb); names.push(cb.name);
    }
    let combat = { ...c, combatants: list };
    if (c.active) combat = sortCombat(combat);
    return { combat, log: [L('combat', `Aggiunt${n > 1 ? 'i' : 'o'} al combattimento: ${names.join(', ')} (CA ${Number(monster.ac) || 10}, PF ${Number(monster.hp) || 1}).`)] };
  });
}

export function addNpc(sid, { name, hp, ac, initBonus, count = 1 }) {
  const n = Math.max(1, Math.min(20, Number(count) || 1));
  const base = String(name || 'PNG').trim() || 'PNG';
  return mutate(sid, (c) => {
    const list = [...c.combatants];
    let i = nextIndex(list, base);
    const names = [];
    for (let k = 0; k < n; k++) {
      const nm = n > 1 ? `${base} ${i++}` : base;
      list.push({ id: uid(), kind: 'npc', refId: null, name: nm, initiative: null, initBonus: Number(initBonus) || 0,
        hp: Math.max(1, Number(hp) || 1), maxHp: Math.max(1, Number(hp) || 1), tempHp: 0, ac: Number(ac) || 10, conditions: [], notes: '', hidden: false });
      names.push(nm);
    }
    return { combat: { ...c, combatants: list }, log: [L('combat', `PNG aggiunt${n > 1 ? 'i' : 'o'}: ${names.join(', ')}.`)] };
  });
}

/** which: id di un combattente | 'monsters' (mostri e PNG) | 'all' | 'missing' (solo chi non ha iniziativa). */
export function rollInit(sid, which, equipment) {
  return mutate(sid, (c) => {
    const parts = [];
    const list = c.combatants.map((x) => {
      const pick = which === 'all' ? true : which === 'monsters' ? x.kind !== 'pc' : which === 'missing' ? x.initiative == null : x.id === which;
      if (!pick) return x;
      const r = rollInitiative(x);
      parts.push(`${x.name} ${r.total}${r.d20 === 20 ? ' (20!)' : ''}`);
      return { ...x, initiative: r.total };
    });
    if (!parts.length) return c;
    return { combat: sortCombat({ ...c, combatants: list }), log: [L('roll', `Iniziativa: ${parts.join(', ')}.`)] };
  }, equipment);
}

export function setInitiative(sid, id, value, equipment) {
  return mutate(sid, (c) => {
    const v = value === '' || value == null || !Number.isFinite(Number(value)) ? null : Number(value);
    const x = c.combatants.find((y) => y.id === id);
    if (!x || x.initiative === v) return c;
    const list = c.combatants.map((y) => (y.id === id ? { ...y, initiative: v } : y));
    return { combat: sortCombat({ ...c, combatants: list }), log: v == null ? [] : [L('combat', `Iniziativa di ${x.name}: ${v}.`)] };
  }, equipment);
}

export const sortNow = (sid, eq) => mutate(sid, (c) => sortCombat(c), eq);
export const move = (sid, id, dir, eq) => mutate(sid, (c) => moveCombatant(c, id, dir), eq);

export function start(sid, equipment) {
  return mutate(sid, (c) => {
    // Chi non ha ancora l'iniziativa (mostri/PNG) la tira automaticamente; i PG senza valore restano in fondo.
    const parts = [];
    const list = c.combatants.map((x) => {
      if (x.initiative != null || x.kind === 'pc') return x;
      const r = rollInitiative(x); parts.push(`${x.name} ${r.total}`);
      return { ...x, initiative: r.total };
    });
    const combat = startCombat({ ...c, combatants: list });
    return { combat, log: [parts.length ? L('roll', `Iniziativa: ${parts.join(', ')}.`) : null, L('combat', `Il combattimento inizia. ${turnText(combat)}.`)] };
  }, equipment);
}

export function next(sid, equipment) {
  return mutate(sid, (c) => {
    if (!c.combatants.length) return c;
    const r = nextTurn(c);
    const log = r.expired.map((e) => L('combat', `${e.name}: termina la condizione «${e.label || e.conditionId}».`));
    log.push(L('combat', `${r.newRound ? 'Nuovo round. ' : ''}${turnText(r.combat)}.`));
    return { combat: r.combat, log };
  }, equipment);
}
export function prev(sid, equipment) {
  return mutate(sid, (c) => {
    if (!c.combatants.length) return c;
    const r = prevTurn(c);
    return { combat: r.combat, log: [L('combat', `Indietro: ${turnText(r.combat)}.`)] };
  }, equipment);
}

/** Campo rapido PF ("-7", "+5", "=20", "t5", "-2d6"). Per i PG aggiorna anche la scheda. Ritorna il testo registrato o null. */
export function hpInput(sid, id, input, equipment) {
  const parsed = parseHpInput(input);
  if (!parsed) return null;
  const s = store.get('sessions', sid);
  const cur = syncPcs(s.combat, equipment).combatants.find((x) => x.id === id);
  if (!cur) return null;
  const res = applyHp(cur, parsed);
  if (cur.kind === 'pc' && cur.refId && store.get('characters', cur.refId)) {
    if (parsed.op === 'temp') setPcTemp(cur.refId, parsed.amount);
    else if (parsed.op === 'set') setPcHp(cur.refId, parsed.amount, equipment);
    else applyPcHp(cur.refId, parsed.op === 'damage' ? -parsed.amount : parsed.amount);
  }
  mutate(sid, (c) => ({
    combat: { ...c, combatants: c.combatants.map((x) => (x.id === id ? (x.kind === 'pc' ? { ...x, dead: res.combatant.dead } : { ...x, hp: res.combatant.hp, tempHp: res.combatant.tempHp, dead: res.combatant.dead }) : x)) },
    log: [L('hp', res.text)],
  }), equipment);
  return res.text;
}

export function patchCombatant(sid, id, patch, equipment) {
  return mutate(sid, (c) => ({ ...c, combatants: c.combatants.map((x) => (x.id === id ? { ...x, ...patch } : x)) }), equipment);
}

/** Modifica PF max / PF temp / CA di un combattente (per i PG: PF temp sulla scheda, CA come override locale). */
export function setStat(sid, id, field, value, equipment) {
  const s = store.get('sessions', sid);
  const x = normCombat(s.combat).combatants.find((y) => y.id === id);
  if (!x) return;
  const v = Math.max(0, Number(value) || 0);
  if (x.kind === 'pc' && x.refId && store.get('characters', x.refId)) {
    if (field === 'tempHp') return setPcTemp(x.refId, v), mutate(sid, (c) => c, equipment);
    if (field === 'hp') return setPcHp(x.refId, v, equipment), mutate(sid, (c) => c, equipment);
    if (field === 'ac') return patchCombatant(sid, id, { acOverride: v, ac: v }, equipment);
    if (field === 'maxHp') return; // il massimo dei PG si gestisce dalla scheda
  }
  return patchCombatant(sid, id, { [field]: v }, equipment);
}

export function addCondition(sid, id, condId, rounds, label, equipment) {
  return mutate(sid, (c) => {
    const x = c.combatants.find((y) => y.id === id);
    if (!x) return c;
    const r = rounds === '' || rounds == null || !(Number(rounds) > 0) ? null : Math.floor(Number(rounds));
    const others = x.conditions.filter((k) => k.id !== condId);
    const list = c.combatants.map((y) => (y.id === id ? { ...y, conditions: [...others, { id: condId, rounds: r, label }] } : y));
    return { combat: { ...c, combatants: list }, log: [L('combat', `${x.name}: ${label || condId}${r ? ` per ${r} round` : ''}.`)] };
  }, equipment);
}
export function removeCondition(sid, id, condId, label, equipment) {
  return mutate(sid, (c) => {
    const x = c.combatants.find((y) => y.id === id);
    if (!x) return c;
    const list = c.combatants.map((y) => (y.id === id ? { ...y, conditions: y.conditions.filter((k) => k.id !== condId) } : y));
    return { combat: { ...c, combatants: list }, log: [L('combat', `${x.name}: non è più ${(label || condId).toLowerCase()}.`)] };
  }, equipment);
}

export function removeOne(sid, id, equipment) {
  return mutate(sid, (c) => {
    const x = c.combatants.find((y) => y.id === id);
    return { combat: removeCombatant(c, id), log: x ? [L('combat', `${x.name} rimosso dal combattimento.`)] : [] };
  }, equipment);
}

export function toggleHidden(sid, id, equipment) {
  return mutate(sid, (c) => {
    const x = c.combatants.find((y) => y.id === id);
    if (!x) return c;
    return { ...c, combatants: c.combatants.map((y) => (y.id === id ? { ...y, hidden: !y.hidden } : y)) };
  }, equipment);
}

/**
 * Termina il combattimento: riepilogo PE, eventuale assegnazione ai PG (character.xp), rimozione di mostri/PNG.
 * xpOf(combatant) → PE.
 */
export function endCombat(sid, { award = false, includeAll = false, keepFoes = false } = {}, xpOf, equipment) {
  const s = store.get('sessions', sid);
  const c = syncPcs(s.combat, equipment);
  const sum = xpSummary(c.combatants, xpOf, { includeAll });
  if (award && sum.perPc > 0) {
    for (const p of sum.pcs) {
      if (p.refId && store.get('characters', p.refId)) store.update('characters', p.refId, (ch) => ({ ...ch, xp: (Number(ch.xp) || 0) + sum.perPc }));
    }
  }
  const defeated = c.combatants.filter((x) => x.kind !== 'pc' && statusOf(x) !== 'ok').map((x) => x.name);
  mutate(sid, (cc) => ({
    combat: {
      active: false, round: 1, turnIndex: 0,
      combatants: (keepFoes ? cc.combatants : cc.combatants.filter((x) => x.kind === 'pc'))
        .map((x) => ({ ...x, initiative: null, conditions: x.kind === 'pc' ? x.conditions : x.conditions })),
    },
    log: [L('combat', `Il combattimento termina dopo ${cc.round} round.${defeated.length ? ` Sconfitti: ${defeated.join(', ')}.` : ''} PE totali ${sum.total}${sum.pcs.length ? `, ${sum.perPc} PE a testa per ${sum.pcs.length} PG` : ''}${award && sum.perPc ? ' (assegnati alle schede)' : ''}.`)],
  }), equipment);
  return sum;
}

export function addNote(sid, text) {
  const t = String(text || '').trim();
  if (!t) return;
  store.update('sessions', sid, (s) => ({ ...s, log: [...(s.log || []), logEntry('note', t)] }));
}
export function logRoll(sid, text) {
  store.update('sessions', sid, (s) => ({ ...s, log: [...(s.log || []), logEntry('roll', text)] }));
}
export function removeLog(sid, entryId) {
  store.update('sessions', sid, (s) => ({ ...s, log: (s.log || []).filter((e) => e.id !== entryId) }));
}
