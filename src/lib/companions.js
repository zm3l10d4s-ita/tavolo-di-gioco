// Compagni, evocazioni e trasformazioni (Forma selvatica, Metamorfosi…). Modulo PURO: niente DOM, niente store.
// I dati delle creature vengono dal bestiario (monsters SRD 5.1/5.2 + homebrew); qui solo regole e filtri.
import * as R from './rules.js';
import { norm, uid, nowIso } from './util.js';

export function crValue(m) {
  if (m?.crValue != null && Number.isFinite(Number(m.crValue))) return Number(m.crValue);
  const t = String(m?.cr ?? '0');
  if (t.includes('/')) { const [a, b] = t.split('/').map(Number); return b ? a / b : 0; }
  return Number(t) || 0;
}
export const crLabel = (v) => (v === 0.125 ? '1/8' : v === 0.25 ? '1/4' : v === 0.5 ? '1/2' : String(v));
const baseId = (id) => String(id || '').replace(/-2024$/, '');
const speed = (m, k) => Number(m?.speed?.[k]) || 0;
/** Il mostro è della versione di regole richiesta? (homebrew e senza versione: sempre) */
const inRules = (m, rules) => !m?.ruleset || m._homebrew || (rules === '2024' ? m.ruleset !== '2014' : m.ruleset !== '2024');
const sizeRank = { Tiny: 0, Small: 1, Medium: 2, Large: 3, Huge: 4, Gargantuan: 5 };

// ------------------------------------------------------------------ Forma selvatica
export function druidInfo(c) {
  const e = (c?.classes || []).find((x) => R.baseKey(x.classId) === 'druid');
  if (!e) return null;
  return { entry: e, level: Number(e.level) || 0, rules: R.classRuleset(c, e.classId), moon: /moon|luna/i.test(`${e.subclassId || ''} ${e.subclassName || ''}`) };
}

/**
 * Limiti della Forma selvatica: { druidLevel, rules, moon, maxCr, fly, swim, known (2024: forme conosciute), hours, tempHp }.
 * 2014: dalla tabella del druido (GS 1/4 → 1/2 → 1; nuoto dal 4°, volo dall'8°). Circolo della Luna: GS 1, poi livello/3 dal 6°.
 * 2024: forme conosciute 4/6/8, GS 1/4 → 1/2 → 1, volo dall'8°; PF temporanei = livello da druido (×3 per la Luna).
 */
export function wildShapeLimits(c, levels = []) {
  const d = druidInfo(c);
  if (!d || d.level < 2) return null;
  let maxCr, fly, swim, known = null;
  if (d.rules === '2024') {
    known = d.level >= 8 ? 8 : d.level >= 4 ? 6 : 4;
    maxCr = d.level >= 8 ? 1 : d.level >= 4 ? 0.5 : 0.25;
    fly = d.level >= 8; swim = true;
  } else {
    const cs = (levels || []).find((l) => l.id === `druid-${d.level}`)?.classSpecific || {};
    maxCr = cs.wildShapeMaxCr ?? (d.level >= 8 ? 1 : d.level >= 4 ? 0.5 : 0.25);
    fly = !!(cs.wildShapeFly ?? d.level >= 8);
    swim = !!(cs.wildShapeSwim ?? d.level >= 4);
  }
  if (d.moon) maxCr = Math.max(maxCr, d.rules === '2024' ? Math.max(1, Math.floor(d.level / 3)) : (d.level >= 6 ? Math.floor(d.level / 3) : 1));
  return {
    druidLevel: d.level, rules: d.rules, moon: d.moon, maxCr, fly, swim, known,
    hours: Math.max(1, Math.floor(d.level / 2)), tempHp: d.rules === '2024' ? (d.moon ? 3 * d.level : d.level) : 0,
  };
}

/** Bestie in cui ci si può trasformare con la Forma selvatica. */
export function eligibleWildShapes(monsters, lim) {
  if (!lim) return [];
  return (monsters || []).filter((m) => m.type === 'beast' && inRules(m, lim.rules) && crValue(m) <= lim.maxCr
    && (lim.fly || speed(m, 'fly') === 0) && (lim.swim || speed(m, 'swim') === 0))
    .sort((a, b) => crValue(a) - crValue(b) || a.name.localeCompare(b.name));
}

// ------------------------------------------------------------------ fonti di compagni e trasformazioni
const FAMILIAR_2014 = ['bat', 'cat', 'crab', 'frog', 'hawk', 'lizard', 'octopus', 'owl', 'poisonous-snake', 'quipper', 'rat', 'raven', 'sea-horse', 'spider', 'weasel'];
const CHAIN_2014 = ['imp', 'pseudodragon', 'quasit', 'sprite'];
const CHAIN_2024 = ['imp', 'pseudodragon', 'quasit', 'skeleton', 'slaad-tadpole', 'sphinx-of-wonder', 'sprite', 'venomous-snake'];
const STEED_2014 = ['warhorse', 'pony', 'camel', 'elk', 'mastiff'];
const GREATER_STEED = ['griffon', 'pegasus', 'peryton', 'dire-wolf', 'rhinoceros', 'saber-toothed-tiger'];
const UNDEAD_ANIMATE = ['skeleton', 'zombie'];
const UNDEAD_CREATE = ['ghoul', 'ghast', 'wight', 'mummy'];

/** Il personaggio conosce/prepara un incantesimo? (per id SRD o nome inglese/italiano) */
export function hasSpell(c, ids = [], names = []) {
  const list = c?.spellcasting?.spells || [];
  const ni = names.map(norm);
  return list.some((s) => ids.includes(baseId(s.spellId)) || ni.some((n) => norm(s.name).includes(n)));
}
export function spellVersion(c, ids = []) {
  const s = (c?.spellcasting?.spells || []).find((x) => ids.includes(baseId(x.spellId)));
  return s && /-2024$/.test(String(s.spellId)) ? '2024' : s ? '2014' : null;
}
const hasFeature = (c, re) => (c?.features || []).some((f) => re.test(f.name || '')) || (c?.feats || []).some((f) => re.test(f.name || ''))
  || (c?.classes || []).some((e) => re.test(`${e.subclassName || ''} ${e.subclassId || ''}`));

/**
 * Cosa permette al personaggio di avere compagni o di trasformarsi. Ritorna
 * [{ key, label, kind: 'companion' | 'summon' | 'form', ruleset, hint, filter(monster) → bool, maxCr? }]
 */
export function companionSources(c) {
  const out = [];
  const lvl = R.totalLevel(c);
  const rsDefault = c?.ruleset === '2014' ? '2014' : '2024';
  const add = (o) => out.push({ ruleset: rsDefault, hint: '', ...o });
  const byIds = (ids) => (m) => ids.includes(baseId(m.id));
  const chain = hasFeature(c, /pact of the chain|patto della catena/i) || (c?.features || []).some((f) => /pact boon/i.test(f.name) && /chain|catena/i.test(f.text || ''));

  const famV = spellVersion(c, ['find-familiar']) || (hasFeature(c, /wild companion|compagno selvatico/i) ? '2024' : null) || (chain ? rsDefault : null);
  if (hasSpell(c, ['find-familiar'], ['find familiar', 'trova famiglio']) || hasFeature(c, /wild companion|compagno selvatico/i) || chain) {
    const v = famV || rsDefault;
    add({ key: 'familiar', label: 'Famiglio', kind: 'companion', ruleset: v,
      hint: v === '2024' ? 'Una bestia di GS 0 (come celestiale, folletto o immondo).' : 'Uno spirito con la forma di una di queste bestie.',
      filter: v === '2024' ? (m) => m.type === 'beast' && crValue(m) === 0 : byIds(FAMILIAR_2014) });
  }
  if (chain) add({ key: 'chain', label: 'Famiglio del patto (Catena)', kind: 'companion', hint: 'Forme speciali del Patto della catena.', filter: byIds(rsDefault === '2024' ? CHAIN_2024 : CHAIN_2014) });
  if (hasSpell(c, ['find-steed'], ['find steed', 'trova destriero'])) {
    const v = spellVersion(c, ['find-steed']) || rsDefault;
    add({ key: 'steed', label: 'Destriero', kind: 'companion', ruleset: v,
      hint: v === '2024' ? 'Il «Destriero ultraterreno» 2024 non è nell\'SRD: incollalo nel bestiario o crea un compagno personalizzato. Qui sotto le cavalcature SRD.' : 'Uno spirito con la forma di una di queste cavalcature.',
      filter: byIds(STEED_2014) });
  }
  if (hasSpell(c, ['find-greater-steed'], ['find greater steed', 'trova destriero superiore'])) add({ key: 'greater-steed', label: 'Destriero superiore', kind: 'companion', filter: byIds(GREATER_STEED) });
  if (hasFeature(c, /beast master|signore delle bestie|ranger's companion|primal companion|compagno primordiale/i)) {
    const v = (c?.classes || []).find((e) => R.baseKey(e.classId) === 'ranger');
    const rs = v ? R.classRuleset(c, v.classId) : rsDefault;
    add({ key: 'beast-companion', label: 'Compagno animale (Signore delle bestie)', kind: 'companion', ruleset: rs,
      hint: rs === '2024' ? 'Le «bestie primordiali» 2024 non sono nell\'SRD: crea un compagno personalizzato o incollale nel bestiario. Qui sotto bestie Medie o più piccole di GS 1/4.' : 'Una bestia Media o più piccola di GS 1/4 o inferiore.',
      filter: (m) => m.type === 'beast' && crValue(m) <= 0.25 && (sizeRank[m.size] ?? 9) <= 2 });
  }
  if (hasFeature(c, /steel defender|defensore d'acciaio|homunculus|homunculus servant/i)) add({ key: 'artificer', label: 'Creazione da artefice', kind: 'companion', hint: 'Il Difensore d\'acciaio non è nell\'SRD: crealo come compagno personalizzato.', filter: byIds(['homunculus']) });
  if (hasSpell(c, ['animate-dead'], ['animate dead', 'animare morti'])) add({ key: 'animate-dead', label: 'Non morti animati', kind: 'summon', filter: byIds(UNDEAD_ANIMATE) });
  if (hasSpell(c, ['create-undead'], ['create undead', 'creare non morti'])) add({ key: 'create-undead', label: 'Non morti creati', kind: 'summon', filter: byIds(UNDEAD_CREATE) });
  if (hasSpell(c, ['conjure-animals'], ['conjure animals', 'evocare animali']) && spellVersion(c, ['conjure-animals']) !== '2024') add({ key: 'conjure-animals', label: 'Animali evocati', kind: 'summon', hint: 'Bestie fino a GS 2 (il numero dipende dal GS scelto).', filter: (m) => m.type === 'beast' && crValue(m) <= 2 });
  if (hasSpell(c, ['conjure-woodland-beings'], ['conjure woodland beings'])) add({ key: 'woodland', label: 'Creature dei boschi evocate', kind: 'summon', filter: (m) => m.type === 'fey' && crValue(m) <= 2 });
  if (hasSpell(c, ['conjure-elemental', 'conjure-minor-elementals'], ['conjure elemental', 'conjure minor elementals'])) add({ key: 'elementals', label: 'Elementali evocati', kind: 'summon', filter: (m) => m.type === 'elemental' && crValue(m) <= 5 });
  if (hasSpell(c, ['summon-beast', 'summon-fey', 'summon-undead', 'summon-aberration', 'summon-construct', 'summon-elemental', 'summon-celestial', 'summon-fiend', 'summon-dragon'], ['summon ']))
    add({ key: 'summon-spirit', label: 'Spirito evocato (Evoca…)', kind: 'summon', hint: 'Gli spiriti di «Evoca bestia/folletto/…» non sono nell\'SRD: crea un compagno personalizzato o incollali nel bestiario.', filter: () => false });

  // trasformazioni da incantesimi (su se stessi)
  if (hasSpell(c, ['polymorph'], ['polymorph', 'metamorfosi'])) add({ key: 'polymorph', label: 'Metamorfosi', kind: 'form', ruleset: spellVersion(c, ['polymorph']) || rsDefault, maxCr: lvl, hint: `Una bestia di GS non superiore al tuo livello (${lvl}).`, filter: (m) => m.type === 'beast' && crValue(m) <= lvl });
  if (hasSpell(c, ['true-polymorph'], ['true polymorph', 'metamorfosi pura'])) add({ key: 'true-polymorph', label: 'Metamorfosi pura', kind: 'form', maxCr: lvl, hint: `Qualsiasi creatura di GS non superiore al tuo livello (${lvl}).`, filter: (m) => crValue(m) <= lvl });
  if (hasSpell(c, ['shapechange'], ['shapechange', 'cambiare forma'])) add({ key: 'shapechange', label: 'Cambiare forma', kind: 'form', maxCr: lvl, hint: `Una creatura vista almeno una volta, GS ≤ ${lvl}, non costrutto né non morto.`, filter: (m) => crValue(m) <= lvl && !['construct', 'undead'].includes(m.type) });
  if (hasSpell(c, ['animal-shapes'], ['animal shapes', 'forme animali'])) add({ key: 'animal-shapes', label: 'Forme animali', kind: 'form', hint: 'Bestie Grandi o più piccole di GS 4 o inferiore.', filter: (m) => m.type === 'beast' && crValue(m) <= 4 && (sizeRank[m.size] ?? 9) <= 3 });
  return out;
}

// ------------------------------------------------------------------ compagni
export function makeCompanion(monster, { kind = 'companion', source = '', name = '', temporary = false, custom = null } = {}) {
  const hp = Number(custom?.hp ?? monster?.hp) || 1;
  return {
    id: uid(), kind, source, temporary, monsterId: monster?.id || null, name: name || monster?.name || custom?.name || 'Compagno',
    hp: { current: hp, max: hp, temp: 0 }, notes: '', createdAt: nowIso(),
    ...(custom ? { custom: { ac: Number(custom.ac) || 10, speed: custom.speed || '', attacks: custom.attacks || '', text: custom.text || '' } } : {}),
  };
}
/** Danno (negativo) o cura (positivo) a un compagno: prima i PF temporanei. */
export function companionHp(comp, delta) {
  const hp = { current: Number(comp.hp?.current) || 0, max: Number(comp.hp?.max) || 1, temp: Number(comp.hp?.temp) || 0 };
  let d = Math.trunc(Number(delta) || 0);
  if (d < 0) { const fromTemp = Math.min(hp.temp, -d); hp.temp -= fromTemp; d += fromTemp; hp.current = Math.max(0, hp.current + d); }
  else hp.current = Math.min(hp.max, hp.current + d);
  return { ...comp, hp };
}

// ------------------------------------------------------------------ forma attiva
const isWildShapeRes = (r) => r.autoKey === 'wild-shape' || /wild shape|forma selvatica/i.test(r.name || '');

/**
 * Trasforma il personaggio. kind: 'wildshape' | 'polymorph' | 'true-polymorph' | 'shapechange' | 'animal-shapes' | 'other'.
 * - Forma selvatica 2014 e Metamorfosi 2014: la forma ha i suoi PF (quelli della creatura).
 * - Forma selvatica 2024: tieni i tuoi PF e ottieni PF temporanei (livello da druido, ×3 Luna). CA della Luna: 13 + SAG se migliore.
 * - Metamorfosi 2024: PF temporanei pari ai PF della forma.
 * Consuma un uso di Forma selvatica se c'è la risorsa. Ritorna { character, warning }.
 */
export function startForm(character, monster, { kind = 'other', source = '', rules = '2014', lim = null } = {}) {
  const c = { ...character, hp: { ...character.hp }, resources: [...(character.resources || [])] };
  let warning = '';
  const mhp = Number(monster.hp) || 1;
  const form = { monsterId: monster.id, name: monster.name, kind, source, rules, startedAt: nowIso(), ac: Number(monster.ac) || 10, hp: null };
  if (kind === 'wildshape') {
    const i = c.resources.findIndex(isWildShapeRes);
    if (i >= 0) {
      const r = c.resources[i];
      if ((Number(r.used) || 0) >= (Number(r.max) || 0)) warning = 'Hai finito gli usi di Forma selvatica.';
      else c.resources[i] = { ...r, used: (Number(r.used) || 0) + 1 };
    }
    if (rules === '2024') {
      c.hp.temp = Math.max(Number(c.hp.temp) || 0, lim?.tempHp || 0);
      if (lim?.moon) form.ac = Math.max(form.ac, 13 + R.abilityModOf(c, 'wis'));
    } else form.hp = { current: mhp, max: mhp };
  } else if (rules === '2024' && kind === 'polymorph') {
    c.hp.temp = Math.max(Number(c.hp.temp) || 0, mhp);
  } else form.hp = { current: mhp, max: mhp };
  if (lim?.hours && kind === 'wildshape') form.hours = lim.hours;
  c.activeForm = form;
  return { character: c, warning };
}

/** Torna alla forma normale. */
export function endForm(character) {
  const c = { ...character };
  delete c.activeForm;
  c.activeForm = null;
  return c;
}

/**
 * Danno/cura alla forma attiva (quando ha PF propri). Se i PF della forma scendono a 0 si torna normali
 * e il danno in eccesso passa al personaggio. Ritorna { character, reverted, excess, form }.
 */
export function formHp(character, delta, applyHpToCharacter) {
  const f = character.activeForm;
  if (!f?.hp) return { character, reverted: false, excess: 0 };
  let cur = Number(f.hp.current) || 0;
  const d = Math.trunc(Number(delta) || 0);
  if (d >= 0) return { character: { ...character, activeForm: { ...f, hp: { ...f.hp, current: Math.min(f.hp.max, cur + d) } } }, reverted: false, excess: 0 };
  cur += d;
  if (cur > 0) return { character: { ...character, activeForm: { ...f, hp: { ...f.hp, current: cur } } }, reverted: false, excess: 0 };
  const excess = -cur;
  let c = endForm(character);
  if (excess > 0 && applyHpToCharacter) c = applyHpToCharacter(c, -excess);
  return { character: c, reverted: true, excess };
}
