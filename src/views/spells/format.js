// Formattazione degli incantesimi in italiano (gittata, componenti, livello) e vocabolari dei filtri.
import { formatDistance, baseKey } from '../../lib/rules.js';

export const SCHOOLS = [
  { id: 'abjuration', label: 'Abiurazione' }, { id: 'conjuration', label: 'Evocazione' }, { id: 'divination', label: 'Divinazione' },
  { id: 'enchantment', label: 'Ammaliamento' }, { id: 'evocation', label: 'Invocazione' }, { id: 'illusion', label: 'Illusione' },
  { id: 'necromancy', label: 'Necromanzia' }, { id: 'transmutation', label: 'Trasmutazione' },
];
export const SCHOOL_IT = Object.fromEntries(SCHOOLS.map((s) => [s.id, s.label]));
export const CASTER_CLASSES = [
  { id: 'bard', label: 'Bardo' }, { id: 'cleric', label: 'Chierico' }, { id: 'druid', label: 'Druido' }, { id: 'paladin', label: 'Paladino' },
  { id: 'ranger', label: 'Ranger' }, { id: 'sorcerer', label: 'Stregone' }, { id: 'warlock', label: 'Warlock' }, { id: 'wizard', label: 'Mago' },
];
export const CLASS_IT = Object.fromEntries(CASTER_CLASSES.map((c) => [c.id, c.label]));
const AREA_IT = { sphere: 'sfera', cube: 'cubo', cone: 'cono', cylinder: 'cilindro', line: 'linea', emanation: 'emanazione' };

export function levelLabel(level) { return Number(level) ? `${level}°` : 'T'; }
export function levelLong(sp) {
  const school = (sp.school_it || SCHOOL_IT[sp.school] || sp.school || '').toLowerCase();
  return Number(sp.level) ? `${school ? school[0].toUpperCase() + school.slice(1) : 'Incantesimo'} di ${sp.level}° livello` : `Trucchetto di ${school || '—'}`;
}

export function rangeText(sp, units) {
  const k = sp.rangeKind;
  const aoe = Array.isArray(sp.areaOfEffect) ? sp.areaOfEffect[0] : sp.areaOfEffect;
  if (k === 'feet' || k === 'miles') return formatDistance(sp.rangeFt, units);
  if (k === 'self') {
    const size = aoe?.size ?? sp.selfAreaFt;
    return size ? `Personale (${AREA_IT[aoe?.type] || 'area'} di ${formatDistance(size, units)})` : 'Personale';
  }
  if (k === 'touch') return 'Contatto';
  if (k === 'sight') return 'Vista';
  if (k === 'unlimited') return 'Illimitata';
  if (k === 'special') return 'Speciale';
  if (sp.rangeFt) return formatDistance(sp.rangeFt, units);
  return sp.range || '—';
}

export function componentsText(sp) {
  const c = sp.components || {};
  const parts = [c.v && 'V', c.s && 'S', c.m && 'M'].filter(Boolean).join(', ');
  return { short: parts || '—', material: c.m ? c.material || '' : '' };
}

export const spellClassKeys = (sp) => [...new Set((sp.classes || []).map(baseKey))];
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
