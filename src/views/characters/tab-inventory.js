// Tab "Inventario": oggetti (SRD e liberi), equipaggiati/armonizzati, monete, peso trasportato.
import { html, useState, useMemo } from '../../vendor/preact-htm.js';
import { Panel, Modal, Button, Select, SearchBox, ConfirmButton, Empty, toast } from '../../components/ui.js';
import * as R from '../../lib/rules.js';
import { uid, norm } from '../../lib/util.js';
import { ITEM_CATEGORIES, ATTUNE_MAX, attunedCount, inventoryItemFromSrd, attackFromWeapon } from './logic.js';
import { Inline, InlineNum, Stepper, lbToUnit, unitToLb, weightUnit, LazyText } from './widgets.js';

const CAT_LABEL = Object.fromEntries(ITEM_CATEGORIES.map((x) => [x.value, x.label]));
const FILTERS = [{ id: '', label: 'Tutto' }, ...ITEM_CATEGORIES];
const COINS = [['pp', 'MP', 'platino'], ['gp', 'MO', 'oro'], ['ep', 'ME', 'electrum'], ['sp', 'MA', 'argento'], ['cp', 'MR', 'rame']];

function srdItem(it, data) {
  if (!it.itemId) return null;
  const ds = it.dataset === 'magicItems' ? data.magicItems : data.equipment;
  return ds.find((x) => x.id === it.itemId) || (it.dataset ? null : data.magicItems.find((x) => x.id === it.itemId)) || null;
}

function ItemRow({ c, mutate, data, units, it, i }) {
  const [open, setOpen] = useState(false);
  const info = srdItem(it, data);
  const set = (k, v) => mutate((d) => { d.inventory[i] = { ...d.inventory[i], [k]: v }; });
  const needsAttune = it.attuned || info?.attunement || it.category === 'magic';
  const isWeapon = info?.category === 'weapon';
  return html`<div class="cs-item ${it.equipped ? 'equipped' : ''}" data-testid="item-row" data-item=${it.itemId || it.name}>
    <label class="cs-item-eq" title="Equipaggiato / indossato"><input type="checkbox" checked=${!!it.equipped} onChange=${(e) => set('equipped', e.currentTarget.checked)} data-testid="item-equipped" /></label>
    <div class="cs-item-name">
      <${Inline} value=${it.name} onInput=${(v) => set('name', v)} testid="item-name" />
      ${info && html`<span class="tag ${it.dataset === 'magicItems' ? 'magic' : ''}" title=${info.name}>SRD</span>`}
    </div>
    <select class="input cs-inline cs-item-cat" value=${it.category || 'gear'} onChange=${(e) => set('category', e.currentTarget.value)}>
      ${ITEM_CATEGORIES.map((x) => html`<option value=${x.value}>${x.label}</option>`)}</select>
    <${Stepper} value=${it.qty ?? 1} onChange=${(v) => set('qty', v)} testid="item-qty" />
    <label class="cs-item-w" title=${`Peso unitario (${weightUnit(units)})`}>
      <${InlineNum} value=${lbToUnit(it.weight || 0, units)} min=${0} step=${0.1} onInput=${(v) => set('weight', unitToLb(v || 0, units))} />
      <span class="faint">${weightUnit(units)}</span></label>
    <span class="cs-item-tw faint" title="Peso totale">${R.formatWeight((it.weight || 0) * (it.qty ?? 1), units)}</span>
    ${needsAttune
      ? html`<button class="cs-attune ${it.attuned ? 'on' : ''}" title=${it.attuned ? 'Armonizzato (clic per sciogliere)' : 'Armonizza'} data-testid="item-attune"
          onClick=${() => {
            if (!it.attuned && attunedCount(c) >= ATTUNE_MAX) toast(`Attenzione: più di ${ATTUNE_MAX} oggetti armonizzati`, 'bad');
            set('attuned', !it.attuned);
          }}>◈</button>`
      : html`<span class="cs-attune-ph"></span>`}
    <span class="cs-item-act">
      ${isWeapon && html`<button class="btn ghost sm" title="Crea un attacco da quest'arma" onClick=${() => { mutate((d) => { d.attacks.push(attackFromWeapon(d, info)); }); toast(`Attacco creato: ${info.name}`, 'good'); }}>⚔</button>`}
      <button class="btn ghost sm" onClick=${() => setOpen(!open)} title="Dettagli e note">${open ? '▴' : '▾'}</button>
      <${ConfirmButton} variant="ghost" onConfirm=${() => mutate((d) => { d.inventory.splice(i, 1); })} confirmText="Elimina?">✕</${ConfirmButton}>
    </span>
    ${open && html`<div class="cs-item-more">
      ${info && html`<div class="cs-small muted">
        ${info.subtitle || [info.category_it, info.subcategory_it].filter(Boolean).join(' · ')}
        ${info.damage && ` · ${info.damage.dice} ${info.damage.type}`}
        ${info.ac && ` · CA ${info.ac.base}${info.ac.dexBonus ? (info.ac.maxBonus != null ? ` + DES (max ${info.ac.maxBonus})` : ' + DES') : ''}`}
        ${info.strMinimum ? ` · For ${info.strMinimum}` : ''}${info.stealthDisadvantage ? ' · svantaggio Furtività' : ''}
        ${info.rarity_it && ` · ${info.rarity_it}`}${info.attunementReq ? ` · armonizzazione ${info.attunementReq}` : info.attunement ? ' · richiede armonizzazione' : ''}
        ${info.costGp != null && ` · ${info.costGp} mo`}
      </div>`}
      ${info?.desc && html`<div class="prose cs-small cs-item-desc">${R.convertDistancesInText(info.desc, units).split('\n\n').slice(0, 4).map((p) => html`<p>${p}</p>`)}</div>`}
      <${LazyText} label="Note" value=${it.notes} rows=${2} onCommit=${(v) => set('notes', v)} />
    </div>`}
  </div>`;
}

function AddItemModal({ c, mutate, data, units, open, onClose }) {
  const [q, setQ] = useState('');
  const [src, setSrc] = useState('equipment');
  const [allEd, setAllEd] = useState(false);
  const list = useMemo(() => {
    const nq = norm(q);
    const ds = src === 'magicItems' ? data.magicItems : data.equipment;
    return ds.filter((x) => (allEd || x._homebrew || R.matchesRuleset(x, c.ruleset)) && (!nq || norm(x.name).includes(nq) || norm(x.name_it).includes(nq) || norm(x.subcategory_it).includes(nq)))
      .sort((a, b) => a.name.localeCompare(b.name)).slice(0, 150);
  }, [q, src, allEd, data.equipment.length, data.magicItems.length, c.ruleset]);
  if (!open) return null;
  const add = (x) => { mutate((d) => { d.inventory.push(inventoryItemFromSrd(x, src)); }); toast(`Aggiunto: ${x.name}`, 'good'); };
  return html`<${Modal} open=${open} title="Aggiungi oggetti" onClose=${onClose} wide>
    <div class="cs-additem" data-testid="add-item-modal">
      <div class="row">
        <${SearchBox} value=${q} onInput=${setQ} placeholder="Cerca (es. longsword, rope, potion)…" autofocus />
        <${Select} value=${src} onChange=${setSrc} options=${[{ value: 'equipment', label: 'Equipaggiamento' }, { value: 'magicItems', label: 'Oggetti magici' }]} data-testid="item-source" />
        <label class="check"><input type="checkbox" checked=${allEd} onChange=${(e) => setAllEd(e.currentTarget.checked)} /><span>Entrambe le edizioni</span></label>
        <span class="faint cs-small">${list.length} risultati</span>
      </div>
      <div class="cs-addspell-list">
        ${list.length ? list.map((x) => html`<div class="cs-addspell-row" data-testid="srd-item" data-id=${x.id}>
          <b>${x.name}${R.versionTag(x, c.ruleset)}</b>
          <span class="faint cs-small">${x.subtitle || [x.category_it, x.subcategory_it].filter(Boolean).join(' · ')}${x.weight ? ' · ' + R.formatWeight(x.weight, units) : ''}${x.costGp != null ? ` · ${x.costGp} mo` : ''}${x.attunement ? ' · armonizzazione' : ''}</span>
          <span class="spacer"></span>
          <button class="btn sm" onClick=${() => add(x)} data-testid="srd-item-add">+ Aggiungi</button>
        </div>`) : html`<${Empty} title="Nessun oggetto">Cambia la ricerca.</${Empty}>`}
      </div>
    </div>
  </${Modal}>`;
}

export function InventoryTab(ctx) {
  const { c, mutate, data, units } = ctx;
  const [filter, setFilter] = useState('');
  const [adding, setAdding] = useState(false);
  const carried = R.inventoryWeight(c);
  const cap = R.carryingCapacity(c);
  const pct = Math.min(100, (carried / Math.max(1, cap.capacity)) * 100);
  const att = attunedCount(c);
  const acd = R.armorClassDetail(c, data.equipment);
  const rows = c.inventory.map((it, i) => ({ it, i })).filter(({ it }) => !filter || (it.category || 'gear') === filter);
  const gp = Object.entries(R.COIN_GP).reduce((s, [k, v]) => s + (Number(c.currency[k]) || 0) * v, 0);
  return html`<div class="cs-grid-inv">
    <div class="cs-col">
      <${Panel} title="Equipaggiamento" className="cs-inventory" actions=${html`
        <button class="btn ghost sm" data-testid="add-free-item" onClick=${() => mutate((d) => { d.inventory.push({ id: uid(), itemId: null, name: 'Nuovo oggetto', qty: 1, weight: 0, equipped: false, attuned: false, category: filter || 'gear', notes: '' }); })}>+ Oggetto libero</button>
        <button class="btn sm primary" data-testid="add-item" onClick=${() => setAdding(true)}>+ Dall'SRD</button>`}>
        <div class="cs-chips">${FILTERS.map((f) => {
          const id = f.id ?? f.value;
          const n = id ? c.inventory.filter((x) => (x.category || 'gear') === id).length : c.inventory.length;
          return html`<button class="cs-chip ${filter === id ? 'on' : ''}" onClick=${() => setFilter(id)}>${f.label}${n ? html` <span class="faint">${n}</span>` : ''}</button>`;
        })}</div>
        <div class="cs-item cs-item-head faint"><span title="Equipaggiato">Eq.</span><span>Nome</span><span>Categoria</span><span>Q.tà</span><span>Peso</span><span>Tot.</span><span title="Armonizzato">◈</span><span></span></div>
        ${rows.length ? rows.map(({ it, i }) => html`<${ItemRow} key=${it.id || i} ...${ctx} it=${it} i=${i} />`)
          : html`<p class="faint cs-pad">Nessun oggetto${filter ? ' in questa categoria' : ''}.</p>`}
      </${Panel}>
    </div>
    <div class="cs-col">
      <${Panel} title="Monete" className="cs-coins">
        <div class="cs-coin-grid">${COINS.map(([k, ab, n]) => html`<label class="cs-coin ${k}" title=${'Monete di ' + n}>
          <span class="cs-coin-ab">${ab}</span><${InlineNum} value=${c.currency[k] || 0} min=${0} testid=${'coin-' + k} onInput=${(v) => mutate((d) => { d.currency[k] = v || 0; })} /></label>`)}</div>
        <div class="faint cs-small">Valore totale ≈ ${gp.toLocaleString('it-IT', { maximumFractionDigits: 2 })} mo</div>
      </${Panel}>
      <${Panel} title="Carico" className="cs-carry">
        <div class="cs-carry-val" data-testid="carried-weight"><b>${R.formatWeight(carried, units)}</b> <span class="faint">/ ${R.formatWeight(cap.capacity, units)}</span></div>
        <div class="cs-hpbar"><i style=${`width:${pct}%`} class=${carried > cap.capacity ? 'low' : carried > cap.heavilyEncumbered ? 'mid' : 'ok'}></i></div>
        <div class="faint cs-small">Spingere/trascinare/sollevare ${R.formatWeight(cap.pushDragLift, units)} · ingombro (variante) oltre ${R.formatWeight(cap.encumbered, units)} / ${R.formatWeight(cap.heavilyEncumbered, units)} · monete incluse (50 = ${R.formatWeight(1, units)})</div>
        ${carried > cap.capacity && html`<div class="bad-t cs-small">Oltre la capacità di trasporto!</div>`}
      </${Panel}>
      <${Panel} title="Armonizzazione" className="cs-attpanel">
        <div class="row"><b class=${att > ATTUNE_MAX ? 'bad-t' : ''} data-testid="attuned-count">${att} / ${ATTUNE_MAX}</b><span class="faint cs-small">oggetti magici armonizzati</span></div>
        ${att > ATTUNE_MAX && html`<div class="bad-t cs-small">Superato il limite di ${ATTUNE_MAX} oggetti armonizzati.</div>`}
        <ul class="cs-attlist">${c.inventory.filter((x) => x.attuned).map((x) => html`<li>◈ ${x.name}</li>`)}</ul>
      </${Panel}>
      <${Panel} title="Armatura indossata" className="cs-armor">
        ${acd.armor || acd.shieldItem ? html`<dl class="cs-dl">
            ${acd.armor && html`<dt>Armatura</dt><dd>${acd.armor.name} (${acd.armor.subcategory_it || acd.armor.armorCategory})</dd>
              <dt>CA</dt><dd>${acd.armor.ac?.base}</dd><dt>Des max</dt><dd>${acd.armor.ac?.dexBonus === false ? '0' : acd.armor.ac?.maxBonus ?? 'nessun limite'}</dd>
              <dt>For richiesta</dt><dd>${acd.armor.strMinimum || '—'}</dd><dt>Furtività</dt><dd>${acd.armor.stealthDisadvantage ? 'svantaggio' : '—'}</dd>`}
            ${acd.shieldItem && html`<dt>Scudo</dt><dd>${acd.shieldItem.name} (+${acd.shield})</dd>`}
            <dt>CA risultante</dt><dd><b>${acd.computed}</b>${acd.override ? html` <span class="faint">(manuale ${acd.ac})</span>` : ''}</dd>
          </dl>`
          : html`<p class="faint cs-small">Nessuna armatura SRD equipaggiata: CA ${acd.computed} (${acd.source === 'unarmored' ? '10 + DES' : 'difesa senza armatura'})${acd.override ? `, impostata manualmente a ${acd.ac}` : ''}. Spunta «Eq.» su un'armatura o uno scudo SRD per calcolarla.</p>`}
      </${Panel}>
    </div>
    <${AddItemModal} ...${ctx} open=${adding} onClose=${() => setAdding(false)} />
  </div>`;
}
