// Sezione Equipaggiamento: armi, armature, strumenti, equipaggiamento d'avventura, oggetti magici.
// Route: #/equipment/<id> (equipaggiamento) · #/equipment/magic/<id> (oggetto magico)
import { html, useState, useEffect, useMemo, useRef } from '../../vendor/preact-htm.js';
import { Button, Select, Tabs, Empty, toast } from '../../components/ui.js';
import { StubBanner, PasteImportModal } from '../../components/paste-import.js';
import { Icon } from '../../components/icons.js';
import { Prose } from '../../components/prose.js';
import { PickCharacterModal } from '../../components/pick-character.js';
import { useSrd, useDoc, useCollection } from '../../lib/hooks.js';
import * as store from '../../lib/store.js';
import { norm, uid, isNarrow } from '../../lib/util.js';
import { ItemEditor } from './editor.js';
import {
  RARITIES, MAGIC_TYPES, RARITY_IT, MAGIC_TYPE_IT, ARMOR_CAT_IT, WEAPON_SUB_IT, DAMAGE_IT,
  costText, weightText, damageText, acText, rangeText, sourceTone, sourceShort, matchSource, attributionText,
} from './format.js';

const TABS = [
  { id: 'weapon', label: 'Armi' }, { id: 'armor', label: 'Armature' }, { id: 'tool', label: 'Strumenti' },
  { id: 'gear', label: 'Equipaggiamento d\'avventura' }, { id: 'magic', label: 'Oggetti magici' },
];
const tabOf = (it, magic) => (magic ? 'magic' : ['weapon', 'armor', 'tool'].includes(it.category) ? it.category : 'gear');
const DEF = { q: '', source: '', sub: '', rarity: '', attune: '', mtype: '' };
let memo = { tab: 'weapon', f: { ...DEF } };

function addToInventory(ch, it, magic, qty) {
  store.update('characters', ch.id, (c) => {
    const inv = [...(c.inventory || [])];
    const ex = !magic ? inv.find((x) => x.itemId === it.id) : null;
    if (ex) ex.qty = (Number(ex.qty) || 1) + qty;
    else {
      inv.push({ id: uid(), itemId: it.id, name: it.name_it || it.name, qty, weight: Number(it.weight) || 0, equipped: false,
        attuned: false, category: magic ? 'magic-item' : it.category || 'gear', notes: '', ...(magic ? { magic: true, rarity: it.rarity || null } : {}) });
    }
    return { ...c, inventory: inv };
  });
}

function subOptions(tab, items) {
  if (tab === 'weapon') return Object.entries(WEAPON_SUB_IT).map(([v, l]) => ({ value: v, label: l }));
  if (tab === 'armor') return Object.entries(ARMOR_CAT_IT).map(([v, l]) => ({ value: v, label: l }));
  const m = new Map();
  for (const it of items) if (it.subcategory) m.set(it.subcategory, it.subcategory_it || it.subcategory);
  for (const it of items) if (tab === 'gear' && it.category !== 'gear') m.set('cat:' + it.category, it.category_it || it.category);
  return [...m].map(([v, l]) => ({ value: v, label: l })).sort((a, b) => a.label.localeCompare(b.label, 'it'));
}

function Columns({ tab }) {
  const c = {
    weapon: ['Nome', 'Tipo', 'Danno', 'Peso', 'Costo'], armor: ['Nome', 'Tipo', 'CA', 'Peso', 'Costo'],
    tool: ['Nome', 'Tipo', 'Peso', 'Costo'], gear: ['Nome', 'Tipo', 'Peso', 'Costo'], magic: ['Nome', 'Tipo', 'Rarità', 'Sint.'],
  }[tab];
  return html`<tr>${c.map((x) => html`<th>${x}</th>`)}<th></th></tr>`;
}

function Row({ it, tab, units, selected, onSelect }) {
  const cells = {
    weapon: [WEAPON_SUB_IT[it.subcategory] || it.subcategory_it || '', damageText(it), weightText(it, units), costText(it)],
    armor: [ARMOR_CAT_IT[it.armorCategory] || it.subcategory_it || '', acText(it), weightText(it, units), costText(it)],
    tool: [it.subcategory_it || '', weightText(it, units), costText(it)],
    gear: [it.category === 'gear' ? it.subcategory_it || '' : it.category_it || '', weightText(it, units), costText(it)],
    magic: [it.type_it || MAGIC_TYPE_IT[it.type] || '', html`<span class="rar rar-${it.rarity}">${it.rarity_it || RARITY_IT[it.rarity] || ''}</span>`, it.attunement ? html`<span title="Richiede sintonia">✓</span>` : ''],
  }[tab];
  return html`<tr class="clickable ${selected ? 'selected' : ''}" onClick=${() => onSelect(it)} data-testid="item-row" data-id=${it.id}>
    <td class="eq-name">${it.name_it || it.name}</td>${cells.map((c) => html`<td>${c}</td>`)}
    <td><span class="tag ${sourceTone(it)}">${sourceShort(it)}</span></td>
  </tr>`;
}

function Prop({ label, children }) {
  if (children == null || children === '' || children === false) return null;
  return html`<div><dt>${label}</dt><dd>${children}</dd></div>`;
}

function Detail({ it, magic, units, props, navigate, onEdit, onDuplicate, byId, miById }) {
  const [pick, setPick] = useState(false);
  const [qty, setQty] = useState(1);
  const propNames = (it.properties || []).map((p) => props.get(p)?.name_it || p);
  return html`<article class="eq-card ${magic ? 'magic' : ''}" data-testid="item-detail" data-id=${it.id}>
    <header class="eq-dhead">
      <div>
        <h2>${it.name_it || it.name}</h2>
        <div class="eq-sub">${magic ? (it.subtitle && it.source !== 'Homebrew' ? `${it.type_it || ''}, ${(it.rarity_it || '').toLowerCase()}${it.attunement ? ` (richiede sintonia${it.attunementReq ? ' ' + it.attunementReq : ''})` : ''}` : it.subtitle || '')
          : [it.category_it, it.subcategory_it].filter(Boolean).join(' · ')}</div>
      </div>
      <span class="spacer"></span>
      <span class="tag ${sourceTone(it)}">${it.source || 'SRD'}</span>
    </header>
    <${StubBanner} dataset=${magic ? 'magicItems' : 'equipment'} item=${it} />
    <div class="eq-actions">
      <input class="input eq-qty" type="number" min="1" value=${qty} onInput=${(e) => setQty(Math.max(1, Number(e.currentTarget.value) || 1))} title="Quantità" data-testid="item-qty" />
      <${Button} variant="primary" onClick=${() => setPick(true)} data-testid="item-add-to-inventory"><${Icon} name="backpack" size=${16} /> Aggiungi all'inventario di…</${Button}>
      <span class="spacer"></span>
      ${it._homebrew ? html`<${Button} onClick=${() => onEdit(it._hbId)}><${Icon} name="edit" size=${15} /> Modifica</${Button}>`
        : it.stub ? null : html`<${Button} variant="ghost" onClick=${() => onDuplicate(it)}>Duplica come homebrew</${Button}>`}
    </div>
    <dl class="eq-props">
      ${!magic && html`<${Prop} label="Costo">${costText(it)}</${Prop}><${Prop} label="Peso">${weightText(it, units)}</${Prop}>`}
      ${it.category === 'weapon' && html`<${Prop} label="Danno">${damageText(it)}${it.twoHandedDamage?.dice ? ` (${it.twoHandedDamage.dice} a due mani)` : ''}</${Prop}>
        <${Prop} label="Gittata">${rangeText(it, units)}</${Prop}>
        <${Prop} label="Maestria">${it.mastery ? props.get(it.mastery)?.name_it || it.mastery : null}</${Prop}>`}
      ${it.category === 'armor' && html`<${Prop} label="Classe Armatura">${acText(it)}</${Prop}>
        <${Prop} label="Forza">${it.strMinimum ? `For ${it.strMinimum}` : null}</${Prop}>
        <${Prop} label="Furtività">${it.stealthDisadvantage ? 'Svantaggio' : null}</${Prop}>`}
      ${magic && html`<${Prop} label="Rarità">${it.rarity_it || RARITY_IT[it.rarity]}</${Prop}><${Prop} label="Sintonia">${it.attunement ? (it.attunementReq || 'Sì') : 'No'}</${Prop}>`}
      ${it.capacity && html`<${Prop} label="Capacità">${it.capacity}</${Prop}>`}
    </dl>
    ${propNames.length > 0 && html`<div class="eq-tags"><span class="field-label">Proprietà</span>${propNames.map((p) => html`<span class="tag">${p}</span>`)}</div>`}
    <div class="eq-body">
      ${it.desc ? html`<${Prose} text=${it.desc} units=${units} />` : !it.contents?.length && html`<p class="faint">Nessuna descrizione nell'SRD.</p>`}
      ${it.special && html`<${Prose} text=${it.special} units=${units} />`}
      ${it.contents?.length > 0 && html`<h4>Contenuto</h4><ul class="eq-contents">${it.contents.map((c) => html`<li><a href=${'#/equipment/' + encodeURIComponent(c.id)}>${byId(c.id)?.name || c.name}</a>${c.qty > 1 ? ` ×${c.qty}` : ''}</li>`)}</ul>`}
      ${it.variants?.length > 0 && html`<h4>Varianti</h4><div class="eq-tags">${it.variants.map((v) => html`<a class="tag" href=${'#/equipment/magic/' + encodeURIComponent(v)}>${miById(v)?.name ? `${miById(v).name} (${(miById(v).rarity_it || '').toLowerCase()})` : v}</a>`)}</div>`}
    </div>
    <p class="eq-attrib faint">${attributionText(it)}</p>
    <${PickCharacterModal} open=${pick} title=${`Aggiungi ${qty > 1 ? qty + '× ' : ''}«${it.name_it || it.name}» all'inventario di…`} onClose=${() => setPick(false)}
      onPick=${(ch) => { addToInventory(ch, it, magic, qty); setPick(false);
        toast(html`<div><b>${qty > 1 ? qty + '× ' : ''}${it.name_it || it.name}</b> nell'inventario di ${ch.name}</div><button class="btn sm" style="margin-top:6px" onClick=${() => navigate('characters', ch.id)}>Apri scheda →</button>`, 'good'); }} />
  </article>`;
}

export default function EquipmentView({ params = [], navigate }) {
  const eq = useSrd('equipment');
  const mi = useSrd('magicItems');
  const wp = useSrd('weaponProperties');
  useCollection('characters');
  const [settings] = useDoc('settings', 'app');
  const units = settings?.units || 'm';
  const props = useMemo(() => new Map(wp.items.map((p) => [p.id, p])), [wp.items]);
  const eqById = useMemo(() => new Map(eq.items.map((x) => [x.id, x])), [eq.items]);
  const miById = useMemo(() => new Map(mi.items.map((x) => [x.id, x])), [mi.items]);
  const [tabState, setTabState] = useState(memo.tab);
  const [f, setFState] = useState(memo.f);
  const [editor, setEditor] = useState(null);
  const [paste, setPaste] = useState(false);
  const setF = (x) => { memo.f = x; setFState(x); };
  const tableRef = useRef();

  const magicRoute = params[0] === 'magic';
  const selId = magicRoute ? params[1] : params[0];
  const selected = selId ? (magicRoute ? mi.items.find((x) => x.id === selId) : eqById.get(selId)) : null;
  const tab = selected ? tabOf(selected, magicRoute) : tabState;
  const setTab = (t) => { memo.tab = t; setTabState(t); setF({ ...DEF, q: f.q, source: f.source }); navigate('equipment'); };
  useEffect(() => { if (selected) { memo.tab = tab; setTabState(tab); } }, [selected?.id]);

  const pool = tab === 'magic' ? mi.items : eq.items.filter((x) => tabOf(x, false) === tab);
  const q = norm(f.q.trim());
  const list = useMemo(() => pool.filter((it) => {
    if (q && !(norm(it.name).includes(q) || norm(it.name_it || '').includes(q))) return false;
    if (!matchSource(it, f.source)) return false;
    if (f.sub) {
      if (f.sub.startsWith('cat:')) { if (it.category !== f.sub.slice(4)) return false; }
      else if (tab === 'armor' ? it.armorCategory !== f.sub : it.subcategory !== f.sub) return false;
    }
    if (tab === 'magic') {
      if (f.rarity && it.rarity !== f.rarity) return false;
      if (f.mtype && it.type !== f.mtype) return false;
      if (f.attune && !!it.attunement !== (f.attune === 'yes')) return false;
    }
    return true;
  }).sort((a, b) => {
    if (q) { const d = (norm(b.name).startsWith(q)) - (norm(a.name).startsWith(q)); if (d) return d; }
    return (a.name_it || a.name).localeCompare(b.name_it || b.name, 'it') || String(a.source).localeCompare(String(b.source));
  }), [pool, f, tab]);

  const select = (it) => (tab === 'magic' ? navigate('equipment', 'magic', it.id) : navigate('equipment', it.id));
  useEffect(() => { if (!selId && list.length && !eq.loading && !mi.loading && !isNarrow()) location.replace('#/equipment/' + (tab === 'magic' ? 'magic/' : '') + encodeURIComponent(list[0].id)); }, [selId, tab, list.length > 0, eq.loading, mi.loading]);
  useEffect(() => { tableRef.current?.querySelector('tr.selected')?.scrollIntoView({ block: 'nearest' }); }, [selected?.id]);
  const set = (p) => setF({ ...f, ...p });
  const loading = eq.loading || mi.loading;

  return html`<div class="view eq-view" data-testid="equipment-view">
    <div class="view-head">
      <h1>Equipaggiamento</h1>
      <span class="faint">${loading ? 'Caricamento…' : `${eq.items.length} oggetti · ${mi.items.length} oggetti magici`}</span>
      ${tab === 'magic' && html`<${Button} onClick=${() => setPaste(true)} data-testid="item-paste"><${Icon} name="edit" size=${15} /> Incolla testo</${Button}>`}
      <${Button} onClick=${() => setEditor({ kind: tab === 'magic' ? 'magicItems' : 'equipment', hb: null, base: tab === 'magic' ? null : { category: tab } })} data-testid="item-new">
        <${Icon} name="plus" size=${16} /> ${tab === 'magic' ? 'Nuovo oggetto magico' : 'Nuovo oggetto'}</${Button}>
    </div>
    <${Tabs} tabs=${TABS} active=${tab} onChange=${setTab} />
    <div class="eq-layout">
      <section class="panel eq-side">
        <div class="eq-filters">
          <input class="input eq-search" type="search" placeholder=${tab === 'magic' ? 'Cerca oggetto magico… (es. pozione)' : 'Cerca…'} value=${f.q}
            onInput=${(e) => set({ q: e.currentTarget.value })} data-testid="item-search" />
          ${tab !== 'magic' && html`<select class="input" value=${f.sub} onChange=${(e) => set({ sub: e.currentTarget.value })} data-testid="item-filter-sub">
            <option value="">Tutti i tipi</option>${subOptions(tab, pool).map((o) => html`<option value=${o.value}>${o.label}</option>`)}</select>`}
          ${tab === 'magic' && html`
            <select class="input" value=${f.mtype} onChange=${(e) => set({ mtype: e.currentTarget.value })} data-testid="item-filter-type">
              <option value="">Tutti i tipi</option>${MAGIC_TYPES.map((o) => html`<option value=${o.id}>${o.label}</option>`)}</select>
            <select class="input" value=${f.rarity} onChange=${(e) => set({ rarity: e.currentTarget.value })} data-testid="item-filter-rarity">
              <option value="">Tutte le rarità</option>${RARITIES.map((o) => html`<option value=${o.id}>${o.label}</option>`)}</select>
            <select class="input" value=${f.attune} onChange=${(e) => set({ attune: e.currentTarget.value })} data-testid="item-filter-attune">
              <option value="">Sintonia: indifferente</option><option value="yes">Richiede sintonia</option><option value="no">Senza sintonia</option></select>`}
          <select class="input" value=${f.source} onChange=${(e) => set({ source: e.currentTarget.value })} data-testid="item-filter-source">
            <option value="">Tutte le fonti</option><option value="SRD 5.1">SRD 5.1</option><option value="SRD 5.2">SRD 5.2</option><option value="__books">Manuali (catalogo)</option><option value="__stub">Da completare</option><option value="__done">Completati da me</option><option value="Homebrew">Creati da me</option></select>
          <span class="eq-count faint" data-testid="item-count">${list.length} risultati</span>
        </div>
        <div class="eq-table-wrap" ref=${tableRef} data-testid="item-list">
          ${list.length ? html`<table class="table eq-table"><thead><${Columns} tab=${tab} /></thead>
            <tbody>${list.map((it) => html`<${Row} key=${it.id} it=${it} tab=${tab} units=${units} selected=${it.id === selected?.id} onSelect=${select} />`)}</tbody></table>`
            : !loading && html`<div style="padding:14px"><${Empty} title="Nessun risultato">Prova a cambiare i filtri.</${Empty}></div>`}
        </div>
      </section>
      <section class="eq-detail">
        ${selected ? html`<${Detail} key=${selected.id} it=${selected} magic=${tab === 'magic'} units=${units} props=${props} navigate=${navigate} byId=${(id) => eqById.get(id)} miById=${(id) => miById.get(id)}
            onEdit=${(hbId) => setEditor({ kind: tab === 'magic' ? 'magicItems' : 'equipment', hb: store.get('homebrew', hbId) })}
            onDuplicate=${(it) => setEditor({ kind: tab === 'magic' ? 'magicItems' : 'equipment', hb: null, base: { ...it, name: `${it.name} (homebrew)`, id: undefined, _homebrew: undefined, _hbId: undefined } })} />`
          : loading ? html`<div class="faint">Caricamento…</div>`
          : selId ? html`<${Empty} title="Oggetto non trovato">«${selId}» non esiste.</${Empty}>`
          : html`<${Empty} title="Seleziona un oggetto">Scegli un oggetto dall'elenco.</${Empty}>`}
      </section>
    </div>
    ${editor && html`<${ItemEditor} open kind=${editor.kind} hb=${editor.hb} base=${editor.base} units=${units} onClose=${() => setEditor(null)}
      onSaved=${(id) => setTimeout(() => (id ? (editor.kind === 'magicItems' ? navigate('equipment', 'magic', id) : navigate('equipment', id)) : navigate('equipment')), 50)} />`}
    <${PasteImportModal} open=${paste} dataset="magicItems" onClose=${() => setPaste(false)} onSaved=${(id) => setTimeout(() => navigate('equipment', 'magic', id), 80)} />
  </div>`;
}
