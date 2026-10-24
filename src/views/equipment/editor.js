// Editor di oggetti homebrew: equipaggiamento (kind 'equipment') e oggetti magici (kind 'magicItems').
// Peso inserito nell'unità dell'utente e salvato in libbre; costo in mo.
import { html, useState } from '../../vendor/preact-htm.js';
import { Modal, TextField, NumberField, Select, Checkbox, Button, ConfirmButton, toast } from '../../components/ui.js';
import * as store from '../../lib/store.js';
import { uid } from '../../lib/util.js';
import { RARITIES, MAGIC_TYPES, RARITY_IT, MAGIC_TYPE_IT, DAMAGE_IT, ARMOR_CAT_IT } from './format.js';

const CATS = [
  { value: 'weapon', label: 'Arma' }, { value: 'armor', label: 'Armatura' }, { value: 'tool', label: 'Strumento' }, { value: 'gear', label: 'Equipaggiamento d\'avventura' },
];
const CAT_IT = { weapon: 'Arma', armor: 'Armatura', tool: 'Strumento', gear: 'Equipaggiamento d\'avventura' };

export function ItemEditor({ open, kind, hb, base, units, onClose, onSaved }) {
  const magic = kind === 'magicItems';
  const [f, setF] = useState(() => {
    const d = hb?.data || base || {};
    return magic
      ? { name: '', type: 'wondrous-item', rarity: 'uncommon', attunement: false, attunementReq: '', desc: '', weight: null, ...d }
      : { name: '', category: 'gear', costGp: 1, weight: 1, desc: '', damage: { dice: '1d6', type: 'slashing' }, weaponCategory: 'simple', weaponRange: 'melee',
        armorCategory: 'light', ac: { base: 11, dexBonus: true, maxBonus: null }, properties: [], ...d };
  });
  if (!open) return null;
  const set = (p) => setF({ ...f, ...p });
  const metric = units !== 'ft';
  const wShown = f.weight == null ? '' : metric ? Math.round(f.weight * 0.5 * 100) / 100 : f.weight;
  const save = () => {
    const name = String(f.name || '').trim();
    if (!name) { toast('Il nome è obbligatorio', 'bad'); return; }
    const id = hb?.id || uid();
    const data = { ...f, name, id: hb?.data?.id || `hb-${magic ? 'mi' : 'eq'}-${id}`, source: 'Homebrew', ruleset: null };
    delete data._homebrew; delete data._hbId;
    if (magic) {
      Object.assign(data, { type_it: MAGIC_TYPE_IT[data.type], rarity_it: RARITY_IT[data.rarity],
        subtitle: `${MAGIC_TYPE_IT[data.type]}, ${(RARITY_IT[data.rarity] || '').toLowerCase()}${data.attunement ? ' (richiede sintonia)' : ''}` });
    } else {
      Object.assign(data, { category_it: CAT_IT[data.category], cost: { qty: Number(data.costGp) || 0, unit: 'gp' }, costGp: Number(data.costGp) || 0 });
      if (data.category === 'weapon') {
        data.subcategory = `${data.weaponCategory}-${data.weaponRange}`;
        if (data.weaponRange === 'ranged' && !data.range) data.range = { normal: 80, long: 320 };
        if (data.weaponRange === 'melee') data.range = { normal: 5, long: null };
      } else if (data.category === 'armor') { data.subcategory = data.armorCategory; data.subcategory_it = ARMOR_CAT_IT[data.armorCategory]; }
      else { delete data.damage; delete data.ac; }
    }
    store.put('homebrew', { ...(hb || {}), id, kind, data });
    toast(`«${name}» salvato`, 'good');
    onSaved?.(data.id);
    onClose();
  };
  const remove = () => { store.remove('homebrew', hb.id); toast('Oggetto eliminato'); onSaved?.(null); onClose(); };
  const weightField = html`<${NumberField} label=${metric ? 'Peso (kg)' : 'Peso (lb)'} value=${wShown} min=${0} step=${metric ? 0.5 : 1}
    onInput=${(v) => set({ weight: metric ? Math.round((v / 0.5) * 100) / 100 : v })} />`;
  return html`<${Modal} open wide title=${`${hb ? 'Modifica' : 'Nuovo'} ${magic ? 'oggetto magico' : 'oggetto'} homebrew`} onClose=${onClose}>
    <div class="eq-editor" data-testid="item-editor">
      <div class="eq-ed-grid">
        <${TextField} label="Nome" value=${f.name} onInput=${(v) => set({ name: v })} className="span2" data-testid="item-ed-name" />
        ${magic ? html`
          <${Select} label="Tipo" value=${f.type} onChange=${(v) => set({ type: v })} options=${MAGIC_TYPES.map((t) => ({ value: t.id, label: t.label }))} />
          <${Select} label="Rarità" value=${f.rarity} onChange=${(v) => set({ rarity: v })} options=${RARITIES.map((t) => ({ value: t.id, label: t.label }))} />
          <${Checkbox} label="Richiede sintonia" checked=${f.attunement} onChange=${(v) => set({ attunement: v })} />
          ${f.attunement && html`<${TextField} label="Sintonia con…" value=${f.attunementReq || ''} onInput=${(v) => set({ attunementReq: v })} placeholder="es. un incantatore" />`}
          ${weightField}`
        : html`
          <${Select} label="Categoria" value=${f.category} onChange=${(v) => set({ category: v })} options=${CATS} />
          <${NumberField} label="Costo (mo)" value=${f.costGp} min=${0} step=${0.1} onInput=${(v) => set({ costGp: v })} />
          ${weightField}
          ${f.category === 'weapon' && html`
            <${Select} label="Arma" value=${f.weaponCategory} onChange=${(v) => set({ weaponCategory: v })} options=${[{ value: 'simple', label: 'Semplice' }, { value: 'martial', label: 'Marziale' }]} />
            <${Select} label="Portata" value=${f.weaponRange} onChange=${(v) => set({ weaponRange: v })} options=${[{ value: 'melee', label: 'Mischia' }, { value: 'ranged', label: 'Distanza' }]} />
            <${TextField} label="Dadi di danno" value=${f.damage?.dice || ''} onInput=${(v) => set({ damage: { ...f.damage, dice: v } })} />
            <${Select} label="Tipo di danno" value=${f.damage?.type} onChange=${(v) => set({ damage: { ...f.damage, type: v } })} options=${Object.entries(DAMAGE_IT).map(([k, l]) => ({ value: k, label: l }))} />`}
          ${f.category === 'armor' && html`
            <${Select} label="Tipo" value=${f.armorCategory} onChange=${(v) => set({ armorCategory: v })} options=${Object.entries(ARMOR_CAT_IT).map(([k, l]) => ({ value: k, label: l }))} />
            <${NumberField} label=${f.armorCategory === 'shield' ? 'Bonus CA' : 'CA base'} value=${f.ac?.base} min=${0} onInput=${(v) => set({ ac: { ...f.ac, base: v } })} />
            ${f.armorCategory !== 'shield' && html`<${Select} label="Mod DES" value=${f.ac?.dexBonus === false ? 'no' : f.ac?.maxBonus != null ? 'max' : 'full'}
              onChange=${(v) => set({ ac: { ...f.ac, dexBonus: v !== 'no', maxBonus: v === 'max' ? 2 : null } })}
              options=${[{ value: 'full', label: '+ DES' }, { value: 'max', label: '+ DES (max 2)' }, { value: 'no', label: 'Nessuno' }]} />`}`}`}
      </div>
      <${TextField} label="Descrizione" multiline rows=${7} value=${f.desc} onInput=${(v) => set({ desc: v })} data-testid="item-ed-desc" />
      <div class="row">
        ${hb && html`<${ConfirmButton} confirmText="Eliminare l'oggetto?" onConfirm=${remove}>Elimina</${ConfirmButton}>`}
        <span class="spacer"></span>
        <${Button} onClick=${onClose}>Annulla</${Button}>
        <${Button} variant="primary" onClick=${save} data-testid="item-ed-save">Salva</${Button}>
      </div>
    </div>
  </${Modal}>`;
}
