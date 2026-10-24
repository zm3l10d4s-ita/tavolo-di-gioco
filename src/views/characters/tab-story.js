// Tab "Personalità & Storia" e "Note": campi testo lunghi con salvataggio ritardato.
import { html, useState } from '../../vendor/preact-htm.js';
import { Panel } from '../../components/ui.js';
import { Inline, LazyText, rollExpr } from './widgets.js';

// Cronaca eroica (Explorer's Guide to Wildemount e adattamenti): solo la struttura dei passi.
// Le tabelle sono nel manuale: qui si annotano i risultati (con i dadi a portata di mano).
const HC_STEPS = [
  ['homeland', 'Patria'], ['background', 'Background'], ['socialStatus', 'Stato sociale'], ['settlement', 'Insediamento d\'origine'],
  ['family', 'Famiglia'], ['familyRelations', 'Legami familiari importanti'], ['alliesRivals', 'Alleati e rivali (chi sono)'],
  ['fatefulMoments', 'Momenti decisivi'], ['secret', 'Segreto misterioso'], ['prophecy', 'Profezia'], ['other', 'Altro (doni soprannaturali, note…)'],
];
const HC_DICE = ['1d4', '1d6', '1d8', '1d10', '1d12', '1d20', '1d100'];

function HeroicChronicle({ c, mutate }) {
  const hc = c.heroicChronicle || {};
  const filled = HC_STEPS.filter(([k]) => String(hc[k] || '').trim()).length;
  const [open, setOpen] = useState(filled > 0);
  const setH = (k) => (v) => mutate((d) => { d.heroicChronicle = { ...(d.heroicChronicle || {}), [k]: v }; });
  return html`<${Panel} title="Cronaca eroica" className="cs-hc"
    actions=${html`<span class="faint cs-small">${filled}/${HC_STEPS.length}</span>
      <button class="btn ghost sm" onClick=${() => setOpen(!open)} data-testid="hc-toggle">${open ? 'Chiudi' : 'Apri'}</button>`}>
    ${!open ? html`<p class="faint cs-small">Il sistema di <i>Explorer's Guide to Wildemount</i> per costruire il passato del personaggio a passi (patria, famiglia, momenti decisivi, profezia…). Apri per annotare i risultati.</p>`
      : html`<p class="faint cs-small">Le tabelle sono nel manuale: tira i dadi qui sotto e annota il risultato di ogni passo.</p>
        <div class="row cs-hc-dice">${HC_DICE.map((e) => html`<button class="btn sm" onClick=${() => rollExpr(c, 'Cronaca eroica', e)}>${e.replace('1d', 'd')}</button>`)}</div>
        <div class="cs-form cs-form-2">${HC_STEPS.map(([k, l]) => html`<${LazyText} label=${l} value=${hc[k] || ''} rows=${k === 'prophecy' || k === 'fatefulMoments' ? 4 : 2}
          placeholder=${k === 'background' && c.background?.name ? c.background.name : ''} onCommit=${setH(k)} testid=${'hc-' + k} />`)}</div>`}
  </${Panel}>`;
}

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
      <${HeroicChronicle} c=${c} mutate=${mutate} />
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
