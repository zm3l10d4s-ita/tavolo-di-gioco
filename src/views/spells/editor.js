// Editor di incantesimi homebrew (collezione homebrew, kind 'spells'). Le distanze si inseriscono nell'unità scelta
// dall'utente e si salvano in piedi come l'SRD.
import { html, useState } from '../../vendor/preact-htm.js';
import { Modal, TextField, NumberField, Select, Checkbox, Button, ConfirmButton, toast } from '../../components/ui.js';
import * as store from '../../lib/store.js';
import { uid } from '../../lib/util.js';
import { SCHOOLS, CASTER_CLASSES, SCHOOL_IT } from './format.js';

const RANGE_KINDS = [
  { value: 'feet', label: 'Distanza' }, { value: 'self', label: 'Personale' }, { value: 'touch', label: 'Contatto' },
  { value: 'sight', label: 'Vista' }, { value: 'unlimited', label: 'Illimitata' }, { value: 'special', label: 'Speciale' },
];

function blank() {
  return { name: '', level: 1, school: 'evocation', castingTime_it: '1 azione', rangeKind: 'feet', rangeFt: 60,
    components: { v: true, s: true, m: false, material: '' }, duration_it: 'Istantanea', concentration: false, ritual: false,
    classes: [], desc: '', higherLevel: '' };
}

/** hb: item homebrew esistente (modifica) o null (nuovo); base: incantesimo da cui partire (duplica). */
export function SpellEditor({ open, hb, base, units, onClose, onSaved }) {
  const init = () => {
    const d = hb?.data || (base ? { ...base, classes: (base.classes || []).map((c) => c.replace(/-2024$/, '')) } : blank());
    return { ...blank(), ...d, components: { ...blank().components, ...(d.components || {}) },
      castingTime_it: d.castingTime_it || d.castingTime || '', duration_it: d.duration_it || d.duration || '' };
  };
  const [f, setF] = useState(init);
  if (!open) return null;
  const set = (p) => setF({ ...f, ...p });
  const metric = units !== 'ft';
  const rangeShown = f.rangeFt == null ? '' : metric ? Math.round(f.rangeFt * 0.3 * 10) / 10 : f.rangeFt;
  const toggleClass = (id, on) => set({ classes: on ? [...new Set([...f.classes, id])] : f.classes.filter((c) => c !== id) });
  const save = () => {
    const name = f.name.trim();
    if (!name) { toast('Il nome è obbligatorio', 'bad'); return; }
    const id = hb?.id || uid();
    const data = {
      ...f, name, id: hb?.data?.id || 'hb-spell-' + id, source: 'Homebrew', ruleset: null, name_it: null,
      level: Math.max(0, Math.min(9, Number(f.level) || 0)), school_it: SCHOOL_IT[f.school],
      castingTime: f.castingTime_it, duration: f.duration_it,
      range: f.rangeKind === 'feet' ? `${f.rangeFt} feet` : f.rangeKind, rangeFt: f.rangeKind === 'feet' ? Number(f.rangeFt) || 0 : null,
    };
    delete data._homebrew; delete data._hbId;
    const saved = store.put('homebrew', { ...(hb || {}), id, kind: 'spells', data });
    toast(`Incantesimo «${name}» salvato`, 'good');
    onSaved?.(saved.data.id);
    onClose();
  };
  const remove = () => { store.remove('homebrew', hb.id); toast('Incantesimo eliminato'); onSaved?.(null); onClose(); };
  return html`<${Modal} open wide title=${hb ? 'Modifica incantesimo homebrew' : 'Nuovo incantesimo homebrew'} onClose=${onClose}>
    <div class="sp-editor" data-testid="spell-editor">
      <div class="sp-ed-grid">
        <${TextField} label="Nome" value=${f.name} onInput=${(v) => set({ name: v })} className="span2" data-testid="spell-ed-name" />
        <${Select} label="Livello" value=${String(f.level)} onChange=${(v) => set({ level: Number(v) })}
          options=${[{ value: '0', label: 'Trucchetto' }, ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((l) => ({ value: String(l), label: `${l}° livello` }))]} />
        <${Select} label="Scuola" value=${f.school} onChange=${(v) => set({ school: v })} options=${SCHOOLS.map((s) => ({ value: s.id, label: s.label }))} />
        <${TextField} label="Tempo di lancio" value=${f.castingTime_it} onInput=${(v) => set({ castingTime_it: v })} placeholder="1 azione" />
        <${TextField} label="Durata" value=${f.duration_it} onInput=${(v) => set({ duration_it: v })} placeholder="Istantanea" />
        <${Select} label="Gittata" value=${f.rangeKind} onChange=${(v) => set({ rangeKind: v })} options=${RANGE_KINDS} />
        ${f.rangeKind === 'feet' && html`<${NumberField} label=${metric ? 'Distanza (m)' : 'Distanza (ft)'} value=${rangeShown} min=${0} step=${metric ? 1.5 : 5}
          onInput=${(v) => set({ rangeFt: metric ? Math.round(v / 0.3) : v })} />`}
      </div>
      <div class="row sp-ed-checks">
        <span class="field-label">Componenti</span>
        <${Checkbox} label="Verbale" checked=${f.components.v} onChange=${(v) => set({ components: { ...f.components, v } })} />
        <${Checkbox} label="Somatica" checked=${f.components.s} onChange=${(v) => set({ components: { ...f.components, s: v } })} />
        <${Checkbox} label="Materiale" checked=${f.components.m} onChange=${(v) => set({ components: { ...f.components, m: v } })} />
        <span class="spacer"></span>
        <${Checkbox} label="Concentrazione" checked=${f.concentration} onChange=${(v) => set({ concentration: v })} />
        <${Checkbox} label="Rituale" checked=${f.ritual} onChange=${(v) => set({ ritual: v })} />
      </div>
      ${f.components.m && html`<${TextField} label="Componente materiale" value=${f.components.material || ''} onInput=${(v) => set({ components: { ...f.components, material: v } })} />`}
      <div class="field"><span class="field-label">Classi</span>
        <div class="row">${CASTER_CLASSES.map((c) => html`<${Checkbox} label=${c.label} checked=${f.classes.includes(c.id)} onChange=${(on) => toggleClass(c.id, on)} />`)}</div>
      </div>
      <${TextField} label="Descrizione" multiline rows=${7} value=${f.desc} onInput=${(v) => set({ desc: v })} placeholder="Effetto dell'incantesimo. Paragrafi separati da una riga vuota." data-testid="spell-ed-desc" />
      <${TextField} label="Ai livelli superiori" multiline rows=${2} value=${f.higherLevel || ''} onInput=${(v) => set({ higherLevel: v })} />
      <div class="row">
        ${hb && html`<${ConfirmButton} confirmText="Eliminare l'incantesimo?" onConfirm=${remove}>Elimina</${ConfirmButton}>`}
        <span class="spacer"></span>
        <${Button} onClick=${onClose}>Annulla</${Button}>
        <${Button} variant="primary" onClick=${save} data-testid="spell-ed-save">Salva incantesimo</${Button}>
      </div>
    </div>
  </${Modal}>`;
}
