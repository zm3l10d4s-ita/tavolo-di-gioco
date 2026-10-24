// Logica pura della scheda personaggio (nessun DOM, nessuno store): testabile con node.
// Usa i calcoli di src/lib/rules.js; qui solo trasformazioni del documento personaggio.
import * as R from '../../lib/rules.js';
import { uid, roll, norm, signed } from '../../lib/util.js';

export const ABILITIES = R.ABILITIES;
export const ATTUNE_MAX = 3;
export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];
export const POINT_BUY_BUDGET = 27;
export const POINT_COST = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };
/** Ciclo del pallino di competenza: nessuna → competenza → maestria → mezza → nessuna. */
export const PROF_CYCLE = [0, 1, 2, 0.5];
export const PROF_LABELS = { 0: 'Nessuna competenza', 0.5: 'Mezza competenza', 1: 'Competenza', 2: 'Maestria' };
export const RECOVERY = {
  short: { label: 'Riposo breve', abbr: 'rb' },
  long: { label: 'Riposo lungo', abbr: 'rl' },
  dawn: { label: 'Alba', abbr: 'alba' },
  other: { label: 'Altro', abbr: '—' },
};
export const ITEM_CATEGORIES = [
  { value: 'weapon', label: 'Arma' }, { value: 'armor', label: 'Armatura' }, { value: 'gear', label: 'Attrezzatura' },
  { value: 'tool', label: 'Strumento' }, { value: 'ammunition', label: 'Munizioni' }, { value: 'consumable', label: 'Consumabile' },
  { value: 'magic', label: 'Magico' }, { value: 'treasure', label: 'Tesoro' }, { value: 'other', label: 'Altro' },
];
export const ALIGNMENTS = ['Legale buono', 'Neutrale buono', 'Caotico buono', 'Legale neutrale', 'Neutrale', 'Caotico neutrale',
  'Legale malvagio', 'Neutrale malvagio', 'Caotico malvagio', 'Senza allineamento'];

const n = (v, d = 0) => (v !== null && v !== '' && v !== undefined && Number.isFinite(Number(v)) ? Number(v) : d);
const isNum = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));

// ---------------------------------------------------------------------------
// Documento personaggio: default e normalizzazione
// ---------------------------------------------------------------------------

function emptySlots() { const s = {}; for (let i = 1; i <= 9; i++) s[i] = { max: 0, used: 0 }; return s; }

/** Personaggio vuoto con tutti i campi dello schema (CONTRACTS.md + campi aggiunti dall'Agente 4). */
export function newCharacter(over = {}) {
  const abilities = {};
  for (const a of ABILITIES) abilities[a] = { score: 10, saveProf: false };
  return {
    campaignId: null, name: 'Nuovo personaggio', player: '', ruleset: '2014',
    race: { id: '', name: '' }, subrace: null, background: { id: '', name: '' }, alignment: '', gender: '',
    age: '', height: '', weight: '', eyes: '', skin: '', hair: '', appearance: '', backstory: '', faction: '', allies: '', enemies: '',
    classes: [], xp: 0, inspiration: false,
    abilities, skills: {},
    hp: { current: 0, temp: 0, maxOverride: null, bonusMax: 0 },
    hitDiceUsed: {}, deathSaves: { successes: 0, failures: 0 },
    exhaustion: 0, conditions: [], madness: '',
    acOverride: null, acBonus: 0, acTemp: 0, initiativeBonus: 0, speed: { walk: 30 }, senses: '',
    proficiencies: { armor: [], weapons: [], tools: [], languages: [], other: '' },
    attacks: [],
    spellcasting: { ability: null, saveDcOverride: null, attackOverride: null, slotsAuto: true, slots: emptySlots(), pact: { level: 0, max: 0, used: 0 }, spells: [], concentration: '' },
    resources: [], features: [], feats: [], inventory: [],
    currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
    personality: { traits: '', ideals: '', bonds: '', flaws: '' },
    notes: '',
    ...over,
  };
}

/** Riempie i campi mancanti (documenti vecchi/importati) senza toccare quelli presenti. Ritorna una copia. */
export function normalizeCharacter(c) {
  const d = newCharacter();
  const out = { ...d, ...(c || {}) };
  out.race = { ...d.race, ...(c?.race || {}) };
  out.background = { ...d.background, ...(c?.background || {}) };
  out.abilities = {};
  for (const a of ABILITIES) {
    const v = c?.abilities?.[a];
    out.abilities[a] = typeof v === 'number' ? { score: v, saveProf: false } : { score: 10, saveProf: false, ...(v || {}) };
  }
  out.skills = { ...(c?.skills || {}) };
  out.hp = { ...d.hp, ...(c?.hp || {}) };
  out.hitDiceUsed = { ...(c?.hitDiceUsed || {}) };
  out.deathSaves = { ...d.deathSaves, ...(c?.deathSaves || {}) };
  out.speed = { ...d.speed, ...(c?.speed || {}) };
  out.proficiencies = { ...d.proficiencies, ...(c?.proficiencies || {}) };
  for (const k of ['armor', 'weapons', 'tools', 'languages']) if (!Array.isArray(out.proficiencies[k])) out.proficiencies[k] = [];
  const sc = c?.spellcasting || {};
  out.spellcasting = { ...d.spellcasting, ...sc, slots: { ...emptySlots() }, pact: { ...d.spellcasting.pact, ...(sc.pact || {}) } };
  for (let i = 1; i <= 9; i++) out.spellcasting.slots[i] = { max: 0, used: 0, ...(sc.slots?.[i] || {}) };
  if (!Array.isArray(out.spellcasting.spells)) out.spellcasting.spells = [];
  if (out.spellcasting.slotsAuto === undefined) out.spellcasting.slotsAuto = true;
  if (out.spellcasting.concentration == null) out.spellcasting.concentration = '';
  for (const k of ['classes', 'attacks', 'resources', 'features', 'feats', 'inventory', 'conditions']) if (!Array.isArray(out[k])) out[k] = [];
  out.currency = { ...d.currency, ...(c?.currency || {}) };
  out.personality = { ...d.personality, ...(c?.personality || {}) };
  return out;
}

// ---------------------------------------------------------------------------
// Etichette
// ---------------------------------------------------------------------------

export function classLabel(c) {
  const cls = (c?.classes || []).filter((x) => x);
  if (!cls.length) return 'Senza classe';
  return cls.map((x) => `${x.name || x.classId || 'Classe'}${x.subclassName ? ` (${x.subclassName})` : ''} ${n(x.level, 1)}`).join(' / ');
}
export function raceLabel(c) {
  const r = c?.race?.name || '';
  const s = c?.subrace?.name || '';
  return s ? `${r} (${s})` : r;
}

// ---------------------------------------------------------------------------
// Punti ferita
// ---------------------------------------------------------------------------

/**
 * Applica un cambiamento di PF. delta < 0 = danno (prima i PF temporanei), delta > 0 = cura (fino al massimo).
 * Danno a 0 PF: +1 fallimento ai TS contro morte. Cura da 0 PF: azzera i TS contro morte.
 * Ritorna { character, info: { fromTemp, damage, healed, before, after, max, droppedToZero } }.
 */
export function applyHp(character, delta) {
  const c = normalizeCharacter(character);
  const max = R.maxHp(c);
  const before = n(c.hp.current, max);
  let cur = before, temp = Math.max(0, n(c.hp.temp, 0));
  const info = { fromTemp: 0, damage: 0, healed: 0, before, after: before, max, droppedToZero: false };
  const d = Math.trunc(n(delta, 0));
  if (d < 0) {
    let dmg = -d;
    info.fromTemp = Math.min(temp, dmg);
    temp -= info.fromTemp; dmg -= info.fromTemp;
    if (dmg > 0 && before <= 0) c.deathSaves = { ...c.deathSaves, failures: Math.min(3, n(c.deathSaves.failures) + 1) };
    cur = Math.max(0, cur - dmg);
    info.damage = before - cur;
    info.droppedToZero = before > 0 && cur === 0;
  } else if (d > 0) {
    const nc = Math.min(max, Math.max(0, cur) + d);
    info.healed = Math.max(0, nc - cur);
    if (cur <= 0 && nc > 0) c.deathSaves = { successes: 0, failures: 0 };
    cur = nc;
  }
  info.after = cur;
  c.hp = { ...c.hp, current: cur, temp };
  return { character: c, info };
}

/** Dadi vita disponibili: { d8: { total, used, left } }. */
export function hitDiceState(character) {
  const tot = R.hitDiceTotal(character);
  const out = {};
  for (const [k, total] of Object.entries(tot)) {
    const used = Math.min(total, Math.max(0, n(character?.hitDiceUsed?.[k], 0)));
    out[k] = { total, used, left: total - used };
  }
  return out;
}

/** Spende un dado vita: tiro + mod COS (min 0) curati. rollFn(expr) → numero (iniettabile nei test). */
export function spendHitDie(character, die, rollFn = (e) => roll(e).total) {
  const st = hitDiceState(character)[die];
  if (!st || st.left <= 0) return { character, ok: false, rolled: 0, healed: 0 };
  const rolled = rollFn('1' + die);
  const con = R.abilityModOf(character, 'con');
  const gain = Math.max(0, rolled + con);
  const { character: c, info } = applyHp(character, gain);
  c.hitDiceUsed = { ...c.hitDiceUsed, [die]: st.used + 1 };
  return { character: c, ok: true, rolled, con, healed: info.healed };
}

// ---------------------------------------------------------------------------
// Slot incantesimo
// ---------------------------------------------------------------------------

/**
 * Slot effettivi: se spellcasting.slotsAuto (default) i massimi vengono da rules.spellSlotsFor, altrimenti dai valori salvati.
 * Ritorna { slots: {1..9: {max, used}}, pact: {level, max, used}, auto, casterLevel }.
 */
export function effectiveSlots(character, classesData) {
  const c = normalizeCharacter(character);
  const auto = c.spellcasting.slotsAuto !== false;
  const calc = R.spellSlotsFor(c, classesData);
  const slots = {};
  for (let i = 1; i <= 9; i++) {
    const s = c.spellcasting.slots[i];
    const max = auto ? calc.slots[i] : n(s.max, 0);
    slots[i] = { max, used: Math.min(max, Math.max(0, n(s.used, 0))) };
  }
  const p = c.spellcasting.pact;
  const pmax = auto ? calc.pact.max : n(p.max, 0);
  const pact = { level: auto ? calc.pact.level : n(p.level, 0), max: pmax, used: Math.min(pmax, Math.max(0, n(p.used, 0))) };
  return { slots, pact, auto, casterLevel: calc.casterLevel };
}

/** True se gli slot salvati differiscono da quelli calcolati (da sincronizzare in modalità automatica). */
export function slotsNeedSync(character, classesData) {
  const c = normalizeCharacter(character);
  if (c.spellcasting.slotsAuto === false) return false;
  const e = effectiveSlots(c, classesData);
  for (let i = 1; i <= 9; i++) if (n(c.spellcasting.slots[i].max) !== e.slots[i].max) return true;
  return n(c.spellcasting.pact.max) !== e.pact.max || n(c.spellcasting.pact.level) !== e.pact.level;
}
/** Scrive nel documento i massimi effettivi (mantiene gli usati, limitati al nuovo massimo). */
export function syncSlots(character, classesData) {
  const c = normalizeCharacter(character);
  const e = effectiveSlots(c, classesData);
  for (let i = 1; i <= 9; i++) c.spellcasting.slots[i] = { ...e.slots[i] };
  c.spellcasting.pact = { ...e.pact };
  return c;
}

/** Usa uno slot. key = livello 1..9 oppure 'pact'. Ritorna { character, ok }. */
export function useSlot(character, key, classesData) {
  const c = syncSlots(character, classesData);
  const s = key === 'pact' ? c.spellcasting.pact : c.spellcasting.slots[key];
  if (!s || s.used >= s.max) return { character, ok: false };
  s.used += 1;
  return { character: c, ok: true };
}
/** Recupera uno slot speso. */
export function restoreSlot(character, key, classesData) {
  const c = syncSlots(character, classesData);
  const s = key === 'pact' ? c.spellcasting.pact : c.spellcasting.slots[key];
  if (!s || s.used <= 0) return { character, ok: false };
  s.used -= 1;
  return { character: c, ok: true };
}
/** Imposta direttamente il numero di slot usati (clic sui pallini). */
export function setSlotUsed(character, key, used, classesData) {
  const c = syncSlots(character, classesData);
  const s = key === 'pact' ? c.spellcasting.pact : c.spellcasting.slots[key];
  if (s) s.used = Math.max(0, Math.min(s.max, Math.trunc(n(used))));
  return c;
}

/** Opzioni di lancio per un incantesimo di livello `level`: slot ≥ livello (e patto). */
export function castOptions(character, level, classesData) {
  const e = effectiveSlots(character, classesData);
  const out = [];
  for (let i = Math.max(1, level); i <= 9; i++) {
    const s = e.slots[i];
    if (s.max > 0) out.push({ key: i, level: i, label: `Slot di ${i}° livello`, left: s.max - s.used, max: s.max });
  }
  if (e.pact.max > 0 && e.pact.level >= level) out.push({ key: 'pact', level: e.pact.level, label: `Slot del patto (${e.pact.level}°)`, left: e.pact.max - e.pact.used, max: e.pact.max });
  return out;
}
/** Migliore opzione di lancio: lo slot disponibile di livello più basso (il patto se è l'unico). */
export function bestCastOption(character, level, classesData) {
  return castOptions(character, level, classesData).filter((o) => o.left > 0).sort((a, b) => a.level - b.level || (a.key === 'pact' ? 1 : -1))[0] || null;
}

/**
 * Lancia un incantesimo: consuma lo slot `key` (se il livello è ≥ 1) e imposta la concentrazione se richiesta.
 * spell: { name, level, concentration }. Ritorna { character, ok, previousConcentration }.
 */
export function castSpell(character, spell, key, classesData) {
  let c = normalizeCharacter(character);
  if (n(spell?.level) > 0) {
    const r = useSlot(c, key, classesData);
    if (!r.ok) return { character, ok: false };
    c = r.character;
  }
  const prev = c.spellcasting.concentration || '';
  if (spell?.concentration) c.spellcasting.concentration = spell.name;
  return { character: c, ok: true, previousConcentration: spell?.concentration && prev && prev !== spell.name ? prev : '' };
}

/** Numero massimo di incantesimi preparati (null se la classe non prepara). */
export function preparedMax(character, classesData, levelsData) {
  const list = Array.isArray(classesData) ? classesData : [];
  let total = 0, any = false;
  for (const e of character?.classes || []) {
    const cd = list.find((x) => x.id === e.classId);
    const sp = cd?.spellcasting;
    if (!sp || sp.preparation === 'known') continue;
    const lv = n(e.level, 1);
    if (character?.ruleset === '2024') {
      const row = (levelsData || []).find((l) => l.id === `${e.classId}-${lv}`);
      if (row?.preparedSpells != null) { total += row.preparedSpells; any = true; }
      continue;
    }
    const mod = R.abilityModOf(character, sp.ability || R.CLASS_SPELL_ABILITY[R.baseKey(e.classId)] || 'wis');
    const eff = sp.type === 'half' ? Math.floor(lv / 2) : lv;
    total += Math.max(1, mod + eff); any = true;
  }
  return any ? total : null;
}

// ---------------------------------------------------------------------------
// Riposi
// ---------------------------------------------------------------------------

function resetResources(c, kinds, summary) {
  const names = [];
  c.resources = (c.resources || []).map((r) => {
    if (kinds.includes(r.recovery || 'long') && n(r.used) > 0) { names.push(r.name); return { ...r, used: 0 }; }
    return r;
  });
  if (names.length) summary.push(`Risorse ripristinate: ${names.join(', ')}`);
}

/** Riposo breve: risorse 'short' e slot del patto. (I dadi vita si spendono con spendHitDie.) */
export function shortRest(character, classesData) {
  const c = syncSlots(character, classesData);
  const summary = [];
  resetResources(c, ['short'], summary);
  if (c.spellcasting.pact.used > 0) { summary.push(`Slot del patto ripristinati (${c.spellcasting.pact.used})`); c.spellcasting.pact.used = 0; }
  if (!summary.length) summary.push('Nessuna risorsa da ripristinare');
  return { character: c, summary };
}

/** Riposo lungo: PF pieni, PF temp 0, metà dadi vita (min 1), tutti gli slot, risorse short/long, sfinimento −1, TS morte azzerati. */
export function longRest(character, classesData) {
  const c = syncSlots(character, classesData);
  const summary = [];
  const max = R.maxHp(c);
  const cur = n(c.hp.current, max);
  if (cur < max) summary.push(`PF ripristinati: ${cur} → ${max}`);
  c.hp = { ...c.hp, current: max, temp: 0 };
  // dadi vita: recupera metà del totale (min 1), prima i dadi più grandi
  const st = hitDiceState(c);
  const totalDice = Object.values(st).reduce((s, x) => s + x.total, 0);
  let regain = Math.max(1, Math.floor(totalDice / 2));
  const got = [];
  for (const die of Object.keys(st).sort((a, b) => Number(b.slice(1)) - Number(a.slice(1)))) {
    const take = Math.min(regain, st[die].used);
    if (take > 0) { c.hitDiceUsed[die] = st[die].used - take; regain -= take; got.push(`${take}${die}`); }
  }
  if (got.length) summary.push(`Dadi vita recuperati: ${got.join(', ')}`);
  let slotsUsed = 0;
  for (let i = 1; i <= 9; i++) { slotsUsed += c.spellcasting.slots[i].used; c.spellcasting.slots[i].used = 0; }
  slotsUsed += c.spellcasting.pact.used; c.spellcasting.pact.used = 0;
  if (slotsUsed) summary.push(`Slot incantesimo ripristinati (${slotsUsed})`);
  resetResources(c, ['short', 'long'], summary);
  if (n(c.exhaustion) > 0) { summary.push(`Sfinimento: ${c.exhaustion} → ${c.exhaustion - 1}`); c.exhaustion = n(c.exhaustion) - 1; }
  if (n(c.deathSaves.successes) || n(c.deathSaves.failures)) summary.push('TS contro morte azzerati');
  c.deathSaves = { successes: 0, failures: 0 };
  if (!summary.length) summary.push('Già al pieno delle forze');
  return { character: c, summary };
}

/** Alba: risorse con recupero 'dawn'. */
export function dawn(character) {
  const c = normalizeCharacter(character);
  const summary = [];
  resetResources(c, ['dawn'], summary);
  if (!summary.length) summary.push('Nessuna risorsa che si ricarica all\'alba');
  return { character: c, summary };
}

// ---------------------------------------------------------------------------
// Tiri
// ---------------------------------------------------------------------------

/** Espressione d20 con vantaggio/svantaggio. mode: 'normal'|'adv'|'dis'. */
export function d20Expr(bonus, mode = 'normal') {
  const b = n(bonus, 0);
  const base = mode === 'adv' ? '2d20kh1' : mode === 'dis' ? '2d20kl1' : '1d20';
  return b ? `${base}${b > 0 ? '+' : ''}${b}` : base;
}
/** Tiro d20: { total, natural, rolls, expr, mode, bonus, crit, fumble }. */
export function rollD20(bonus, mode = 'normal', rollFn = roll) {
  const r = rollFn(d20Expr(bonus, mode));
  const d = r.rolls[0];
  const natural = mode === 'adv' ? Math.max(...d.results) : mode === 'dis' ? Math.min(...d.results) : d.results[0];
  return { ...r, natural, mode, bonus: n(bonus), crit: natural === 20, fumble: natural === 1 };
}

/** Testo leggibile del risultato di un tiro. */
export function describeRoll(label, r) {
  const modeTxt = r.mode === 'adv' ? ' (vantaggio)' : r.mode === 'dis' ? ' (svantaggio)' : '';
  const dice = r.rolls.map((x) => `${x.die}: ${x.results.join(', ')}`).join(' · ');
  const tag = r.crit ? ' — 20 naturale!' : r.fumble ? ' — 1 naturale' : '';
  return `${label}${modeTxt}: ${r.total} [${dice}${r.bonus ? ` ${signed(r.bonus)}` : ''}]${tag}`;
}

/** Bonus di attacco: override (stringa "+8" o numero) oppure mod caratteristica + competenza. */
export function attackBonus(character, atk) {
  const ov = atk?.attackBonusOverride;
  if (ov !== null && ov !== undefined && String(ov).trim() !== '') {
    const m = String(ov).replace(/\s/g, '').match(/^[+-]?\d+/);
    if (m) return Number(m[0]);
  }
  const mod = atk?.ability ? R.abilityModOf(character, atk.ability) : 0;
  return mod + (atk?.proficient ? R.profBonus(character) : 0);
}

// ---------------------------------------------------------------------------
// Abilità
// ---------------------------------------------------------------------------

export function cycleProf(p) {
  const i = PROF_CYCLE.indexOf(n(p, 0));
  return PROF_CYCLE[(i + 1) % PROF_CYCLE.length];
}

// ---------------------------------------------------------------------------
// Inventario
// ---------------------------------------------------------------------------

export function attunedCount(character) { return (character?.inventory || []).filter((i) => i?.attuned).length; }

/** Categoria d'inventario da un oggetto SRD (equipment o magicItems). */
export function categoryForSrdItem(item, dataset) {
  if (dataset === 'magicItems') return item?.type === 'potion' || item?.type === 'scroll' ? 'consumable' : item?.type === 'ammunition' ? 'ammunition' : 'magic';
  if (item?.subcategory === 'ammunition') return 'ammunition';
  if (item?.category === 'weapon' || item?.category === 'armor' || item?.category === 'tool') return item.category;
  if (item?.category === 'poison') return 'consumable';
  return 'gear';
}
/** Voce d'inventario da un oggetto SRD. */
export function inventoryItemFromSrd(item, dataset) {
  const category = categoryForSrdItem(item, dataset);
  return {
    id: uid(), itemId: item.id, dataset, name: item.name, qty: category === 'ammunition' ? n(item.quantity, 1) || 1 : 1,
    weight: n(item.weight, 0), equipped: false, attuned: false, category, notes: '',
  };
}

/** Attacco generato da un'arma SRD (Finesse → la caratteristica migliore tra FOR/DES; a distanza → DES). */
export function attackFromWeapon(character, weapon) {
  const props = weapon?.properties || [];
  let ability = weapon?.weaponRange === 'ranged' ? 'dex' : 'str';
  if (props.includes('finesse')) ability = R.abilityModOf(character, 'dex') >= R.abilityModOf(character, 'str') ? 'dex' : 'str';
  const mod = R.abilityModOf(character, ability);
  const dice = weapon?.damage?.dice || '1d4';
  return {
    id: uid(), name: weapon?.name || 'Arma', ability, proficient: true, attackBonusOverride: null,
    damage: mod ? `${dice}${mod > 0 ? '+' : ''}${mod}` : dice, damageType: weapon?.damage?.type || '',
    notes: [weapon?.range?.long ? `gittata ${weapon.range.normal}/${weapon.range.long} ft` : '', props.join(', ')].filter(Boolean).join(' · '),
    weaponId: weapon?.id || null,
  };
}

// ---------------------------------------------------------------------------
// Caratteristiche (creazione)
// ---------------------------------------------------------------------------

export function pointBuyCost(scores) {
  let t = 0;
  for (const a of ABILITIES) { const c = POINT_COST[n(scores?.[a], 8)]; if (c === undefined) return Infinity; t += c; }
  return t;
}
/** 4d6, scarta il più basso. */
export function roll4d6kh3(rollFn = roll) { return rollFn('4d6kh3').total; }

/** Bonus razziali (2014) + scelte (es. Mezzelfo) + bonus di background (2024). Ritorna { str: +n, … }. */
export function abilityBonuses({ race, subrace, chosen = {} } = {}) {
  const out = {};
  for (const b of [...(race?.abilityBonuses || []), ...(subrace?.abilityBonuses || [])]) out[b.ability] = (out[b.ability] || 0) + n(b.bonus);
  for (const [a, v] of Object.entries(chosen || {})) out[a] = (out[a] || 0) + n(v);
  return out;
}

// ---------------------------------------------------------------------------
// Privilegi, risorse di classe, livelli
// ---------------------------------------------------------------------------

/** Livello a cui la classe sceglie la sottoclasse (dai dati SRD; default 3). */
export function subclassLevel(classId, subclassesData) {
  const subs = (subclassesData || []).filter((s) => s.classId === classId);
  const lv = subs.flatMap((s) => (s.features || []).map((f) => n(f.level, 99)));
  return lv.length ? Math.min(...lv) : 3;
}

const hasFeature = (c, name) => (c.features || []).some((f) => norm(f.name) === norm(name));

/** Privilegi di classe/sottoclasse con livello ≤ livello di classe non ancora presenti. */
export function missingClassFeatures(character, classesData, subclassesData, { upTo } = {}) {
  const c = normalizeCharacter(character);
  const out = [];
  const seen = new Set();
  for (const e of c.classes) {
    const max = upTo ?? n(e.level, 1);
    const cd = (classesData || []).find((x) => x.id === e.classId);
    const sd = e.subclassId ? (subclassesData || []).find((x) => x.id === e.subclassId) : null;
    const feats = [
      ...(cd?.features || []).map((f) => ({ ...f, from: cd.name_it || cd.name })),
      ...(sd?.features || []).map((f) => ({ ...f, from: sd.name })),
    ].filter((f) => n(f.level, 1) <= max).sort((a, b) => n(a.level) - n(b.level));
    for (const f of feats) {
      const key = norm(f.name);
      if (seen.has(key) || hasFeature(c, f.name)) continue;
      seen.add(key);
      out.push({ id: uid(), name: f.name, source: 'class', level: n(f.level, 1), origin: `${f.from} ${n(f.level, 1)}`, text: f.desc || '' });
    }
  }
  return out;
}

/** Privilegi ottenuti esattamente al livello `level` di una classe (per "Livello su"). */
export function featuresAtLevel(classId, subclassId, level, classesData, subclassesData) {
  const cd = (classesData || []).find((x) => x.id === classId);
  const sd = subclassId ? (subclassesData || []).find((x) => x.id === subclassId) : null;
  return [
    ...(cd?.features || []).filter((f) => n(f.level) === level).map((f) => ({ id: uid(), name: f.name, source: 'class', level, origin: `${cd.name_it || cd.name} ${level}`, text: f.desc || '' })),
    ...(sd?.features || []).filter((f) => n(f.level) === level).map((f) => ({ id: uid(), name: f.name, source: 'class', level, origin: `${sd.name} ${level}`, text: f.desc || '' })),
  ];
}

/** Tratti di razza e sottorazza come privilegi. */
export function raceFeatures(race, subrace) {
  return [...(race?.traits || []), ...(subrace?.traits || [])].map((t) => ({
    id: uid(), name: t.name, source: 'race', origin: subrace && (subrace.traits || []).includes(t) ? subrace.name : race?.name_it || race?.name || '', text: t.desc || '',
  }));
}

const RES_DEFS = [
  // [chiave, nome, recupero, funzione (classe base, livello, riga levels, personaggio) → max | 0]
  ['rage', 'Ira', 'long', (k, lv, row) => (k === 'barbarian' ? n(row?.classSpecific?.rageCount, 0) : 0)],
  ['wild-shape', 'Forma selvatica', (rs) => (rs === '2024' ? 'long' : 'short'), (k, lv, row, c) => (k !== 'druid' ? 0 : c.ruleset === '2024' ? n(row?.classSpecific?.wildShapeUses, 0) : lv >= 2 ? 2 : 0)],
  ['channel-divinity', 'Incanalare divinità', 'short', (k, lv, row) => (k === 'cleric' || k === 'paladin' ? n(row?.classSpecific?.channelDivinityCharges, k === 'paladin' && lv >= 3 ? 1 : 0) : 0)],
  ['ki', 'Punti ki', 'short', (k, lv, row, c) => (k === 'monk' && c.ruleset !== '2024' ? n(row?.classSpecific?.kiPoints, 0) : 0)],
  ['focus', 'Punti concentrazione', 'short', (k, lv, row, c) => (k === 'monk' && c.ruleset === '2024' ? n(row?.classSpecific?.focusPoints, 0) : 0)],
  ['sorcery', 'Punti stregoneria', 'long', (k, lv, row) => (k === 'sorcerer' ? n(row?.classSpecific?.sorceryPoints, 0) : 0)],
  ['second-wind', 'Recuperare energie', (rs) => (rs === '2024' ? 'long' : 'short'), (k, lv, row, c) => (k !== 'fighter' ? 0 : c.ruleset === '2024' ? n(row?.classSpecific?.secondWindUses, 0) : 1)],
  ['action-surge', 'Azione impetuosa', 'short', (k, lv) => (k === 'fighter' ? (lv >= 17 ? 2 : lv >= 2 ? 1 : 0) : 0)],
  ['indomitable', 'Indomabile', 'long', (k, lv, row) => (k === 'fighter' ? n(row?.classSpecific?.indomitableUses, lv >= 17 ? 3 : lv >= 13 ? 2 : lv >= 9 ? 1 : 0) : 0)],
  ['bardic-inspiration', 'Ispirazione bardica', (rs, lv) => (lv >= 5 ? 'short' : 'long'), (k, lv, row, c) => (k === 'bard' ? Math.max(1, R.abilityModOf(c, 'cha')) : 0)],
  ['lay-on-hands', 'Imposizione delle mani (PF)', 'long', (k, lv) => (k === 'paladin' ? lv * 5 : 0)],
  ['divine-sense', 'Senso divino', 'long', (k, lv, row, c) => (k === 'paladin' && c.ruleset !== '2024' ? 1 + Math.max(0, R.abilityModOf(c, 'cha')) : 0)],
  ['arcane-recovery', 'Recupero arcano', 'long', (k) => (k === 'wizard' ? 1 : 0)],
];

/** Risorse a usi limitati suggerite dai dati di classe: [{ autoKey, name, max, recovery }]. */
export function suggestedResources(character, levelsData) {
  const c = normalizeCharacter(character);
  const out = [];
  for (const e of c.classes) {
    const k = R.baseKey(e.classId);
    const lv = n(e.level, 1);
    const row = (levelsData || []).find((l) => l.id === `${e.classId}-${lv}`);
    for (const [key, name, rec, fn] of RES_DEFS) {
      const max = fn(k, lv, row, c);
      if (max > 0) out.push({ autoKey: key, name, max: max >= 9999 ? 99 : max, recovery: typeof rec === 'function' ? rec(c.ruleset, lv) : rec });
    }
  }
  return out;
}

/** Aggiorna/aggiunge le risorse suggerite (match per autoKey o per nome). Ritorna { character, added, updated }. */
export function applySuggestedResources(character, levelsData) {
  const c = normalizeCharacter(character);
  const added = [], updated = [];
  for (const s of suggestedResources(c, levelsData)) {
    const i = c.resources.findIndex((r) => r.autoKey === s.autoKey || norm(r.name).startsWith(norm(s.name)));
    if (i < 0) { c.resources.push({ id: uid(), used: 0, ...s }); added.push(s.name); }
    else if (n(c.resources[i].max) !== s.max) { c.resources[i] = { ...c.resources[i], max: s.max, autoKey: s.autoKey }; updated.push(s.name); }
  }
  return { character: c, added, updated };
}

/** PF guadagnati con un livello: media (d/2+1) o tiro, + mod COS, minimo 1. */
export function hpGainForLevel(character, hitDie, method = 'avg', rolled = null) {
  const con = R.abilityModOf(character, 'con');
  const avg = n(hitDie, 8) / 2 + 1;
  const base = method === 'roll' && isNum(rolled) ? Number(rolled) : avg;
  return { gain: Math.max(1, base + con), avgGain: Math.max(1, avg + con) };
}

/**
 * Sale di un livello. opts: { classIndex } per una classe esistente o { newClass: {classId,name,hitDie,...} } per multiclasse;
 * hpMethod 'avg'|'roll', hpRoll (risultato del dado), subclass { id, name } opzionale.
 * Max PF: se c'è maxOverride lo incrementa; con il tiro, la differenza dalla media va in hp.bonusMax.
 * Ritorna { character, classIndex, newLevel, hpGain }.
 */
export function levelUp(character, { classIndex = 0, newClass = null, hpMethod = 'avg', hpRoll = null, subclass = null } = {}) {
  const c = normalizeCharacter(character);
  let idx = classIndex;
  if (newClass) {
    c.classes = [...c.classes, { classId: newClass.classId || '', name: newClass.name || 'Classe', subclassId: '', subclassName: '', level: 0, hitDie: n(newClass.hitDie, 8), ...(newClass.casterType !== undefined ? { casterType: newClass.casterType } : {}) }];
    idx = c.classes.length - 1;
  }
  if (!c.classes[idx]) throw new Error('levelUp: classe non trovata');
  const entry = { ...c.classes[idx] };
  const firstEver = R.totalLevel(c) === 0;
  entry.level = n(entry.level, 0) + 1;
  if (subclass) { entry.subclassId = subclass.id || ''; entry.subclassName = subclass.name || ''; }
  const { gain: g, avgGain } = hpGainForLevel(c, entry.hitDie, hpMethod, hpRoll);
  const fullDie = Math.max(1, n(entry.hitDie, 8) + R.abilityModOf(c, 'con'));
  const gain = firstEver ? fullDie : g;
  const hasOv = isNum(c.hp.maxOverride);
  c.classes = c.classes.map((x, i) => (i === idx ? entry : x));
  if (hasOv) c.hp.maxOverride = Number(c.hp.maxOverride) + gain;
  else if (!firstEver && hpMethod === 'roll') c.hp.bonusMax = n(c.hp.bonusMax) + (gain - avgGain);
  c.hp.current = n(c.hp.current, 0) + gain;
  return { character: c, classIndex: idx, newLevel: entry.level, hpGain: gain };
}

// ---------------------------------------------------------------------------
// Creazione guidata
// ---------------------------------------------------------------------------

/**
 * Costruisce un personaggio dalle scelte della creazione guidata.
 * choices: { name, player, ruleset, campaignId, race:{id,name}, subrace:{id,name}|null, background:{id,name},
 *   cls: { classId, name, hitDie, subclassId, subclassName, level, casterType? }, scores: {str..cha} (finali, già con bonus),
 *   skills: [skillId], startingEquipment: bool }
 * data: { races, subraces, classes, subclasses, backgrounds, levels, languages, equipment } (array SRD, opzionali).
 */
export function buildCharacter(choices, data = {}) {
  const ch = choices || {};
  const ruleset = ch.ruleset === '2024' ? '2024' : '2014';
  const find = (arr, id) => (id ? (arr || []).find((x) => x.id === id) : null);
  const raceD = find(data.races, ch.race?.id);
  const subD = find(data.subraces, ch.subrace?.id);
  const clsD = find(data.classes, ch.cls?.classId);
  const subclsD = find(data.subclasses, ch.cls?.subclassId);
  const bgD = find(data.backgrounds, ch.background?.id);

  const c = newCharacter({
    name: ch.name || 'Nuovo personaggio', player: ch.player || '', ruleset, campaignId: ch.campaignId || null,
    race: { id: ch.race?.id || '', name: ch.race?.name || raceD?.name_it || raceD?.name || '' },
    subrace: ch.subrace?.name || ch.subrace?.id ? { id: ch.subrace.id || '', name: ch.subrace.name || subD?.name || '' } : null,
    background: { id: ch.background?.id || '', name: ch.background?.name || bgD?.name || '' },
    alignment: ch.alignment || '', gender: ch.gender || '',
  });
  for (const a of ABILITIES) c.abilities[a] = { score: n(ch.scores?.[a], 10), saveProf: (clsD?.savingThrows || ch.cls?.saves || []).includes(a) };
  for (const s of new Set([...(ch.skills || []), ...(bgD?.skillProficiencies || [])])) c.skills[s] = { prof: 1, bonus: 0 };
  if (raceD?.speed) c.speed.walk = n(raceD.speed, 30);
  if ([...(raceD?.traits || []), ...(subD?.traits || [])].some((t) => /dwarven-toughness/.test(t.id || ''))) c.hp.bonusPerLevel = 1;
  const dv = (raceD?.traits || []).find((t) => /darkvision/i.test(t.id || t.name));
  if (dv) c.senses = `Scurovisione ${R.formatDistance(n((dv.name.match(/\d+/) || [60])[0], 60), ch.units || 'm')}`;

  const lvl = Math.max(1, Math.min(20, n(ch.cls?.level, 1)));
  c.classes = [{
    classId: ch.cls?.classId || '', name: ch.cls?.name || clsD?.name_it || clsD?.name || 'Classe',
    subclassId: ch.cls?.subclassId || '', subclassName: ch.cls?.subclassName || subclsD?.name || '', level: lvl,
    hitDie: n(ch.cls?.hitDie, clsD?.hitDie || 8),
    ...(ch.cls?.casterType !== undefined && !clsD ? { casterType: ch.cls.casterType || null } : {}),
  }];
  // competenze
  if (clsD) {
    c.proficiencies.armor = [...(clsD.proficiencies_it?.armor || clsD.proficiencies?.armor || [])];
    c.proficiencies.weapons = [...(clsD.proficiencies_it?.weapons || clsD.proficiencies?.weapons || [])];
    c.proficiencies.tools = [...(clsD.proficiencies?.tools || [])];
  }
  for (const t of bgD?.toolProficiencies || []) if (!c.proficiencies.tools.includes(t)) c.proficiencies.tools.push(t);
  const langs = (raceD?.languages || []).map((id) => {
    const l = (data.languages || []).find((x) => x.id === id);
    return l?.name_it || l?.name || id;
  });
  c.proficiencies.languages = [...new Set(langs)];
  for (const t of raceD?.traits || []) for (const p of t.proficiencies || []) if (!c.proficiencies.weapons.includes(p)) c.proficiencies.weapons.push(p);
  // incantesimi
  c.spellcasting.ability = clsD?.spellcasting?.ability || R.CLASS_SPELL_ABILITY[R.baseKey(ch.cls?.classId)] || null;
  // privilegi
  c.features = [...raceFeatures(raceD, subD)];
  if (bgD?.feature) c.features.push({ id: uid(), name: bgD.feature.name, source: 'background', origin: bgD.name, text: bgD.feature.desc || '' });
  if (bgD?.feat) c.feats.push({ id: uid(), featId: bgD.feat.id, name: bgD.feat.name + (bgD.feat.note ? ` (${bgD.feat.note})` : ''), text: '' });
  c.features.push(...missingClassFeatures(c, data.classes, data.subclasses));
  // risorse
  Object.assign(c, applySuggestedResources(c, data.levels).character);
  // equipaggiamento iniziale fisso (2014)
  if (ch.startingEquipment) {
    for (const se of [...(clsD?.startingEquipment || []), ...(bgD?.equipment || [])]) {
      const it = (data.equipment || []).find((x) => x.id === se.id);
      const inv = it ? inventoryItemFromSrd(it, 'equipment') : { id: uid(), itemId: null, name: se.name, qty: 1, weight: 0, equipped: false, attuned: false, category: 'gear', notes: '' };
      inv.qty = n(se.qty, 1);
      if (it && (it.category === 'armor')) inv.equipped = true;
      c.inventory.push(inv);
    }
    if (bgD?.startingGold?.unit) c.currency[bgD.startingGold.unit] = n(c.currency[bgD.startingGold.unit]) + n(bgD.startingGold.qty);
  }
  // PF iniziali e slot
  c.hp.current = R.maxHp(c);
  return syncSlots(c, data.classes);
}

/** Copia di un personaggio con nuovi id interni. */
export function duplicateCharacter(c) {
  const d = structuredClone(c);
  delete d.id; delete d.createdAt; delete d.updatedAt;
  d.name = `${c.name || 'Personaggio'} (copia)`;
  for (const k of ['attacks', 'resources', 'features', 'feats', 'inventory']) d[k] = (d[k] || []).map((x) => ({ ...x, id: uid() }));
  if (d.spellcasting?.spells) d.spellcasting.spells = d.spellcasting.spells.map((x) => ({ ...x, id: uid() }));
  return d;
}

/** Riepilogo per il combat tracker (vedi api.js). */
export function summarize(character, equipmentItems) {
  const c = normalizeCharacter(character);
  const max = R.maxHp(c);
  return {
    id: c.id, name: c.name,
    ac: R.armorClass(c, equipmentItems) + n(c.acTemp, 0),
    maxHp: max, hp: n(c.hp.current, max), tempHp: n(c.hp.temp, 0),
    initBonus: R.initiative(c), passivePerception: R.passive(c, 'perception'), speedFt: n(c.speed.walk, 30),
  };
}
