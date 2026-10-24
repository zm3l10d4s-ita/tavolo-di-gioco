// Calcoli di regole D&D 5e (SRD 5.1 / SRD 5.2). Modulo puro: nessun import di UI o store.
// Usa i nomi di campo dello schema personaggio di CONTRACTS.md.
// Distanze in piedi (ft) e pesi in libbre (lb) come nell'SRD; conversione solo in visualizzazione.

// ---------------------------------------------------------------------------
// Costanti / tabelle
// ---------------------------------------------------------------------------

export const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

export const ABILITY_LABELS_IT = {
  str: { name: 'Forza', abbr: 'FOR' },
  dex: { name: 'Destrezza', abbr: 'DES' },
  con: { name: 'Costituzione', abbr: 'COS' },
  int: { name: 'Intelligenza', abbr: 'INT' },
  wis: { name: 'Saggezza', abbr: 'SAG' },
  cha: { name: 'Carisma', abbr: 'CAR' },
};

/** skillId (id SRD) → { ability, name_it } */
export const SKILLS = {
  acrobatics: { ability: 'dex', name_it: 'Acrobazia' },
  'animal-handling': { ability: 'wis', name_it: 'Addestrare Animali' },
  arcana: { ability: 'int', name_it: 'Arcano' },
  athletics: { ability: 'str', name_it: 'Atletica' },
  deception: { ability: 'cha', name_it: 'Inganno' },
  history: { ability: 'int', name_it: 'Storia' },
  insight: { ability: 'wis', name_it: 'Intuizione' },
  intimidation: { ability: 'cha', name_it: 'Intimidire' },
  investigation: { ability: 'int', name_it: 'Indagare' },
  medicine: { ability: 'wis', name_it: 'Medicina' },
  nature: { ability: 'int', name_it: 'Natura' },
  perception: { ability: 'wis', name_it: 'Percezione' },
  performance: { ability: 'cha', name_it: 'Intrattenere' },
  persuasion: { ability: 'cha', name_it: 'Persuasione' },
  religion: { ability: 'int', name_it: 'Religione' },
  'sleight-of-hand': { ability: 'dex', name_it: 'Rapidità di Mano' },
  stealth: { ability: 'dex', name_it: 'Furtività' },
  survival: { ability: 'wis', name_it: 'Sopravvivenza' },
};

/** XP minimi per raggiungere il livello (indice = livello). SRD 5.1 e 5.2 identici. */
export const XP_TABLE = [null, 0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000,
  85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000];

/** Bonus di competenza per livello del personaggio (indice = livello). */
export const PROF_BY_LEVEL = [null, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6, 6];

/** Slot per livello d'incantatore (multiclasse / incantatori completi). Indice = livello incantatore, valori = slot 1°..9°. */
export const MULTICLASS_SLOTS = [
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
  [2, 0, 0, 0, 0, 0, 0, 0, 0],
  [3, 0, 0, 0, 0, 0, 0, 0, 0],
  [4, 2, 0, 0, 0, 0, 0, 0, 0],
  [4, 3, 0, 0, 0, 0, 0, 0, 0],
  [4, 3, 2, 0, 0, 0, 0, 0, 0],
  [4, 3, 3, 0, 0, 0, 0, 0, 0],
  [4, 3, 3, 1, 0, 0, 0, 0, 0],
  [4, 3, 3, 2, 0, 0, 0, 0, 0],
  [4, 3, 3, 3, 1, 0, 0, 0, 0],
  [4, 3, 3, 3, 2, 0, 0, 0, 0],
  [4, 3, 3, 3, 2, 1, 0, 0, 0],
  [4, 3, 3, 3, 2, 1, 0, 0, 0],
  [4, 3, 3, 3, 2, 1, 1, 0, 0],
  [4, 3, 3, 3, 2, 1, 1, 0, 0],
  [4, 3, 3, 3, 2, 1, 1, 1, 0],
  [4, 3, 3, 3, 2, 1, 1, 1, 0],
  [4, 3, 3, 3, 2, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 2, 1, 1],
];

/** Magia del patto (Warlock), indice = livello da warlock → { slots, slotLevel }. Uguale in 5.1 e 5.2. */
export const PACT_SLOTS = [
  { slots: 0, slotLevel: 0 },
  { slots: 1, slotLevel: 1 }, { slots: 2, slotLevel: 1 }, { slots: 2, slotLevel: 2 }, { slots: 2, slotLevel: 2 },
  { slots: 2, slotLevel: 3 }, { slots: 2, slotLevel: 3 }, { slots: 2, slotLevel: 4 }, { slots: 2, slotLevel: 4 },
  { slots: 2, slotLevel: 5 }, { slots: 2, slotLevel: 5 }, { slots: 3, slotLevel: 5 }, { slots: 3, slotLevel: 5 },
  { slots: 3, slotLevel: 5 }, { slots: 3, slotLevel: 5 }, { slots: 3, slotLevel: 5 }, { slots: 3, slotLevel: 5 },
  { slots: 4, slotLevel: 5 }, { slots: 4, slotLevel: 5 }, { slots: 4, slotLevel: 5 }, { slots: 4, slotLevel: 5 },
];

/** Tipo di incantatore per classe SRD (chiave base, senza suffisso -2024). */
export const CLASS_CASTER_TYPE = {
  bard: 'full', cleric: 'full', druid: 'full', sorcerer: 'full', wizard: 'full',
  paladin: 'half', ranger: 'half', warlock: 'pact',
  barbarian: null, fighter: null, monk: null, rogue: null,
  // Classi del catalogo non SRD: 'half-up' = mezzo incantatore che arrotonda per eccesso e ha slot dal 1° livello (Artefice).
  artificer: 'half-up', 'blood-hunter': null,
};
/** Sottoclassi che rendono la classe un incantatore a un terzo (non SRD: usabili come homebrew). */
export const SUBCLASS_CASTER_TYPE = { 'eldritch-knight': 'third', 'arcane-trickster': 'third' };
/** Caratteristica da incantatore per classe SRD. */
export const CLASS_SPELL_ABILITY = {
  bard: 'cha', cleric: 'wis', druid: 'wis', sorcerer: 'cha', wizard: 'int',
  paladin: 'cha', ranger: 'wis', warlock: 'cha', 'eldritch-knight': 'int', 'arcane-trickster': 'int', artificer: 'int',
};

/** Grado di sfida → PE. Chiavi come stringhe ('0', '1/8', '1/4', '1/2', '1'..'30'). */
export const CR_XP = {
  '0': 10, '1/8': 25, '1/4': 50, '1/2': 100, '1': 200, '2': 450, '3': 700, '4': 1100, '5': 1800,
  '6': 2300, '7': 2900, '8': 3900, '9': 5000, '10': 5900, '11': 7200, '12': 8400, '13': 10000,
  '14': 11500, '15': 13000, '16': 15000, '17': 18000, '18': 20000, '19': 22000, '20': 25000,
  '21': 33000, '22': 41000, '23': 50000, '24': 62000, '25': 75000, '26': 90000, '27': 105000,
  '28': 120000, '29': 135000, '30': 155000,
};

/** Budget PE per personaggio (SRD 5.2, Gameplay Toolbox → Combat Encounters). Indice = livello. */
export const ENCOUNTER_XP_BUDGET_2024 = [null,
  { low: 50, moderate: 75, high: 100 }, { low: 100, moderate: 150, high: 200 },
  { low: 150, moderate: 225, high: 400 }, { low: 250, moderate: 375, high: 500 },
  { low: 500, moderate: 750, high: 1100 }, { low: 600, moderate: 1000, high: 1400 },
  { low: 750, moderate: 1300, high: 1700 }, { low: 1000, moderate: 1700, high: 2100 },
  { low: 1300, moderate: 2000, high: 2600 }, { low: 1600, moderate: 2300, high: 3100 },
  { low: 1900, moderate: 2900, high: 4100 }, { low: 2200, moderate: 3700, high: 4700 },
  { low: 2600, moderate: 4200, high: 5400 }, { low: 2900, moderate: 4900, high: 6200 },
  { low: 3300, moderate: 5400, high: 7800 }, { low: 3800, moderate: 6100, high: 9800 },
  { low: 4500, moderate: 7200, high: 11700 }, { low: 5000, moderate: 8700, high: 14200 },
  { low: 5500, moderate: 10700, high: 17200 }, { low: 6400, moderate: 13200, high: 22000 },
];

/** Moltiplicatori della capacità di trasporto per taglia (SRD 5.1 "Lifting and Carrying"). */
export const SIZE_CARRY_MULT = { tiny: 0.5, small: 1, medium: 1, large: 2, huge: 4, gargantuan: 8 };

/** Valore in mo di ciascuna moneta. 50 monete = 1 lb. */
export const COIN_GP = { cp: 0.01, sp: 0.1, ep: 0.5, gp: 1, pp: 10 };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const num = (v, d = 0) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : d);
/** Chiave base di una classe/sottoclasse: 'wizard-2024' → 'wizard'. */
export function baseKey(id) { return String(id || '').replace(/-2024$/, ''); }
function abilityScore(character, ab) {
  const a = character?.abilities?.[ab];
  return num(typeof a === 'object' && a !== null ? a.score : a, 10);
}

// ---------------------------------------------------------------------------
// Calcoli base
// ---------------------------------------------------------------------------

/** Modificatore di caratteristica: floor((punteggio - 10) / 2). */
export function abilityMod(score) { return Math.floor((num(score, 10) - 10) / 2); }

/** Bonus di competenza per livello del personaggio (1–20; fuori intervallo viene limitato). */
export function profBonusForLevel(level) {
  const l = Math.min(20, Math.max(1, Math.floor(num(level, 1))));
  return Math.ceil(l / 4) + 1;
}

/** Somma dei livelli di tutte le classi (0 se nessuna classe). */
export function totalLevel(character) {
  return (character?.classes || []).reduce((s, c) => s + Math.max(0, Math.floor(num(c?.level, 0))), 0);
}

/** Bonus di competenza del personaggio (basato sul livello totale, minimo livello 1). */
export function profBonus(character) { return profBonusForLevel(Math.max(1, totalLevel(character))); }

/** Livello raggiunto con questi PE (1–20). */
export function levelForXp(xp) {
  const x = num(xp, 0);
  let lvl = 1;
  for (let l = 1; l <= 20; l++) if (x >= XP_TABLE[l]) lvl = l;
  return lvl;
}

/** PE necessari per il livello successivo a `level` (null al 20°). */
export function xpForNextLevel(level) {
  const l = Math.max(1, Math.floor(num(level, 1)));
  return l >= 20 ? null : XP_TABLE[l + 1];
}

/** Modificatore di una caratteristica del personaggio. */
export function abilityModOf(character, ability) { return abilityMod(abilityScore(character, ability)); }

/**
 * Bonus di abilità: mod caratteristica + floor(prof × bonus competenza) + bonus.
 * prof: 0 nessuna, 0.5 mezza (arrotondata per difetto), 1 competenza, 2 maestria.
 * `ability` opzionale per abilità homebrew o regole alternative.
 */
export function skillBonus(character, skillId, ability) {
  const ab = ability || SKILLS[skillId]?.ability || character?.skills?.[skillId]?.ability || 'int';
  const s = character?.skills?.[skillId] || {};
  const pb = profBonus(character);
  return abilityModOf(character, ab) + Math.floor(num(s.prof, 0) * pb) + num(s.bonus, 0);
}

/** Bonus al tiro salvezza: mod + competenza (se saveProf) + abilities[ab].saveBonus (se presente). */
export function saveBonus(character, ability) {
  const a = character?.abilities?.[ability] || {};
  return abilityModOf(character, ability) + (a.saveProf ? profBonus(character) : 0) + num(a.saveBonus, 0);
}

/** Punteggio passivo: 10 + bonus di abilità (+ eventuale `passiveBonus` sull'abilità). */
export function passive(character, skillId) {
  return 10 + skillBonus(character, skillId) + num(character?.skills?.[skillId]?.passiveBonus, 0);
}

/** Penalità ai tiri d20 per sfinimento (solo regole 2024: −2 × livello). 2014: 0 (gli effetti sono svantaggi). */
export function exhaustionD20Penalty(character) {
  if (character?.ruleset !== '2024') return 0;
  return -2 * Math.max(0, Math.min(6, num(character?.exhaustion, 0)));
}

/**
 * Punti ferita massimi. Se hp.maxOverride è un numero, lo restituisce.
 * Primo livello della PRIMA classe in `classes`: dado vita pieno; ogni altro livello: media arrotondata per eccesso
 * (d/2 + 1). Ogni livello aggiunge il mod COS (minimo 1 PF per livello).
 * Campi opzionali supportati: hp.bonusPerLevel (es. Robustezza nanica), hp.bonusMax (bonus fisso).
 */
export function maxHp(character) {
  const ov = character?.hp?.maxOverride;
  if (ov !== null && ov !== undefined && ov !== '' && Number.isFinite(Number(ov))) return Number(ov);
  const classes = character?.classes || [];
  const con = abilityModOf(character, 'con');
  const perLvlBonus = num(character?.hp?.bonusPerLevel, 0);
  let hp = 0, first = true;
  for (const c of classes) {
    const die = num(c?.hitDie, 8) || 8;
    const lv = Math.max(0, Math.floor(num(c?.level, 0)));
    for (let i = 0; i < lv; i++) {
      const base = first ? die : die / 2 + 1;
      first = false;
      hp += Math.max(1, base + con + perLvlBonus);
    }
  }
  return hp + num(character?.hp?.bonusMax, 0);
}

/** Dadi vita totali per taglia: { d8: 3, d10: 2 }. */
export function hitDiceTotal(character) {
  const out = {};
  for (const c of character?.classes || []) {
    const k = 'd' + (num(c?.hitDie, 8) || 8);
    out[k] = (out[k] || 0) + Math.max(0, Math.floor(num(c?.level, 0)));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Classe Armatura
// ---------------------------------------------------------------------------

function indexItems(equipmentItems) {
  if (!equipmentItems) return new Map();
  if (equipmentItems instanceof Map) return equipmentItems;
  if (Array.isArray(equipmentItems)) return new Map(equipmentItems.map((e) => [e.id, e]));
  return new Map(Object.entries(equipmentItems));
}

/**
 * Dettaglio CA: { ac, base, dex, shield, bonus, armor: item|null, shieldItem: item|null, source, override }.
 * equipmentItems: array (o Map / oggetto id→item) del dataset `equipment` (formato SCHEMA.md: armorCategory, ac {base, dexBonus, maxBonus}).
 * Considera gli oggetti dell'inventario con equipped=true il cui itemId è un'armatura/scudo.
 * Senza armatura: 10 + DES, oppure Difesa senza armatura (Barbaro: +COS; Monaco senza scudo: +SAG) o
 * Resilienza draconica (Stregone draconico: 13 + DES), scegliendo il valore migliore.
 */
export function armorClassDetail(character, equipmentItems) {
  const idx = indexItems(equipmentItems);
  const dexMod = abilityModOf(character, 'dex');
  const bonus = num(character?.acBonus, 0);
  let armor = null, shieldItem = null;
  for (const inv of character?.inventory || []) {
    if (!inv?.equipped) continue;
    const it = inv.itemId ? idx.get(inv.itemId) : null;
    if (!it || it.category !== 'armor') continue;
    if (it.armorCategory === 'shield') { if (!shieldItem) shieldItem = it; }
    else if (!armor || num(it.ac?.base) > num(armor.ac?.base)) armor = it;
  }
  const shield = shieldItem ? num(shieldItem.ac?.base, 2) : 0;
  const ov = character?.acOverride;
  const hasOverride = ov !== null && ov !== undefined && ov !== '' && Number.isFinite(Number(ov));

  let base, dex, source;
  if (armor) {
    base = num(armor.ac?.base, 10);
    if (armor.ac?.dexBonus === false) dex = 0;
    else {
      const max = armor.ac?.maxBonus;
      dex = max === null || max === undefined ? dexMod : Math.min(dexMod, num(max));
    }
    source = armor.id;
  } else {
    const keys = (character?.classes || []).map((c) => baseKey(c.classId));
    const subs = (character?.classes || []).map((c) => baseKey(c.subclassId));
    const options = [{ base: 10, dex: dexMod, source: 'unarmored' }];
    if (keys.includes('barbarian')) options.push({ base: 10 + abilityModOf(character, 'con'), dex: dexMod, source: 'unarmored-defense-barbarian' });
    if (keys.includes('monk') && !shieldItem) options.push({ base: 10 + abilityModOf(character, 'wis'), dex: dexMod, source: 'unarmored-defense-monk' });
    if (subs.includes('draconic') || subs.includes('draconic-sorcery')) options.push({ base: 13, dex: dexMod, source: 'draconic-resilience' });
    const best = options.reduce((a, b) => (b.base + b.dex > a.base + a.dex ? b : a));
    ({ base, dex, source } = best);
  }
  const computed = base + dex + shield + bonus;
  return {
    ac: hasOverride ? Number(ov) : computed, computed, base, dex, shield, bonus,
    armor, shieldItem, source, override: hasOverride,
  };
}

/** Classe Armatura (numero). acOverride, se presente, ha la precedenza. */
export function armorClass(character, equipmentItems) { return armorClassDetail(character, equipmentItems).ac; }

/** Iniziativa: mod DES + initiativeBonus. */
export function initiative(character) { return abilityModOf(character, 'dex') + num(character?.initiativeBonus, 0); }

// ---------------------------------------------------------------------------
// Incantesimi
// ---------------------------------------------------------------------------

/** Caratteristica da incantatore: spellcasting.ability, altrimenti quella della prima classe incantatrice. */
export function spellcastingAbility(character) {
  const a = character?.spellcasting?.ability;
  if (a) return a;
  for (const c of character?.classes || []) {
    const k = CLASS_SPELL_ABILITY[baseKey(c.subclassId)] || CLASS_SPELL_ABILITY[baseKey(c.classId)];
    if (k) return k;
  }
  return null;
}

/** CD dei tiri salvezza degli incantesimi: override, altrimenti 8 + competenza + mod. null se nessuna caratteristica. */
export function spellSaveDc(character) {
  const ov = character?.spellcasting?.saveDcOverride;
  if (ov !== null && ov !== undefined && ov !== '' && Number.isFinite(Number(ov))) return Number(ov);
  const ab = spellcastingAbility(character);
  if (!ab) return null;
  return 8 + profBonus(character) + abilityModOf(character, ab);
}

/** Bonus di attacco con incantesimi: override, altrimenti competenza + mod. null se nessuna caratteristica. */
export function spellAttackBonus(character) {
  const ov = character?.spellcasting?.attackOverride;
  if (ov !== null && ov !== undefined && ov !== '' && Number.isFinite(Number(ov))) return Number(ov);
  const ab = spellcastingAbility(character);
  if (!ab) return null;
  return profBonus(character) + abilityModOf(character, ab);
}

/**
 * Tipo d'incantatore di una voce di `character.classes`.
 * Ordine: entry.casterType → classesData (dataset `classes`, campo spellcasting.type) → tabelle SRD interne.
 */
export function casterTypeOf(entry, classesData) {
  if (!entry) return null;
  if (entry.casterType !== undefined) return entry.casterType;
  const sub = SUBCLASS_CASTER_TYPE[baseKey(entry.subclassId)];
  if (sub) return sub;
  if (classesData) {
    const list = Array.isArray(classesData) ? classesData : Object.values(classesData);
    const cd = list.find((c) => c.id === entry.classId);
    if (cd && cd.spellcasting !== undefined) return cd.spellcasting ? cd.spellcasting.type || null : null;
  }
  return CLASS_CASTER_TYPE[baseKey(entry.classId)] ?? null;
}

/**
 * Slot incantesimo del personaggio.
 * Ritorna { slots: {1..9}, pact: { level, max }, casterLevel }.
 * - Classe singola: tabella della classe (completo = livello; mezzo = ceil(liv/2), 2014 nessuno slot al 1°;
 *   terzo = ceil(liv/3) dal 3°).
 * - Multiclasse: livello d'incantatore = completi + mezzi (2014 per difetto, 2024 per eccesso) + terzi (per difetto),
 *   poi tabella dell'incantatore multiclasse.
 * - Magia del patto (Warlock) separata in `pact`.
 */
export function spellSlotsFor(character, classesData) {
  const ruleset = character?.ruleset === '2024' ? '2024' : '2014';
  const entries = (character?.classes || []).map((c) => ({ c, type: casterTypeOf(c, classesData), lv: Math.max(0, Math.floor(num(c.level, 0))) }));
  const casters = entries.filter((e) => e.type && e.type !== 'pact' && e.lv > 0);
  let casterLevel = 0;
  if (casters.length === 1) {
    const { type, lv } = casters[0];
    if (type === 'full') casterLevel = lv;
    else if (type === 'half') casterLevel = ruleset === '2014' && lv < 2 ? 0 : Math.ceil(lv / 2);
    else if (type === 'half-up') casterLevel = Math.ceil(lv / 2);
    else if (type === 'third') casterLevel = lv < 3 ? 0 : Math.ceil(lv / 3);
  } else if (casters.length > 1) {
    for (const { type, lv } of casters) {
      if (type === 'full') casterLevel += lv;
      else if (type === 'half') casterLevel += ruleset === '2024' ? Math.ceil(lv / 2) : Math.floor(lv / 2);
      else if (type === 'half-up') casterLevel += Math.ceil(lv / 2);
      else if (type === 'third') casterLevel += Math.floor(lv / 3);
    }
  }
  casterLevel = Math.min(20, casterLevel);
  const row = MULTICLASS_SLOTS[casterLevel];
  const slots = {};
  for (let i = 1; i <= 9; i++) slots[i] = row[i - 1];
  const wl = entries.filter((e) => e.type === 'pact').reduce((s, e) => s + e.lv, 0);
  const p = PACT_SLOTS[Math.min(20, wl)];
  return { slots, pact: { level: p.slotLevel, max: p.slots }, casterLevel };
}

// ---------------------------------------------------------------------------
// Trasporto, GS, unità
// ---------------------------------------------------------------------------

/**
 * Capacità di trasporto (lb). size: 'medium' default (o character.size).
 * { capacity: FOR×15, pushDragLift: FOR×30, encumbered: FOR×5, heavilyEncumbered: FOR×10 } × moltiplicatore di taglia.
 * (encumbered/heavilyEncumbered = regola variante dell'ingombro SRD 5.1.)
 */
export function carryingCapacity(character, size) {
  const str = abilityScore(character, 'str');
  const m = SIZE_CARRY_MULT[String(size || character?.size || 'medium').toLowerCase()] ?? 1;
  return { capacity: str * 15 * m, pushDragLift: str * 30 * m, encumbered: str * 5 * m, heavilyEncumbered: str * 10 * m };
}

/** Peso trasportato (lb): somma qty×weight dell'inventario + monete (50 monete = 1 lb, se includeCoins). */
export function inventoryWeight(character, { includeCoins = true } = {}) {
  let w = 0;
  for (const it of character?.inventory || []) w += num(it?.weight, 0) * num(it?.qty, 1);
  if (includeCoins) {
    const coins = Object.keys(COIN_GP).reduce((s, k) => s + num(character?.currency?.[k], 0), 0);
    w += coins / 50;
  }
  return Math.round(w * 100) / 100;
}

/** '1/4' | 0.25 | '0.25' → 0.25 */
export function parseCr(cr) {
  if (typeof cr === 'number') return cr;
  const s = String(cr ?? '').trim();
  if (s.includes('/')) { const [a, b] = s.split('/').map(Number); return b ? a / b : 0; }
  return num(s, 0);
}
/** 0.25 → '1/4' */
export function formatCr(cr) {
  const v = parseCr(cr);
  if (v === 0.125) return '1/8';
  if (v === 0.25) return '1/4';
  if (v === 0.5) return '1/2';
  return String(v);
}
/** PE di una creatura per grado di sfida. */
export function crToXp(cr) { return CR_XP[formatCr(cr)] ?? 0; }
/** Bonus di competenza per grado di sfida (GS 0–4: +2, 5–8: +3, … 29–30: +9). */
export function crToProf(cr) {
  const v = parseCr(cr);
  if (v < 5) return 2;
  return Math.ceil(v / 4) + 1;
}

/** Piedi → metri secondo la convenzione di gioco (5 ft = 1,5 m). */
export function feetToMeters(ft) { return Math.round(num(ft, 0) * 0.3 * 100) / 100; }
/** Libbre → kg secondo la convenzione di gioco (1 lb ≈ 0,5 kg). */
export function lbToKg(lb) { return Math.round(num(lb, 0) * 0.5 * 1000) / 1000; }

function fmtNum(n, maxDecimals) {
  return new Intl.NumberFormat('it-IT', { maximumFractionDigits: maxDecimals, useGrouping: true }).format(n);
}
function isImperial(units) { return ['ft', 'feet', 'imperial', 'lb', 'lbs'].includes(String(units || 'm').toLowerCase()); }

/** Distanza leggibile: formatDistance(30) → '9 m'; formatDistance(30, 'ft') → '30 ft'; 1 miglio = 1,5 km. */
export function formatDistance(ft, units = 'm') {
  if (ft === null || ft === undefined || ft === '') return '';
  const f = num(ft, 0);
  if (isImperial(units)) return `${fmtNum(f, 2)} ft`;
  const m = feetToMeters(f);
  return m >= 1000 ? `${fmtNum(m / 1000, 2)} km` : `${fmtNum(m, 1)} m`;
}

/** Peso leggibile: formatWeight(3) → '1,5 kg'; formatWeight(3, 'ft'|'lb') → '3 lb'. */
export function formatWeight(lb, units = 'm') {
  if (lb === null || lb === undefined || lb === '') return '';
  const l = num(lb, 0);
  if (isImperial(units)) return `${fmtNum(l, 2)} lb`;
  return `${fmtNum(lbToKg(l), 2)} kg`;
}

/**
 * Converte le distanze dentro un testo SRD inglese ("150 feet", "20-foot-radius", "5 ft.", "1 mile") in metri.
 * Con units 'ft' restituisce il testo invariato.
 */
export function convertDistancesInText(text, units = 'm') {
  if (!text || isImperial(units)) return text;
  return String(text)
    .replace(/(\d[\d,]*)(\s?|-)(feet|foot|ft\.?)(?![a-z])/gi, (_, n, sep, unit) => {
      const m = fmtNum(feetToMeters(Number(n.replace(/,/g, ''))), 1);
      return sep === '-' ? `${m}-meter` : `${m} m`; // il testo SRD è inglese: "20-foot-radius" → "6-meter-radius"
    })
    .replace(/(\d[\d,]*)(\s?|-)(miles?|mi\.)(?![a-z])/gi, (_, n) => `${fmtNum(Number(n.replace(/,/g, '')) * 1.5, 2)} km`);
}
