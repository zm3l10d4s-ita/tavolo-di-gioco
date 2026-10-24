// Formattazione dell'equipaggiamento in italiano.
import { formatDistance, formatWeight } from '../../lib/rules.js';

export const COIN_IT = { cp: 'mr', sp: 'ma', ep: 'me', gp: 'mo', pp: 'mp' };
export const DAMAGE_IT = {
  acid: 'acido', bludgeoning: 'contundente', cold: 'freddo', fire: 'fuoco', force: 'forza', lightning: 'fulmine', necrotic: 'necrotico',
  piercing: 'perforante', poison: 'veleno', psychic: 'psichico', radiant: 'radioso', slashing: 'tagliente', thunder: 'tuono',
};
export const RARITIES = [
  { id: 'common', label: 'Comune' }, { id: 'uncommon', label: 'Non comune' }, { id: 'rare', label: 'Raro' }, { id: 'very-rare', label: 'Molto raro' },
  { id: 'legendary', label: 'Leggendario' }, { id: 'artifact', label: 'Artefatto' }, { id: 'varies', label: 'Variabile' },
];
export const RARITY_IT = Object.fromEntries(RARITIES.map((r) => [r.id, r.label]));
export const MAGIC_TYPES = [
  { id: 'armor', label: 'Armatura' }, { id: 'weapon', label: 'Arma' }, { id: 'ammunition', label: 'Munizioni' }, { id: 'potion', label: 'Pozione' },
  { id: 'ring', label: 'Anello' }, { id: 'rod', label: 'Verga' }, { id: 'scroll', label: 'Pergamena' }, { id: 'staff', label: 'Bastone' },
  { id: 'wand', label: 'Bacchetta' }, { id: 'wondrous-item', label: 'Oggetto meraviglioso' },
];
export const MAGIC_TYPE_IT = Object.fromEntries(MAGIC_TYPES.map((r) => [r.id, r.label]));
export const ARMOR_CAT_IT = { light: 'Leggera', medium: 'Media', heavy: 'Pesante', shield: 'Scudo' };
export const WEAPON_SUB_IT = { 'simple-melee': 'Semplice da mischia', 'simple-ranged': 'Semplice a distanza', 'martial-melee': 'Marziale da mischia', 'martial-ranged': 'Marziale a distanza' };

export function costText(it) {
  if (it.cost && it.cost.qty != null) return `${Number(it.cost.qty).toLocaleString('it-IT')} ${COIN_IT[it.cost.unit] || it.cost.unit || ''}`.trim();
  if (it.costGp != null) return `${Number(it.costGp).toLocaleString('it-IT')} mo`;
  return '—';
}
export function weightText(it, units) { return it.weight == null || it.weight === '' ? '—' : formatWeight(it.weight, units); }

export function damageText(it) {
  if (!it.damage?.dice) return '—';
  const t = DAMAGE_IT[it.damage.type] || it.damage.type || '';
  return `${it.damage.dice} ${t}`.trim();
}

export function acText(it) {
  const ac = it.ac || {};
  if (it.armorCategory === 'shield') return `+${ac.base ?? 2}`;
  if (ac.base == null) return '—';
  if (ac.dexBonus === false) return String(ac.base);
  return ac.maxBonus != null ? `${ac.base} + mod DES (max ${ac.maxBonus})` : `${ac.base} + mod DES`;
}

export function rangeText(it, units) {
  const r = it.range;
  const t = it.throwRange;
  const fmt = (a, b) => (b ? `${formatDistance(a, units)} / ${formatDistance(b, units)}` : formatDistance(a, units));
  if (it.weaponRange === 'ranged' && r?.normal) return fmt(r.normal, r.long);
  if (t?.normal) return `lancio ${fmt(t.normal, t.long)}`;
  return null;
}

import { sourceTone as catTone, shortSource } from '../../lib/catalog.js';
/** Accetta la voce (consigliato) o la sola stringa della fonte. */
export const sourceTone = (x) => (x && typeof x === 'object' ? catTone(x) : x === 'SRD 5.2' ? 'magic' : x === 'Homebrew' ? 'good' : x === 'SRD 5.1' || !x ? 'accent' : 'book');
export const sourceShort = (x) => (x && typeof x === 'object' ? shortSource(x) : x === 'SRD 5.2' ? '5.2' : x === 'Homebrew' ? 'HB' : '5.1');
/** Filtro fonte: '' tutte, 'SRD 5.1' | 'SRD 5.2' | 'Homebrew' (creati da te), '__books' manuali (catalogo), '__stub' da completare, '__done' completati. */
export function matchSource(it, f) {
  if (!f) return true;
  if (f === '__stub') return !!it.stub;
  if (f === '__done') return !!it.completed;
  if (f === '__books') return !!(it.stub || it.completed);
  if (f === 'Homebrew') return it.source === 'Homebrew';
  return (it.source || 'SRD 5.1') === f;
}
export function attributionText(it) {
  if (it.stub) return `${it.source} · testo non incluso: completalo incollandolo dal tuo manuale.`;
  if (it.completed) return `${it.source} · testo inserito da te (uso personale).`;
  if (it.source === 'Homebrew') return 'Contenuto creato dall\'utente.';
  return `${it.source} · Wizards of the Coast · CC-BY-4.0`;
}
