// "Incolla testo": importa una voce (incantesimo, mostro, oggetto, razza, sottoclasse, talento, background, opzione di classe)
// dal testo copiato da un manuale. Usato per completare le voci del catalogo e per creare voci nuove.
import { html, useState, useMemo } from '../vendor/preact-htm.js';
import { Modal, Button, TextField, toast } from './ui.js';
import { parseFor } from '../lib/parse-text.js';
import { saveEntry, resetEntry, DATASET_LABEL, PASTE_EXAMPLES } from '../lib/catalog.js';
import { normalizeMonster } from '../views/bestiary/homebrew.js';
import { ConfirmButton } from './ui.js';

const ABIL_IT = { str: 'FOR', dex: 'DES', con: 'COS', int: 'INT', wis: 'SAG', cha: 'CAR' };
const SCHOOL_IT = { abjuration: 'Abiurazione', conjuration: 'Evocazione', divination: 'Divinazione', enchantment: 'Ammaliamento', evocation: 'Invocazione', illusion: 'Illusione', necromancy: 'Necromanzia', transmutation: 'Trasmutazione' };
const RARITY_IT = { common: 'Comune', uncommon: 'Non comune', rare: 'Raro', 'very-rare': 'Molto raro', legendary: 'Leggendario', artifact: 'Artefatto', varies: 'Variabile' };

function Summary({ dataset, d }) {
  const rows = [];
  const add = (k, v) => { if (v != null && v !== '' && !(Array.isArray(v) && !v.length)) rows.push([k, v]); };
  if (dataset === 'spells') {
    add('Livello', d.level === 0 ? 'Trucchetto' : `${d.level}°`); add('Scuola', SCHOOL_IT[d.school] || d.school); add('Tempo di lancio', d.castingTime);
    add('Gittata', d.range); add('Componenti', ['v', 's', 'm'].filter((c) => d.components?.[c]).map((c) => c.toUpperCase()).join(', ') + (d.components?.material ? ` (${d.components.material})` : ''));
    add('Durata', d.duration); add('Rituale', d.ritual ? 'sì' : ''); add('Classi', (d.classes || []).join(', ')); add('Ai livelli superiori', d.higherLevel ? '✓' : '');
  } else if (dataset === 'monsters') {
    add('Tipo', `${d.size} ${d.type}${d.subtype ? ` (${d.subtype})` : ''}, ${d.alignment}`); add('CA', `${d.ac}${d.acNote ? ` (${d.acNote})` : ''}`); add('PF', `${d.hp}${d.hpFormula ? ` (${d.hpFormula})` : ''}`);
    add('Velocità (ft)', Object.entries(d.speed || {}).filter(([k, v]) => v && k !== 'hover').map(([k, v]) => `${k} ${v}`).join(', '));
    add('Caratteristiche', Object.entries(d.abilities || {}).map(([k, v]) => `${ABIL_IT[k]} ${v}`).join(' · ')); add('GS', d.cr);
    add('Tratti / Azioni', `${d.traits.length} tratti · ${d.actions.length} azioni · ${d.bonusActions.length} bonus · ${d.reactions.length} reazioni · ${d.legendaryActions.length} leggendarie`);
  } else if (dataset === 'magicItems' || dataset === 'equipment') {
    add('Tipo', d.type); add('Rarità', RARITY_IT[d.rarity] || d.rarity); add('Sintonia', d.attunement ? `sì${d.attunementReq ? ` (${d.attunementReq})` : ''}` : 'no');
  } else if (dataset === 'races' || dataset === 'subraces') {
    add('Velocità (ft)', d.speed); add('Taglia', d.size); add('Aumenti', (d.abilityBonuses || []).map((b) => `${ABIL_IT[b.ability]} +${b.bonus}`).join(', '));
    add('Tratti', (d.traits || []).map((t) => t.name).join(' · '));
  } else if (dataset === 'subclasses' || dataset === 'classes') {
    add('Privilegi', (d.features || []).map((f) => `${f.name}${f.level ? ` (${f.level}°)` : ''}`).join(' · '));
  } else if (dataset === 'backgrounds') {
    add('Abilità', (d.skillProficiencies || []).join(', ')); add('Privilegio', d.feature?.name);
  }
  add('Prerequisito', d.prerequisiteText);
  return html`<dl class="pi-summary">${rows.map(([k, v]) => html`<div><dt>${k}</dt><dd>${v}</dd></div>`)}</dl>`;
}

/**
 * Modale di importazione.
 * props: open, dataset, stub (voce del catalogo da completare) | hbId (voce homebrew da sostituire), onClose, onSaved(itemId, hbId)
 */
export function PasteImportModal(props) {
  // Montato solo quando è aperto: ogni apertura parte da uno stato pulito (niente reset asincroni).
  return props.open ? html`<${PasteImportInner} ...${props} />` : null;
}
function PasteImportInner({ open, dataset, stub = null, hbId = null, onClose, onSaved }) {
  const [text, setText] = useState('');
  const [name, setName] = useState(stub?.name || '');
  const parsed = useMemo(() => (text.trim() ? parseFor(dataset, text) : null), [text, dataset]);
  const label = DATASET_LABEL[dataset] || 'Voce';
  const save = () => {
    if (!parsed) return;
    const data = { ...parsed.data, name: name.trim() || parsed.data.name };
    const res = saveEntry(dataset, data, { stub, hbId, normalize: dataset === 'monsters' ? normalizeMonster : null });
    toast(html`<div><b>${data.name}</b> salvato${stub ? ' (voce completata)' : ''}</div>`, 'good');
    onSaved?.(res.id, res.hbId);
    onClose?.();
  };
  return html`<${Modal} open=${open} wide title=${stub ? `Completa «${stub.name}»` : `Incolla testo — ${label}`} onClose=${onClose}>
    <div class="pi" data-testid="paste-import">
      <p class="faint pi-help">Copia il testo dal tuo manuale (PDF, D&D Beyond, libro scansionato…) e incollalo qui: va bene sia in inglese sia in italiano.
        Controlla l'anteprima a destra e salva: la voce verrà conservata solo sul tuo PC.</p>
      <div class="pi-grid">
        <label class="field pi-text"><span class="field-label">Testo</span>
          <textarea class="input" rows="18" value=${text} placeholder=${PASTE_EXAMPLES[dataset] || ''} onInput=${(e) => setText(e.currentTarget.value)} data-testid="paste-text"></textarea>
        </label>
        <div class="pi-preview">
          <span class="field-label">Anteprima</span>
          ${!parsed ? html`<div class="pi-empty faint">L'anteprima compare mentre incolli.</div>` : html`
            <${TextField} label="Nome" value=${name || parsed.data.name} onInput=${setName} data-testid="paste-name" />
            <${Summary} dataset=${dataset} d=${parsed.data} />
            ${parsed.warnings.length > 0 && html`<ul class="pi-warn">${parsed.warnings.map((w) => html`<li>${w}</li>`)}</ul>`}
            ${parsed.data.desc && html`<div class="pi-desc"><span class="field-label">Descrizione</span><p>${parsed.data.desc.slice(0, 420)}${parsed.data.desc.length > 420 ? '…' : ''}</p></div>`}`}
        </div>
      </div>
      <div class="row pi-actions"><span class="spacer"></span>
        <${Button} variant="ghost" onClick=${onClose}>Annulla</${Button}>
        <${Button} variant="primary" disabled=${!parsed} onClick=${save} data-testid="paste-save">Salva</${Button}>
      </div>
    </div>
  </${Modal}>`;
}

/** Riquadro per le voci del catalogo: "da completare" oppure "completata da te". */
export function StubBanner({ dataset, item, onSaved }) {
  const [open, setOpen] = useState(false);
  if (!item?.stub && !item?.completed) return null;
  return html`<div class="stub-banner ${item.stub ? 'todo' : 'done'}" data-testid="stub-banner">
    ${item.stub
      ? html`<div class="stub-text"><b>Voce da completare</b> · ${item.source}<br /><span class="faint">L'app contiene solo nome e dati di base: incolla il testo dal tuo manuale per completarla.</span></div>
        <${Button} variant="primary" size="sm" onClick=${() => setOpen(true)} data-testid="stub-complete">Incolla testo…</${Button}>`
      : html`<div class="stub-text"><b>Completata da te</b> · ${item.source}</div>
        <${Button} size="sm" onClick=${() => setOpen(true)} data-testid="stub-replace">Sostituisci testo…</${Button}>
        <${ConfirmButton} size="sm" variant="ghost" confirmText="Torna da completare?" onConfirm=${() => resetEntry(item._hbId)}>Ripristina</${ConfirmButton}>`}
    <${PasteImportModal} open=${open} dataset=${dataset} stub=${item.stub ? item : null} hbId=${item.stub ? null : item._hbId}
      onClose=${() => setOpen(false)} onSaved=${onSaved} />
  </div>`;
}
