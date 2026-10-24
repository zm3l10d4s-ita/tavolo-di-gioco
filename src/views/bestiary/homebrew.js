// Mostri homebrew (collezione 'homebrew', kind 'monsters') e override ambienti (kind 'monsterMeta').
import * as store from '../../lib/store.js';
import { uid } from '../../lib/util.js';
import { crToValue, XP_BY_CR, profBonusForCr, SIZES, TYPES } from './filter.js';

const DMG_PREFIX = [
  ['acid', 'acid'], ['bludg', 'bludgeoning'], ['contund', 'bludgeoning'], ['cold', 'cold'], ['fredd', 'cold'], ['fire', 'fire'], ['fuoc', 'fire'],
  ['force', 'force'], ['forz', 'force'], ['light', 'lightning'], ['fulmin', 'lightning'], ['necro', 'necrotic'], ['pierc', 'piercing'],
  ['perfor', 'piercing'], ['poison', 'poison'], ['velen', 'poison'], ['psych', 'psychic'], ['psichi', 'psychic'], ['radian', 'radiant'],
  ['radios', 'radiant'], ['slash', 'slashing'], ['taglien', 'slashing'], ['thund', 'thunder'], ['tuon', 'thunder'],
];
const ABIL_WORD = [['str', /strength|forza/i], ['dex', /dexterity|destrezza/i], ['con', /constitution|costituzione/i],
  ['int', /intelligence|intelligenza/i], ['wis', /wisdom|saggezza/i], ['cha', /charisma|carisma/i]];

/** Ricava attackBonus / damage / dc dal testo (inglese SRD o italiano), per il combat tracker. */
export function deriveEntry(e) {
  const out = { name: e.name || '', desc: e.desc || '' };
  if (e.usage) out.usage = e.usage;
  if (e.spellcasting) out.spellcasting = e.spellcasting;
  const d = out.desc;
  const atk = d.match(/([+-]\d+)\s*(?:to hit|al colpire|per colpire)/i) || d.match(/(?:Attack Roll|Tiro per colpire|Tiro di attacco):\s*([+-]\d+)/i);
  if (atk) out.attackBonus = Number(atk[1]);
  const dmg = [];
  const re = /\((\d+d\d+(?:\s*[+-]\s*\d+)?)\)\s*(?:danni\s+(?:da\s+)?)?([a-zà-ù]+)/gi;
  let m;
  while ((m = re.exec(d))) {
    const w = m[2].toLowerCase();
    const t = DMG_PREFIX.find(([p]) => w.startsWith(p));
    if (t) dmg.push({ dice: m[1].replace(/\s+/g, ''), type: t[1] });
  }
  if (dmg.length) out.damage = dmg;
  const dc = d.match(/\b(?:DC|CD)\s*(\d+)/);
  if (dc) {
    const around = d.slice(Math.max(0, dc.index - 40), dc.index + 60);
    const ab = ABIL_WORD.find(([, r]) => r.test(around));
    out.dc = { ability: ab ? ab[0] : null, value: Number(dc[1]), success: /half|metà/i.test(d) ? 'half' : 'none' };
  }
  if (/^multiattack|^multiattacco/i.test(out.name)) out.multiattack = true;
  return out;
}

const ENTRY_KEYS = ['traits', 'actions', 'bonusActions', 'reactions', 'legendaryActions'];

/** Ricalcola i campi derivati (GS numerico, PE, bonus competenza, voci strutturate). */
export function normalizeMonster(data) {
  const m = { ...data };
  m.crValue = crToValue(m.cr);
  m.xp = XP_BY_CR[m.crValue] ?? m.xp ?? 0;
  m.profBonus = profBonusForCr(m.crValue);
  for (const k of ENTRY_KEYS) m[k] = (m[k] || []).map(deriveEntry);
  m.source = 'Homebrew';
  m.size_it = SIZES.find((x) => x.id === m.size)?.label || m.size;
  m.type_it = TYPES.find((x) => x.id === m.type)?.label || m.type;
  m.environmentsEstimated = false;
  if (!m.legendaryActions.length) m.legendaryDesc = '';
  return m;
}

export function blankMonster() {
  return {
    name: 'Nuovo mostro', size: 'Medium', size_it: 'Media', type: 'humanoid', type_it: 'Umanoide', subtype: null, swarm: null,
    alignment: 'neutral', alignment_it: 'neutrale', ac: 12, acNote: '', acAlt: [], hp: 11, hpFormula: '2d8 + 2', hitDice: '2d8',
    speed: { walk: 30, fly: 0, swim: 0, climb: 0, burrow: 0, hover: false },
    abilities: { str: 10, dex: 12, con: 12, int: 10, wis: 10, cha: 10 }, saves: {}, skills: {},
    damageVulnerabilities: [], damageResistances: [], damageImmunities: [], conditionImmunities: [],
    senses: { passivePerception: 10 }, languages: 'Comune', cr: '1/2',
    traits: [], actions: [{ name: 'Spada corta', desc: 'Attacco con arma da mischia: +3 al colpire, portata 1,5 m, un bersaglio. Colpito: 4 (1d6 + 1) danni perforanti.' }],
    bonusActions: [], reactions: [], legendaryActions: [], legendaryDesc: '', legendaryUses: null,
    environments: [], description: '',
  };
}

function strip(m) {
  const o = {};
  for (const [k, v] of Object.entries(m)) if (!k.startsWith('_')) o[k] = v;
  return structuredClone(o);
}

/** Crea un nuovo mostro homebrew (da zero o da una base) e ritorna il suo id. */
export function createHomebrew(base = null) {
  const id = 'hb-' + uid();
  const src = base ? strip(base) : blankMonster();
  const data = normalizeMonster({
    ...src, id, name: base ? `${src.name} (homebrew)` : src.name,
    basedOn: base ? base.id : null, srdIndex: undefined, ruleset: base?.ruleset || null,
  });
  delete data.srdIndex;
  store.put('homebrew', { id, kind: 'monsters', data });
  return id;
}

export function getHomebrew(hbId) { return store.get('homebrew', hbId); }

/** Applica una patch al mostro homebrew (oggetto o funzione data=>data) e salva subito. */
export function patchHomebrew(hbId, patch) {
  return store.update('homebrew', hbId, (h) => {
    const cur = h.data || {};
    const next = typeof patch === 'function' ? patch(structuredClone(cur)) : { ...cur, ...patch };
    return { ...h, data: normalizeMonster({ ...next, id: cur.id || hbId }) };
  });
}

export function deleteHomebrew(hbId) {
  store.remove('homebrew', hbId);
}

// ------------------------------------------------------------- override ambienti
const metaId = (monsterId) => 'mm-' + monsterId;
export function listMeta() { return store.list('homebrew', (h) => h.kind === 'monsterMeta'); }
export function setEnvironments(monster, environments) {
  if (monster._homebrew && monster._hbId) {
    patchHomebrew(monster._hbId, { environments });
    return;
  }
  const id = metaId(monster.id);
  const cur = store.get('homebrew', id);
  store.put('homebrew', { ...(cur || {}), id, kind: 'monsterMeta', data: { id: monster.id, environments } });
}
export function clearEnvironmentOverride(monster) {
  const id = metaId(monster.id);
  if (store.get('homebrew', id)) store.remove('homebrew', id);
}
export function hasEnvOverride(monster) { return !!store.get('homebrew', metaId(monster.id)); }
