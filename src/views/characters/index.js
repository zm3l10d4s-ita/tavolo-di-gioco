// Sezione "Schede personaggi". Route: #/characters (elenco) · #/characters/<id> (scheda) · #/characters/new (creazione guidata)
import { html } from '../../vendor/preact-htm.js';
import { CharacterList } from './list.js';
import { CharacterSheet } from './sheet.js';

export default function CharactersView({ params = [], navigate }) {
  const id = params[0];
  if (id && id !== 'new') return html`<${CharacterSheet} key=${id} id=${id} navigate=${navigate} />`;
  return html`<${CharacterList} navigate=${navigate} openWizard=${id === 'new'} />`;
}
