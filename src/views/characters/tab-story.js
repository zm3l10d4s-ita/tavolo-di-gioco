// Tab "Personalità & Storia" e "Note": campi testo lunghi con salvataggio ritardato.
import { html } from '../../vendor/preact-htm.js';
import { Panel } from '../../components/ui.js';
import { Inline, LazyText } from './widgets.js';

export function StoryTab({ c, mutate }) {
  const set = (k) => (v) => mutate((d) => { d[k] = v; });
  const setP = (k) => (v) => mutate((d) => { d.personality[k] = v; });
  return html`<div class="cs-grid-2 cs-story">
    <div class="cs-col">
      <${Panel} title="Aspetto">
        <div class="cs-form cs-form-3">
          ${[['age', 'Età'], ['height', 'Altezza'], ['weight', 'Peso'], ['eyes', 'Occhi'], ['skin', 'Carnagione'], ['hair', 'Capelli']].map(([k, l]) => html`
            <label class="field"><span class="field-label">${l}</span><${Inline} value=${c[k]} onInput=${set(k)} testid=${'field-' + k} /></label>`)}
        </div>
        <${LazyText} label="Descrizione dell'aspetto" value=${c.appearance} rows=${8} onCommit=${set('appearance')} testid="field-appearance" />
      </${Panel}>
      <${Panel} title="Storia">
        <${LazyText} label="Storia del personaggio" value=${c.backstory} rows=${10} onCommit=${set('backstory')} testid="field-backstory" />
      </${Panel}>
    </div>
    <div class="cs-col">
      <${Panel} title="Personalità">
        <div class="cs-form cs-form-2">
          <${LazyText} label="Tratti caratteriali" value=${c.personality.traits} rows=${4} onCommit=${setP('traits')} testid="field-traits" />
          <${LazyText} label="Ideali" value=${c.personality.ideals} rows=${4} onCommit=${setP('ideals')} />
          <${LazyText} label="Legami" value=${c.personality.bonds} rows=${4} onCommit=${setP('bonds')} />
          <${LazyText} label="Difetti" value=${c.personality.flaws} rows=${4} onCommit=${setP('flaws')} />
        </div>
      </${Panel}>
      <${Panel} title="Alleati, fazioni e nemici">
        <${LazyText} label="Alleati" value=${c.allies} rows=${3} onCommit=${set('allies')} />
        <${LazyText} label="Fazioni / organizzazioni" value=${c.faction} rows=${2} onCommit=${set('faction')} />
        <${LazyText} label="Nemici" value=${c.enemies} rows=${3} onCommit=${set('enemies')} />
      </${Panel}>
    </div>
  </div>`;
}

export function NotesTab({ c, mutate }) {
  return html`<div class="cs-notes"><${Panel} title="Note">
    <${LazyText} value=${c.notes} rows=${22} placeholder="Appunti di gioco, PNG incontrati, tesori, indizi…" onCommit=${(v) => mutate((d) => { d.notes = v; })} testid="field-notes" />
  </${Panel}></div>`;
}
