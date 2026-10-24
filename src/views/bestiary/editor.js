// Editor dei mostri homebrew: ogni modifica è scritta subito nello store (autosave).
import { html, useState, useEffect, useRef } from '../../vendor/preact-htm.js';
import { TextField, NumberField, Select, Checkbox, Button, Modal, ConfirmButton } from '../../components/ui.js';
import { StatBlock, SKILL_IT, SKILL_ABILITY, CONDITION_IT, ABILITY_IT, abilityMod, fmtNum } from '../../components/statblock.js';
import { useDoc } from '../../lib/hooks.js';
import { signed } from '../../lib/util.js';
import { SIZES, TYPES, CR_VALUES, crLabel, ENVIRONMENTS } from './filter.js';
import { patchHomebrew, deleteHomebrew } from './homebrew.js';

/** Campo lista separata da virgole con stato locale (permette di digitare ", "). */
function ListField({ label, value, onChange, placeholder, testid }) {
  const ref = useRef();
  const [local, setLocal] = useState((value || []).join(', '));
  useEffect(() => {
    if (document.activeElement !== ref.current?.querySelector('input')) setLocal((value || []).join(', '));
  }, [(value || []).join('|')]);
  return html`<label class="field" ref=${ref}>
    <span class="field-label">${label}</span>
    <input class="input" value=${local} placeholder=${placeholder} data-testid=${testid}
      onInput=${(e) => { const v = e.currentTarget.value; setLocal(v); onChange(v.split(/[;]|,(?![^(]*\))/).map((s) => s.trim()).filter(Boolean)); }} />
  </label>`;
}

function avgFromFormula(f) {
  const s = String(f || '').replace(/\s+/g, '').replace(/−/g, '-');
  let total = 0; let ok = false;
  const re = /([+-]?)(\d*)d(\d+)|([+-]?)(\d+)/g; let m;
  while ((m = re.exec(s))) {
    if (m[3]) { ok = true; total += (m[1] === '-' ? -1 : 1) * Number(m[2] || 1) * (Number(m[3]) + 1) / 2; }
    else if (m[5]) total += (m[4] === '-' ? -1 : 1) * Number(m[5]);
  }
  return ok ? Math.max(1, Math.floor(total)) : null;
}

const ENTRY_GROUPS = [
  { key: 'traits', label: 'Tratti', add: 'Nuovo tratto', tpl: { name: 'Nuovo tratto', desc: '' } },
  { key: 'actions', label: 'Azioni', add: 'Nuova azione', tpl: { name: 'Attacco', desc: 'Attacco con arma da mischia: +4 al colpire, portata 1,5 m, un bersaglio. Colpito: 5 (1d6 + 2) danni taglienti.' } },
  { key: 'bonusActions', label: 'Azioni bonus', add: 'Nuova azione bonus', tpl: { name: 'Azione bonus', desc: '' } },
  { key: 'reactions', label: 'Reazioni', add: 'Nuova reazione', tpl: { name: 'Reazione', desc: '' } },
  { key: 'legendaryActions', label: 'Azioni leggendarie', add: 'Nuova azione leggendaria', tpl: { name: 'Azione leggendaria', desc: '' } },
];
const DAMAGE_LBL = { acid: 'acido', bludgeoning: 'contundente', cold: 'freddo', fire: 'fuoco', force: 'forza', lightning: 'fulmine', necrotic: 'necrotico', piercing: 'perforante', poison: 'veleno', psychic: 'psichico', radiant: 'radioso', slashing: 'tagliente', thunder: 'tuono' };

function EntryEditor({ group, entries, onChange }) {
  const list = entries || [];
  const set = (i, p) => onChange(list.map((e, j) => (j === i ? { ...e, ...p } : e)));
  const move = (i, d) => { const a = [...list]; const [x] = a.splice(i, 1); a.splice(i + d, 0, x); onChange(a); };
  return html`<fieldset class="hb-group" data-group=${group.key}>
    <legend>${group.label} <span class="faint">(${list.length})</span></legend>
    ${list.map((e, i) => html`<div class="hb-entry" key=${i}>
      <div class="row">
        <${TextField} className="grow" value=${e.name} placeholder="Nome" onInput=${(v) => set(i, { name: v })} data-testid="hb-entry-name" />
        <${Button} size="sm" variant="ghost" title="Su" disabled=${i === 0} onClick=${() => move(i, -1)}>↑</${Button}>
        <${Button} size="sm" variant="ghost" title="Giù" disabled=${i === list.length - 1} onClick=${() => move(i, 1)}>↓</${Button}>
        <${ConfirmButton} confirmText="Rimuovi?" onConfirm=${() => onChange(list.filter((_, j) => j !== i))}>✕</${ConfirmButton}>
      </div>
      <${TextField} multiline rows=${3} value=${e.desc} placeholder="Descrizione (es. «Attacco con arma da mischia: +4 al colpire… Colpito: 5 (1d6 + 2) danni taglienti.»)" onInput=${(v) => set(i, { desc: v })} data-testid="hb-entry-desc" />
      ${(e.attackBonus != null || e.damage?.length || e.dc) && html`<div class="hb-derived">Rilevato:
        ${e.attackBonus != null && html` <span class="tag accent">${signed(e.attackBonus)} al colpire</span>`}
        ${(e.damage || []).map((d) => html` <span class="tag bad">${d.dice} ${DAMAGE_LBL[d.type] || d.type}</span>`)}
        ${e.dc && html` <span class="tag magic">CD ${e.dc.value}${e.dc.ability ? ' ' + ABILITY_IT[e.dc.ability] : ''}</span>`}
      </div>`}
    </div>`)}
    <${Button} size="sm" onClick=${() => onChange([...list, { ...group.tpl }])} data-testid=${'hb-add-' + group.key}>+ ${group.add}</${Button}>
  </fieldset>`;
}

export function HomebrewEditor({ hbId, onClose, onDeleted }) {
  const [hb] = useDoc('homebrew', hbId);
  if (!hb) return null;
  const m = hb.data || {};
  const patch = (p) => patchHomebrew(hbId, p);
  const patchIn = (key, p) => patchHomebrew(hbId, (d) => ({ ...d, [key]: { ...(d[key] || {}), ...p } }));
  const ab = m.abilities || {};
  const pb = m.profBonus || 2;
  const avg = avgFromFormula(m.hpFormula);

  return html`<${Modal} open=${true} wide title=${`Mostro homebrew — ${m.name || ''}`} onClose=${onClose}>
    <div class="hb-editor" data-testid="hb-editor">
      <div class="hb-form">
        <p class="faint hb-hint">Le modifiche si salvano automaticamente. Le distanze nel testo puoi scriverle in metri; velocità e sensi si indicano in piedi (5 ft = 1,5 m), come nell'SRD.</p>
        <fieldset class="hb-group"><legend>Identità</legend>
          <div class="hb-grid g3">
            <${TextField} className="span2" label="Nome" value=${m.name} onInput=${(v) => patch({ name: v })} data-testid="hb-name" />
            <${Select} label="Grado di Sfida" value=${String(m.crValue ?? 0)} options=${CR_VALUES.map((v) => ({ value: String(v), label: crLabel(v) }))}
              onChange=${(v) => patch({ cr: crLabel(Number(v)) })} data-testid="hb-cr" />
            <${Select} label="Taglia" value=${m.size} options=${SIZES.map((s) => ({ value: s.id, label: s.label }))} onChange=${(v) => patch({ size: v, sizeOptions: undefined })} />
            <${Select} label="Tipo" value=${m.type} options=${TYPES.map((s) => ({ value: s.id, label: s.label }))} onChange=${(v) => patch({ type: v, swarm: null })} />
            <${TextField} label="Sottotipo" value=${m.subtype || ''} onInput=${(v) => patch({ subtype: v || null })} />
            <${TextField} className="span2" label="Allineamento" value=${m.alignment_it || m.alignment} onInput=${(v) => patch({ alignment: v, alignment_it: v })} />
            <div class="hb-derived-box">PE ${fmtNum(m.xp)} · BC ${signed(pb)}</div>
          </div>
        </fieldset>
        <fieldset class="hb-group"><legend>Difesa e movimento</legend>
          <div class="hb-grid g4">
            <${NumberField} label="Classe Armatura" value=${m.ac} min=${0} max=${40} onInput=${(v) => patch({ ac: v })} data-testid="hb-ac" />
            <${TextField} className="span3" label="Nota CA" value=${m.acNote} placeholder="armatura naturale" onInput=${(v) => patch({ acNote: v })} />
            <${NumberField} label="Punti Ferita" value=${m.hp} min=${1} max=${9999} onInput=${(v) => patch({ hp: v })} data-testid="hb-hp" />
            <${TextField} className="span2" label="Formula PF" value=${m.hpFormula} placeholder="2d8 + 2" onInput=${(v) => patch({ hpFormula: v })} />
            <div class="field"><span class="field-label"> </span><${Button} size="sm" disabled=${avg == null || avg === m.hp} onClick=${() => patch({ hp: avg })} title="Imposta i PF alla media della formula">PF medi: ${avg ?? '—'}</${Button}></div>
            ${[['walk', 'Camminare'], ['fly', 'Volare'], ['swim', 'Nuotare'], ['climb', 'Scalare'], ['burrow', 'Scavare']].map(([k, l]) => html`
              <${NumberField} label=${l + ' (ft)'} value=${m.speed?.[k] || 0} min=${0} max=${500} step=${5} onInput=${(v) => patchIn('speed', { [k]: v })} />`)}
            <div class="field"><span class="field-label"> </span><${Checkbox} label="Fluttuare" checked=${m.speed?.hover} onChange=${(v) => patchIn('speed', { hover: v })} /></div>
          </div>
        </fieldset>
        <fieldset class="hb-group"><legend>Caratteristiche e competenze</legend>
          <div class="hb-grid g6">
            ${['str', 'dex', 'con', 'int', 'wis', 'cha'].map((k) => html`<div class="hb-ab">
              <${NumberField} label=${ABILITY_IT[k]} value=${ab[k] ?? 10} min=${1} max=${30} onInput=${(v) => patchIn('abilities', { [k]: v })} data-testid=${'hb-ab-' + k} />
              <div class="faint hb-ab-mod">${signed(abilityMod(ab[k]))}</div>
              <${Checkbox} label=${'TS ' + signed(m.saves?.[k] ?? abilityMod(ab[k]))} checked=${m.saves?.[k] != null}
                onChange=${(on) => patch({ saves: Object.fromEntries(Object.entries({ ...(m.saves || {}), [k]: on ? abilityMod(ab[k]) + pb : null }).filter(([, v]) => v != null)) })} />
            </div>`)}
          </div>
          <div class="hb-skills">
            ${Object.entries(SKILL_IT).map(([k, l]) => {
              const on = m.skills?.[k] != null;
              const base = abilityMod(ab[SKILL_ABILITY[k]]) + pb;
              return html`<label class="check hb-skill">
                <input type="checkbox" checked=${on} onChange=${(e) => patch({ skills: Object.fromEntries(Object.entries({ ...(m.skills || {}), [k]: e.currentTarget.checked ? base : null }).filter(([, v]) => v != null)) })} />
                <span>${l}</span><span class="faint">${signed(on ? m.skills[k] : base)}</span>
                ${on && html`<button type="button" class="btn ghost sm" title="Maestria (raddoppia la competenza)" onClick=${(e) => { e.preventDefault(); patchIn('skills', { [k]: m.skills[k] === base ? base + pb : base }); }}>${m.skills[k] === base + pb ? '★' : '☆'}</button>`}
              </label>`;
            })}
          </div>
        </fieldset>
        <fieldset class="hb-group"><legend>Difese, sensi e linguaggi</legend>
          <div class="hb-grid g2">
            <${ListField} label="Vulnerabilità ai danni" value=${m.damageVulnerabilities} placeholder="es. fire, radiant" onChange=${(v) => patch({ damageVulnerabilities: v })} />
            <${ListField} label="Resistenze ai danni" value=${m.damageResistances} placeholder="es. cold, necrotic" onChange=${(v) => patch({ damageResistances: v })} />
            <${ListField} label="Immunità ai danni" value=${m.damageImmunities} placeholder="es. poison" onChange=${(v) => patch({ damageImmunities: v })} />
            <${TextField} label="Linguaggi" value=${m.languages} onInput=${(v) => patch({ languages: v })} />
          </div>
          <div class="field-label hb-sub">Immunità alle condizioni</div>
          <div class="hb-chips">
            ${Object.entries(CONDITION_IT).map(([k, l]) => html`<${Checkbox} label=${l} checked=${(m.conditionImmunities || []).includes(k)}
              onChange=${(on) => patch({ conditionImmunities: on ? [...(m.conditionImmunities || []), k] : (m.conditionImmunities || []).filter((x) => x !== k) })} />`)}
          </div>
          <div class="hb-grid g5">
            ${[['darkvision', 'Scurovisione'], ['blindsight', 'Vista cieca'], ['tremorsense', 'Perc. tellurica'], ['truesight', 'Vista pura']].map(([k, l]) => html`
              <${NumberField} label=${l + ' (ft)'} value=${m.senses?.[k] || 0} min=${0} max=${1000} step=${5} onInput=${(v) => patchIn('senses', { [k]: v || undefined })} />`)}
            <${NumberField} label="Percezione passiva" value=${m.senses?.passivePerception ?? 10} min=${0} max=${40} onInput=${(v) => patchIn('senses', { passivePerception: v })} />
          </div>
        </fieldset>
        ${ENTRY_GROUPS.map((g) => html`<${EntryEditor} key=${g.key} group=${g} entries=${m[g.key]} onChange=${(v) => patch({
          [g.key]: v,
          ...(g.key === 'legendaryActions' && v.length && !m.legendaryDesc ? { legendaryDesc: `${m.name} può compiere 3 azioni leggendarie, scegliendo tra le opzioni seguenti. Può usare una sola opzione alla volta e solo alla fine del turno di un'altra creatura. Recupera le azioni leggendarie spese all'inizio del proprio turno.`, legendaryUses: 3 } : {}),
        })} />`)}
        ${(m.legendaryActions || []).length > 0 && html`<${TextField} multiline rows=${2} label="Introduzione azioni leggendarie" value=${m.legendaryDesc} onInput=${(v) => patch({ legendaryDesc: v })} />`}
        <fieldset class="hb-group"><legend>Ambienti e descrizione</legend>
          <div class="hb-chips">
            ${ENVIRONMENTS.map((e) => html`<${Checkbox} label=${e.label} checked=${(m.environments || []).includes(e.id)}
              onChange=${(on) => patch({ environments: on ? [...(m.environments || []), e.id] : (m.environments || []).filter((x) => x !== e.id) })} />`)}
          </div>
          <${TextField} multiline rows=${3} label="Descrizione / note" value=${m.description} onInput=${(v) => patch({ description: v })} />
        </fieldset>
        <div class="row hb-foot">
          <${ConfirmButton} confirmText="Eliminare definitivamente?" onConfirm=${() => { deleteHomebrew(hbId); onDeleted?.(); }}>Elimina mostro</${ConfirmButton}>
          <span class="spacer"></span>
          <${Button} variant="primary" onClick=${onClose} data-testid="hb-close">Fatto</${Button}>
        </div>
      </div>
      <aside class="hb-preview">
        <div class="field-label">Anteprima</div>
        <${StatBlock} monster=${m} compact />
      </aside>
    </div>
  </${Modal}>`;
}
