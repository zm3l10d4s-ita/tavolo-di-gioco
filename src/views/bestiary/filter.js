// Logica pura di ricerca/filtri/ordinamento del bestiario (testabile con node).
import { norm } from '../../lib/util.js';

export const ENVIRONMENTS = [
  { id: 'arctic', label: 'Artico' }, { id: 'coastal', label: 'Costa' }, { id: 'desert', label: 'Deserto' },
  { id: 'forest', label: 'Foresta' }, { id: 'grassland', label: 'Prateria' }, { id: 'hill', label: 'Collina' },
  { id: 'mountain', label: 'Montagna' }, { id: 'swamp', label: 'Palude' }, { id: 'underdark', label: 'Underdark' },
  { id: 'underwater', label: 'Sottomarino' }, { id: 'urban', label: 'Urbano' },
];
export const ENV_LABEL = Object.fromEntries(ENVIRONMENTS.map((e) => [e.id, e.label]));

export const SIZES = [
  { id: 'Tiny', label: 'Minuscola' }, { id: 'Small', label: 'Piccola' }, { id: 'Medium', label: 'Media' },
  { id: 'Large', label: 'Grande' }, { id: 'Huge', label: 'Enorme' }, { id: 'Gargantuan', label: 'Mastodontica' },
];
export const TYPES = [
  { id: 'aberration', label: 'Aberrazione' }, { id: 'beast', label: 'Bestia' }, { id: 'celestial', label: 'Celestiale' },
  { id: 'construct', label: 'Costrutto' }, { id: 'dragon', label: 'Drago' }, { id: 'elemental', label: 'Elementale' },
  { id: 'fey', label: 'Folletto' }, { id: 'fiend', label: 'Immondo' }, { id: 'giant', label: 'Gigante' },
  { id: 'humanoid', label: 'Umanoide' }, { id: 'monstrosity', label: 'Mostruosità' }, { id: 'ooze', label: 'Melma' },
  { id: 'plant', label: 'Vegetale' }, { id: 'undead', label: 'Non morto' },
];
export const SOURCES = [
  { id: '', label: 'Tutte le fonti' }, { id: 'SRD 5.1', label: 'SRD 5.1 (2014)' },
  { id: 'SRD 5.2', label: 'SRD 5.2 (2024)' }, { id: 'Homebrew', label: 'Homebrew' },
];
export const CR_VALUES = [0, 0.125, 0.25, 0.5, ...Array.from({ length: 30 }, (_, i) => i + 1)];
export const crLabel = (v) => (v === 0.125 ? '1/8' : v === 0.25 ? '1/4' : v === 0.5 ? '1/2' : String(v));
export function crToValue(cr) {
  if (typeof cr === 'number') return cr;
  const s = String(cr ?? '').trim();
  if (s.includes('/')) { const [a, b] = s.split('/').map(Number); return b ? a / b : 0; }
  return Number(s) || 0;
}
/** PE per GS (tabella SRD) e bonus di competenza: usati per i mostri homebrew. */
export const XP_BY_CR = {
  0: 10, 0.125: 25, 0.25: 50, 0.5: 100, 1: 200, 2: 450, 3: 700, 4: 1100, 5: 1800, 6: 2300, 7: 2900, 8: 3900, 9: 5000, 10: 5900,
  11: 7200, 12: 8400, 13: 10000, 14: 11500, 15: 13000, 16: 15000, 17: 18000, 18: 20000, 19: 22000, 20: 25000,
  21: 33000, 22: 41000, 23: 50000, 24: 62000, 25: 75000, 26: 90000, 27: 105000, 28: 120000, 29: 135000, 30: 155000,
};
export const profBonusForCr = (v) => (v < 5 ? 2 : v < 9 ? 3 : v < 13 ? 4 : v < 17 ? 5 : v < 21 ? 6 : v < 25 ? 7 : v < 29 ? 8 : 9);

export const DEFAULT_FILTERS = { q: '', crMin: '', crMax: '', type: '', size: '', env: '', source: '', legendary: false, sort: 'name', dir: 'asc' };

/** Applica gli override degli ambienti (homebrew kind 'monsterMeta'). metas: [{ data: { id, environments } }] */
export function applyMeta(monsters, metas) {
  const map = new Map();
  for (const h of metas || []) if (h?.data?.id && Array.isArray(h.data.environments)) map.set(h.data.id, h.data.environments);
  if (!map.size) return monsters;
  return monsters.map((m) => (map.has(m.id) ? { ...m, environments: map.get(m.id), environmentsEstimated: false, _envOverride: true } : m));
}

const SK = new WeakMap();
const searchKey = (m) => {
  let k = SK.get(m);
  if (k == null) { k = norm([m.name, m.type, m.type_it, m.subtype].filter(Boolean).join(' ')); SK.set(m, k); }
  return k;
};

export function filterMonsters(monsters, f = DEFAULT_FILTERS) {
  const q = norm(f.q).trim();
  const words = q ? q.split(/\s+/) : [];
  const lo = f.crMin === '' || f.crMin == null ? -1 : Number(f.crMin);
  const hi = f.crMax === '' || f.crMax == null ? Infinity : Number(f.crMax);
  return monsters.filter((m) => {
    if (words.length) {
      const k = searchKey(m);
      if (!words.every((w) => k.includes(w))) return false;
    }
    const cr = m.crValue ?? crToValue(m.cr);
    if (cr < lo || cr > hi) return false;
    if (f.type && m.type !== f.type) return false;
    if (f.size && m.size !== f.size && !(m.sizeOptions || []).includes(f.size)) return false;
    if (f.env && !(m.environments || []).includes(f.env)) return false;
    if (f.source && (m.source || 'Homebrew') !== f.source) return false;
    if (f.legendary && !(m.legendaryActions || []).length) return false;
    return true;
  });
}

export function sortMonsters(list, sort = 'name', dir = 'asc') {
  const s = dir === 'desc' ? -1 : 1;
  const byName = (a, b) => a.name.localeCompare(b.name, 'it') || String(a.source).localeCompare(String(b.source));
  const key = {
    cr: (m) => m.crValue ?? crToValue(m.cr), hp: (m) => Number(m.hp) || 0, ac: (m) => Number(m.ac) || 0,
  }[sort];
  return [...list].sort((a, b) => (key ? (key(a) - key(b)) * s || byName(a, b) : byName(a, b) * s));
}

/** Ricerca: i nomi che iniziano con la query vengono prima (solo con ordinamento per nome). */
export function searchAndSort(monsters, f) {
  const res = sortMonsters(filterMonsters(monsters, f), f.sort, f.dir);
  const q = norm(f.q).trim();
  if (!q || f.sort !== 'name') return res;
  const starts = [], rest = [];
  for (const m of res) (norm(m.name).startsWith(q) ? starts : rest).push(m);
  return [...starts, ...rest];
}
