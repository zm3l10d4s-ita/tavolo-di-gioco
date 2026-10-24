// Collegamenti tra sezioni.
// La route #/spells/<x> accetta sia l'id ('fireball', 'fireball-2024') sia il nome inglese o italiano ('Fireball', 'palla di fuoco'):
// se <x> non è un id, la sezione Incantesimi cerca per nome (preferendo l'edizione indicata) e sostituisce la route con l'id.
import { navigate } from './router.js';

/** href per un incantesimo dato il nome o l'id (es. dentro uno StatBlock). ruleset: '2014' | '2024' opzionale. */
export function spellHref(nameOrId, ruleset) {
  return '#/spells/' + encodeURIComponent(nameOrId) + (ruleset ? '/' + encodeURIComponent(ruleset) : '');
}
/** Apre la sezione Incantesimi sull'incantesimo con quel nome/id. */
export function openSpell(nameOrId, ruleset) {
  if (ruleset) navigate('spells', nameOrId, ruleset); else navigate('spells', nameOrId);
}
/** Apre un oggetto: equipaggiamento (#/equipment/<id>) o oggetto magico (#/equipment/magic/<id>). */
export function openItem(id, magic = false) {
  if (magic) navigate('equipment', 'magic', id); else navigate('equipment', id);
}
