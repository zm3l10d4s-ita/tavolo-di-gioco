// Logica pura del combat tracker, del log di sessione e degli incontri.
// Nessun import di store/UI: funzioni deterministiche (salvo i tiri) testabili in Node (tests/session.test.mjs).
// Schema: `sessions.combat` di CONTRACTS.md. Le condizioni di un combattente sono normalizzate in
// oggetti { id, rounds } (rounds = durata residua in round, null = indefinita); le stringhe sono accettate in lettura.
import { uid, roll, signed } from './util.js';
import { ENCOUNTER_XP_BUDGET_2024, crToXp } from './rules.js';

export const LOG_TYPES = [
  { id: 'note', label: 'Nota' },
  { id: 'roll', label: 'Tiro' },
  { id: 'combat', label: 'Combattimento' },
  { id: 'hp', label: 'PF' },
  { id: 'system', label: 'Sistema' },
];
export const LOG_TYPE_LABEL = Object.fromEntries(LOG_TYPES.map((t) => [t.id, t.label]));

export const emptyCombat = () => ({ active: false, round: 1, turnIndex: 0, combatants: [] });

export function normCondition(x) {
  if (!x) return null;
  if (typeof x === 'string') return { id: x, rounds: null };
  const r = x.rounds === '' || x.rounds == null ? null : Number(x.rounds);
  const out = { id: x.id, rounds: Number.isFinite(r) ? r : null };
  if (x.label) out.label = x.label;
  return out;
}

export function normCombatant(c) {
  const n = (v, d) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? d : Number(v));
  return {
    id: c.id || uid(), kind: c.kind || 'npc', refId: c.refId ?? null, name: c.name || 'Senza nome',
    ...c,
    initiative: c.initiative === null || c.initiative === undefined || c.initiative === '' ? null : n(c.initiative, null),
    initBonus: n(c.initBonus, 0), hp: n(c.hp, 0), maxHp: n(c.maxHp, n(c.hp, 0)), tempHp: n(c.tempHp, 0), ac: n(c.ac, 10),
    conditions: (c.conditions || []).map(normCondition).filter(Boolean),
    notes: c.notes || '', hidden: !!c.hidden, dead: !!c.dead,
  };
}

export function normCombat(c) {
  const base = { ...emptyCombat(), ...(c || {}) };
  base.combatants = (base.combatants || []).map(normCombatant);
  base.round = Math.max(1, Number(base.round) || 1);
  base.turnIndex = Math.max(0, Math.min(base.combatants.length - 1, Number(base.turnIndex) || 0));
  if (!base.combatants.length) base.turnIndex = 0;
  return base;
}

// ------------------------------------------------------------------ stato del combattente

/** 'ok' | 'down' (PG a 0 PF) | 'dead' (morto) | 'defeated' (mostro/PNG a 0 PF). */
export function statusOf(c) {
  if (c.dead) return 'dead';
  if (Number(c.hp) <= 0) return c.kind === 'pc' ? 'down' : 'defeated';
  return 'ok';
}
export const STATUS_LABEL = { ok: '', down: 'A terra', dead: 'Morto', defeated: 'Sconfitto' };

/** Un combattente prende il turno? (nascosti, mostri sconfitti e morti vengono saltati; i PG a terra no: TS contro morte). */
export function takesTurn(c) {
  if (c.hidden) return false;
  const s = statusOf(c);
  return s === 'ok' || s === 'down';
}

// ------------------------------------------------------------------ PF

/**
 * Interpreta il campo rapido dei PF.
 *   "-7" o "7" → danno 7; "+5" → cura 5; "=20" → imposta 20; "t5" / "+t5" → PF temporanei 5;
 *   espressioni con dadi: "-2d6+3" (danno tirato), "+1d8+2" (cura tirata).
 * Ritorna { op: 'damage'|'heal'|'set'|'temp', amount, rolled? } oppure null se non valido.
 */
export function parseHpInput(input) {
  const s = String(input ?? '').trim().toLowerCase().replace(/\s+/g, '').replace(/−/g, '-');
  if (!s) return null;
  let m = s.match(/^=(\d+)$/);
  if (m) return { op: 'set', amount: Number(m[1]) };
  m = s.match(/^\+?(?:t|temp|tmp)(\d+)$/);
  if (m) return { op: 'temp', amount: Number(m[1]) };
  m = s.match(/^([+-]?)(.+)$/);
  const sign = m[1];
  const body = m[2];
  let amount, rolled;
  if (/^\d+$/.test(body)) amount = Number(body);
  else if (/^(\d*d\d+|\d+)([+-](\d*d\d+|\d+))*$/.test(body)) { rolled = roll(body); amount = Math.max(0, rolled.total); }
  else return null;
  return { op: sign === '+' ? 'heal' : 'damage', amount, ...(rolled ? { rolled } : {}) };
}

/**
 * Applica una variazione di PF a un combattente. Il danno consuma prima i PF temporanei.
 * Ritorna { combatant, hpDelta, tempDelta, text, events: [] } (events: 'down'|'dead'|'defeated'|'revived'|'massive').
 */
export function applyHp(c, parsed) {
  const cur = normCombatant(c);
  const next = { ...cur };
  const events = [];
  const before = statusOf(cur);
  let text = '';
  const amt = Math.max(0, Math.floor(Number(parsed?.amount) || 0));
  if (parsed.op === 'damage') {
    const fromTemp = Math.min(cur.tempHp, amt);
    next.tempHp = cur.tempHp - fromTemp;
    const rest = amt - fromTemp;
    next.hp = Math.max(0, cur.hp - rest);
    const overflow = rest - cur.hp;
    text = `${cur.name} subisce ${amt} danni${fromTemp ? ` (${fromTemp} assorbiti dai PF temporanei)` : ''}: PF ${next.hp}/${cur.maxHp}`;
    if (cur.kind === 'pc' && next.hp === 0 && cur.hp > 0 && overflow >= cur.maxHp && cur.maxHp > 0) {
      next.dead = true; events.push('massive');
    } else if (cur.kind === 'pc' && cur.hp === 0 && rest > 0 && !cur.dead) {
      text += ' — fallisce un tiro salvezza contro morte';
    }
  } else if (parsed.op === 'heal') {
    next.hp = Math.min(cur.maxHp || Infinity, cur.hp + amt);
    text = `${cur.name} recupera ${next.hp - cur.hp} PF: PF ${next.hp}/${cur.maxHp}`;
  } else if (parsed.op === 'set') {
    next.hp = Math.max(0, amt);
    text = `PF di ${cur.name} impostati a ${next.hp}/${cur.maxHp}`;
  } else if (parsed.op === 'temp') {
    next.tempHp = amt;
    text = `${cur.name} ha ${amt} PF temporanei`;
  }
  if (parsed.rolled) text += ` [${parsed.rolled.expr}: ${parsed.rolled.rolls.map((r) => r.results.join('+')).join(' ')}]`;
  const after = statusOf(next);
  if (after !== before) {
    if (after === 'down') { events.push('down'); text += ` — ${cur.name} è a terra!`; }
    else if (after === 'dead') { events.push('dead'); text += ` — ${cur.name} muore${events.includes('massive') ? ' (danno massiccio)' : ''}!`; }
    else if (after === 'defeated') { events.push('defeated'); text += ` — ${cur.name} è sconfitto!`; }
    else if (after === 'ok') { events.push('revived'); text += ` — ${cur.name} torna in piedi`; }
  }
  return { combatant: next, hpDelta: next.hp - cur.hp, tempDelta: next.tempHp - cur.tempHp, text, events };
}

// ------------------------------------------------------------------ iniziativa e turni

/** Tira l'iniziativa: 1d20 + initBonus. Ritorna { total, d20, expr }. */
export function rollInitiative(c) {
  const expr = '1d20' + (Number(c.initBonus) ? signed(c.initBonus) : '');
  const r = roll(expr);
  return { total: r.total, d20: r.rolls[0]?.results?.[0], expr };
}

/** Confronto per l'ordine di iniziativa: valore (desc), poi mod DES (desc), poi PG prima, poi ordine attuale. */
export function compareInitiative(a, b) {
  const ia = a.initiative == null ? -Infinity : Number(a.initiative);
  const ib = b.initiative == null ? -Infinity : Number(b.initiative);
  if (ia !== ib) return ib - ia;
  const ba = Number(a.initBonus) || 0, bb = Number(b.initBonus) || 0;
  if (ba !== bb) return bb - ba;
  const pa = a.kind === 'pc' ? 0 : 1, pb = b.kind === 'pc' ? 0 : 1;
  return pa - pb;
}

/** Ordina i combattenti mantenendo il turno sul combattente corrente. Ordinamento stabile. */
export function sortCombat(combat) {
  const c = normCombat(combat);
  const currentId = c.combatants[c.turnIndex]?.id;
  const sorted = c.combatants.map((x, i) => [x, i]).sort((p, q) => compareInitiative(p[0], q[0]) || p[1] - q[1]).map((p) => p[0]);
  const idx = sorted.findIndex((x) => x.id === currentId);
  return { ...c, combatants: sorted, turnIndex: idx < 0 ? 0 : idx };
}

/** Sposta un combattente di `dir` posizioni (riordino manuale), mantenendo il turno sul combattente corrente. */
export function moveCombatant(combat, id, dir) {
  const c = normCombat(combat);
  const list = [...c.combatants];
  const i = list.findIndex((x) => x.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return c;
  const currentId = list[c.turnIndex]?.id;
  [list[i], list[j]] = [list[j], list[i]];
  return { ...c, combatants: list, turnIndex: Math.max(0, list.findIndex((x) => x.id === currentId)) };
}

function firstEligible(list, from = 0) {
  for (let k = 0; k < list.length; k++) { const i = (from + k) % list.length; if (takesTurn(list[i])) return i; }
  return 0;
}

/** Inizia il combattimento: ordina, round 1, turno al primo combattente che agisce. */
export function startCombat(combat) {
  const c = sortCombat({ ...normCombat(combat), turnIndex: 0 });
  return { ...c, active: true, round: 1, turnIndex: firstEligible(c.combatants, 0) };
}

/**
 * Passa al turno successivo. A fine turno del combattente corrente scala di 1 la durata delle sue condizioni
 * (rimuovendo quelle scadute). Ritorna { combat, newRound: bool, expired: [{ name, conditionId }], current }.
 */
export function nextTurn(combat) {
  const c = normCombat(combat);
  const list = c.combatants.map((x) => ({ ...x }));
  const expired = [];
  if (!list.length) return { combat: c, newRound: false, expired, current: null };
  const cur = list[c.turnIndex];
  if (cur && c.active) {
    const keep = [];
    for (const cond of cur.conditions) {
      if (cond.rounds == null) { keep.push(cond); continue; }
      const r = cond.rounds - 1;
      if (r <= 0) expired.push({ name: cur.name, conditionId: cond.id, label: cond.label || cond.id });
      else keep.push({ ...cond, rounds: r });
    }
    cur.conditions = keep;
  }
  let i = c.turnIndex, round = c.round, newRound = false;
  for (let k = 0; k < list.length; k++) {
    i += 1;
    if (i >= list.length) { i = 0; round += 1; newRound = true; }
    if (takesTurn(list[i])) break;
  }
  const next = { ...c, combatants: list, turnIndex: i, round };
  return { combat: next, newRound, expired, current: list[i] };
}

/** Torna al turno precedente (le durate delle condizioni non vengono ripristinate). */
export function prevTurn(combat) {
  const c = normCombat(combat);
  const list = c.combatants;
  if (!list.length) return { combat: c, prevRound: false, current: null };
  let i = c.turnIndex, round = c.round, prevRound = false;
  for (let k = 0; k < list.length; k++) {
    if (i === 0 && round === 1) break; // non si torna prima dell'inizio
    i -= 1;
    if (i < 0) { i = list.length - 1; round = Math.max(1, round - 1); prevRound = true; }
    if (takesTurn(list[i])) break;
  }
  return { combat: { ...c, turnIndex: i, round }, prevRound, current: list[i] };
}

/** Rimuove un combattente mantenendo il turno coerente. */
export function removeCombatant(combat, id) {
  const c = normCombat(combat);
  const i = c.combatants.findIndex((x) => x.id === id);
  if (i < 0) return c;
  const list = c.combatants.filter((x) => x.id !== id);
  let t = c.turnIndex;
  if (i < t) t -= 1;
  if (t >= list.length) t = 0;
  return { ...c, combatants: list, turnIndex: Math.max(0, t) };
}

// ------------------------------------------------------------------ PE

/**
 * Riepilogo PE di fine combattimento. xpOf(combatant) → PE del mostro (es. da monsters[refId].xp).
 * Contano i mostri/PNG sconfitti (PF 0) o, con includeAll, tutti i non-PG.
 */
export function xpSummary(combatants, xpOf, { includeAll = false } = {}) {
  const list = (combatants || []).map(normCombatant);
  const foes = list.filter((c) => c.kind !== 'pc' && (includeAll || statusOf(c) === 'defeated' || statusOf(c) === 'dead'));
  const rows = foes.map((c) => ({ id: c.id, name: c.name, xp: Math.max(0, Number(xpOf(c)) || 0) }));
  const total = rows.reduce((s, r) => s + r.xp, 0);
  const pcs = list.filter((c) => c.kind === 'pc');
  const perPc = pcs.length ? Math.floor(total / pcs.length) : 0;
  return { rows, total, pcs: pcs.map((p) => ({ id: p.id, refId: p.refId, name: p.name })), perPc };
}

// ------------------------------------------------------------------ incontri (budget PE 2024)

/** Budget PE del gruppo: somma per personaggio della tabella SRD 5.2 (livelli 1–20). */
export function encounterBudget(levels) {
  const out = { low: 0, moderate: 0, high: 0 };
  for (const l of levels || []) {
    const row = ENCOUNTER_XP_BUDGET_2024[Math.max(1, Math.min(20, Math.floor(Number(l) || 1)))];
    out.low += row.low; out.moderate += row.moderate; out.high += row.high;
  }
  return out;
}

/** Difficoltà di un incontro: 'none' (nessun PG) | 'trivial' | 'low' | 'moderate' | 'high' | 'over'. */
export function encounterDifficulty(xp, budget) {
  if (!budget || !budget.high) return 'none';
  if (xp > budget.high) return 'over';
  if (xp > budget.moderate) return 'high';
  if (xp > budget.low) return 'moderate';
  if (xp >= budget.low * 0.5) return 'low';
  return 'trivial';
}
export const DIFFICULTY_LABEL = {
  none: 'Senza gruppo', trivial: 'Banale', low: 'Bassa', moderate: 'Moderata', high: 'Alta', over: 'Oltre il budget alto',
};

/** PE totali dei mostri di un incontro: monsters = [{ monsterId, count }], byId(id) → mostro. */
export function encounterXp(monsters, byId) {
  return (monsters || []).reduce((s, m) => {
    const mon = byId(m.monsterId);
    const xp = mon ? (mon.xp ?? crToXp(mon.cr)) : 0;
    return s + xp * Math.max(0, Number(m.count) || 0);
  }, 0);
}

// ------------------------------------------------------------------ log

export function logEntry(type, text, extra = {}) {
  return { id: uid(), t: new Date().toISOString(), type, text, ...extra };
}

/** Testo di un tiro per il log: "Etichetta: 1d20+4 → [15] = 19". */
export function formatRoll(label, result) {
  if (!result) return String(label || 'Tiro');
  const detail = (result.rolls || []).map((r) => `[${(r.results || []).join(', ')}]`).join(' ');
  const expr = result.expr ? `${result.expr} → ` : '';
  const d20 = result.rolls?.[0]?.die?.includes('d20') && result.rolls[0].results?.length === 1 ? result.rolls[0].results[0] : null;
  const crit = d20 === 20 ? ' (20 naturale!)' : d20 === 1 ? ' (1 naturale)' : '';
  return `${label ? label + ': ' : ''}${expr}${detail}${detail ? ' = ' : ''}${result.total}${crit}`;
}

const pad = (n) => String(n).padStart(2, '0');
export function timeOf(iso) { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }

/**
 * Bozza di voce di diario dal log di una sessione.
 * Note → elenco "Appunti"; eventi di combattimento → "Combattimenti" (inizio/fine/KO/riepiloghi PE);
 * tiri e variazioni di PF sono riassunti in conteggi.
 */
export function journalDraftFromLog(session, { campaignName = '' } = {}) {
  const log = [...(session?.log || [])].sort((a, b) => String(a.t).localeCompare(String(b.t)));
  const notes = log.filter((e) => e.type === 'note');
  const combat = log.filter((e) => e.type === 'combat' && /inizia|termina|PE|sconfitt|round 1\b/i.test(e.text));
  const ko = log.filter((e) => e.type === 'hp' && /a terra|muore|sconfitt/i.test(e.text));
  const rolls = log.filter((e) => e.type === 'roll').length;
  const lines = [];
  const title = `Sessione ${session?.number ?? ''}${session?.title && session.title !== `Sessione ${session?.number}` ? ` — ${session.title}` : ''}`.trim();
  lines.push(`${campaignName ? campaignName + ' · ' : ''}${title}${session?.date ? ` (${session.date})` : ''}`);
  lines.push('');
  lines.push('Riassunto:');
  lines.push('(scrivi qui il racconto della sessione)');
  if (notes.length) {
    lines.push('', 'Appunti dal tavolo:');
    for (const n of notes) lines.push(`- [${timeOf(n.t)}] ${n.text}`);
  }
  if (combat.length || ko.length) {
    lines.push('', 'Combattimenti:');
    for (const e of [...combat, ...ko].sort((a, b) => String(a.t).localeCompare(String(b.t)))) lines.push(`- [${timeOf(e.t)}] ${e.text}`);
  }
  if (rolls) lines.push('', `Tiri registrati: ${rolls}.`);
  return lines.join('\n');
}
