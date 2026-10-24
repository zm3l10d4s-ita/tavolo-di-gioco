// Tab "Incantesimi": statistiche da incantatore, slot consumabili, incantesimi noti/preparati per livello, aggiunta dall'SRD.
import { html, useState, useMemo } from '../../vendor/preact-htm.js';
import { Panel, Modal, Button, Select, SearchBox, ConfirmButton, Empty, toast } from '../../components/ui.js';
import * as R from '../../lib/rules.js';
import { uid, norm, signed } from '../../lib/util.js';
import { effectiveSlots, setSlotUsed, useSlot, restoreSlot, castOptions, castSpell, preparedMax, syncSlots } from './logic.js';
import { Pips, RollBtn, rollCheck, rollExpr, Inline, InlineNum, OverrideField, Popover, LazyText } from './widgets.js';
import { emitRoll } from './api.js';

const AB = R.ABILITY_LABELS_IT;
const LEVEL_LABEL = (l) => (l === 0 ? 'Trucchetti' : `${l}° livello`);

function spellInfo(sp, data) {
  if (!sp?.spellId) return null;
  return data.spells.find((x) => x.id === sp.spellId) || null;
}

function SpellStats({ c, mutate, data }) {
  const ab = R.spellcastingAbility(c);
  const prep = c.spellcasting.spells.filter((s) => s.level > 0 && (s.prepared || s.alwaysPrepared)).length;
  const pmax = preparedMax(c, data.classes, data.levels);
  const atk = R.spellAttackBonus(c);
  const calcDc = R.spellSaveDc({ ...c, spellcasting: { ...c.spellcasting, saveDcOverride: null } });
  const calcAtk = R.spellAttackBonus({ ...c, spellcasting: { ...c.spellcasting, attackOverride: null } });
  return html`<${Panel} title="Incantatore" className="cs-spellstats">
    <div class="cs-spellstats-row">
      <label class="field"><span class="field-label">Classe incantatore</span>
        <span class="cs-text">${c.classes.filter((e) => R.casterTypeOf(e, data.classes)).map((e) => e.name).join(', ') || '—'}</span></label>
      <${Select} label="Caratteristica" value=${c.spellcasting.ability || ''} onChange=${(v) => mutate((d) => { d.spellcasting.ability = v || null; })}
        options=${[{ value: '', label: ab ? `auto (${AB[ab].abbr})` : '—' }, ...R.ABILITIES.map((a) => ({ value: a, label: AB[a].name }))]} />
      <div class="cs-big" data-testid="spell-save-dc"><span class="cs-label">CD tiro salvezza</span><b>${R.spellSaveDc(c) ?? '—'}</b></div>
      <div class="cs-big"><span class="cs-label">Bonus attacco</span>
        ${atk != null ? html`<${RollBtn} className="cs-roll-big" bonus=${atk} testid="spell-attack" onRoll=${(e) => rollCheck(c, 'Attacco con incantesimo', atk, e, 'attack')} />` : html`<b>—</b>`}</div>
      <${OverrideField} label="CD manuale" computed=${calcDc ?? ''} value=${c.spellcasting.saveDcOverride} onInput=${(v) => mutate((d) => { d.spellcasting.saveDcOverride = v; })} testid="dc-override" />
      <${OverrideField} label="Attacco manuale" computed=${calcAtk ?? ''} value=${c.spellcasting.attackOverride} onInput=${(v) => mutate((d) => { d.spellcasting.attackOverride = v; })} />
      <div class="cs-big"><span class="cs-label">Preparati</span><b data-testid="prepared-count">${prep}${pmax != null ? html`<span class="faint">/${pmax}</span>` : ''}</b></div>
      <label class="field cs-conc-field"><span class="field-label">Concentrazione</span>
        <span class="row" style="flex-wrap:nowrap;gap:4px">
          <${Inline} value=${c.spellcasting.concentration} placeholder="nessuna" testid="concentration" onInput=${(v) => mutate((d) => { d.spellcasting.concentration = v; })} />
          ${c.spellcasting.concentration && html`<button class="btn ghost sm" title="Termina" onClick=${() => mutate((d) => { d.spellcasting.concentration = ''; })}>✕</button>`}
          ${c.spellcasting.concentration && html`<button class="btn ghost sm" title="TS Costituzione per mantenere la concentrazione" onClick=${(e) => rollCheck(c, 'TS Concentrazione (COS)', R.saveBonus(c, 'con'), e, 'save')}>TS</button>`}
        </span></label>
    </div>
  </${Panel}>`;
}

function SlotHeader({ c, mutate, data, level, slots }) {
  const auto = c.spellcasting.slotsAuto !== false;
  const s = slots.slots[level];
  if (!s) return null;
  if (!s.max && auto) return null;
  return html`<span class="cs-slot" data-testid=${'slots-' + level}>
    ${!auto && html`<label class="cs-slot-max" title="Slot totali"><span class="faint">tot</span>
      <${InlineNum} value=${c.spellcasting.slots[level].max} min=${0} max=${9} onInput=${(v) => mutate((d) => { d.spellcasting.slots[level].max = v || 0; })} /></label>`}
    <${Pips} max=${s.max} used=${s.used} tone="magic" label=${`Slot di ${level}° livello`}
      onUse=${() => mutate((d) => useSlot(d, level, data.classes).character)} onRestore=${() => mutate((d) => restoreSlot(d, level, data.classes).character)} />
    <span class="cs-slot-left" data-testid=${'slots-left-' + level}>${s.max - s.used}/${s.max}</span>
    <button class="btn sm magic" disabled=${s.used >= s.max} data-testid=${'use-slot-' + level}
      onClick=${() => { mutate((d) => useSlot(d, level, data.classes).character); toast(`Slot di ${level}° livello usato (${s.max - s.used - 1} rimasti)`, 'magic'); }}>Usa slot</button>
  </span>`;
}

function CastButton({ c, mutate, data, sp, info }) {
  const [open, setOpen] = useState(false);
  const level = Number(sp.level) || 0;
  const conc = !!info?.concentration || !!sp.concentration;
  const doCast = (key) => {
    let res;
    mutate((d) => { res = castSpell(d, { name: sp.name, level, concentration: conc }, key, data.classes); return res.character; });
    setOpen(false);
    if (!res.ok) { toast('Nessuno slot disponibile', 'bad'); return; }
    const slotTxt = level > 0 ? (key === 'pact' ? ' con uno slot del patto' : ` con uno slot di ${key}° livello`) : '';
    toast(`${c.name} lancia ${sp.name}${slotTxt}${res.previousConcentration ? ` — termina la concentrazione su ${res.previousConcentration}` : ''}`, 'magic');
    emitRoll(c.id, `Lancia ${sp.name}`, { kind: 'cast', text: `Lancia ${sp.name}${slotTxt}`, total: null, slot: key });
  };
  if (level === 0) return html`<button class="btn sm ghost" onClick=${() => doCast(null)} data-testid="cast">Lancia</button>`;
  const opts = castOptions(c, level, data.classes);
  return html`<span class="cs-pop-anchor">
    <button class="btn sm magic" onClick=${() => setOpen(!open)} disabled=${!opts.some((o) => o.left > 0)} data-testid="cast"
      title=${opts.some((o) => o.left > 0) ? 'Scegli lo slot da usare' : 'Nessuno slot disponibile'}>Lancia ▾</button>
    <${Popover} open=${open} onClose=${() => setOpen(false)} className="cs-cast-menu">
      <div class="cs-pop-title">Lancia ${sp.name}</div>
      ${opts.map((o) => html`<button class="cs-pop-item" disabled=${o.left <= 0} onClick=${() => doCast(o.key)} data-testid=${'cast-slot-' + o.key}>
        <span>${o.label}${o.level > level ? html` <span class="faint">(potenziato)</span>` : ''}</span><span class="faint">${o.left}/${o.max}</span></button>`)}
    </${Popover}>
  </span>`;
}

function SpellRow(props) {
  const { c, mutate, sp, data, units, onOpen } = props;
  const info = spellInfo(sp, data);
  const i = c.spellcasting.spells.findIndex((x) => x.id === sp.id);
  const prepared = sp.prepared || sp.alwaysPrepared;
  return html`<div class="cs-spell ${prepared ? 'prep' : ''}" data-testid="spell-row" data-spell=${sp.spellId || sp.name}>
    ${sp.level > 0
      ? html`<button class="cs-prep ${sp.alwaysPrepared ? 'always' : prepared ? 'on' : ''}" data-testid="spell-prepared"
          title=${sp.alwaysPrepared ? 'Sempre preparato' : prepared ? 'Preparato (clic per togliere)' : 'Non preparato (clic per preparare)'}
          onClick=${() => !sp.alwaysPrepared && mutate((d) => { d.spellcasting.spells[i].prepared = !prepared; })}></button>`
      : html`<span class="cs-prep cantrip" title="Trucchetto"></span>`}
    <button class="cs-spell-name" onClick=${onOpen} data-testid="spell-open">${sp.name}
      ${info && info.name !== sp.name ? html`<span class="faint cs-small"> ${info.name}</span>` : ''}</button>
    <span class="cs-spell-tags">
      ${!info && html`<span class="tag" title="Non presente nell'SRD: dati liberi">personalizzato</span>`}
      ${(info?.concentration) && html`<span class="tag magic" title="Concentrazione">C</span>`}
      ${(info?.ritual) && html`<span class="tag" title="Rituale">R</span>`}
      ${info && html`<span class="faint cs-small">${info.castingTime_it || info.castingTime} · ${info.rangeKind === 'feet' ? R.formatDistance(info.rangeFt, units) : R.convertDistancesInText(info.range, units)}</span>`}
      ${sp.notes && html`<span class="faint cs-small cs-ellipsis" title=${sp.notes}>${sp.notes}</span>`}
    </span>
    ${info?.attackType && html`<${RollBtn} bonus=${R.spellAttackBonus(c) || 0} onRoll=${(e) => rollCheck(c, `${sp.name} (attacco)`, R.spellAttackBonus(c) || 0, e, 'attack')} />`}
    <${CastButton} ...${props} info=${info} />
  </div>`;
}

function SpellDetail({ c, mutate, data, units, spellId, onClose }) {
  const i = c.spellcasting.spells.findIndex((x) => x.id === spellId);
  const sp = c.spellcasting.spells[i];
  if (!sp) return null;
  const info = spellInfo(sp, data);
  const set = (k, v) => mutate((d) => { d.spellcasting.spells[i] = { ...d.spellcasting.spells[i], [k]: v }; });
  const comp = info?.components ? [info.components.v && 'V', info.components.s && 'S', info.components.m && 'M'].filter(Boolean).join(', ') + (info.components.material ? ` (${info.components.material})` : '') : '';
  const dmg = info?.damage && !Array.isArray(info.damage) ? (info.damage.atSlotLevel?.[sp.level] || Object.values(info.damage.atCharacterLevel || {})[0]) : null;
  return html`<${Modal} open=${true} title=${sp.name} onClose=${onClose} wide>
    <div class="cs-spell-detail" data-testid="spell-detail">
      ${info ? html`<div class="cs-spell-meta">
          <span class="tag magic">${info.level === 0 ? 'Trucchetto' : `${info.level}° livello`} · ${info.school_it || info.school}</span>
          ${info.concentration && html`<span class="tag magic">Concentrazione</span>`}${info.ritual && html`<span class="tag">Rituale</span>`}
          <span class="tag">${info.source}</span><span class="faint">${info.name}</span>
        </div>
        <dl class="cs-dl">
          <dt>Tempo di lancio</dt><dd>${info.castingTime_it || info.castingTime}${info.castingTrigger ? ` (${info.castingTrigger})` : ''}</dd>
          <dt>Gittata</dt><dd>${R.convertDistancesInText(info.range, units)}</dd>
          <dt>Componenti</dt><dd>${comp}</dd>
          <dt>Durata</dt><dd>${info.duration_it || info.duration}</dd>
          ${info.dc && html`<dt>Tiro salvezza</dt><dd>${AB[info.dc.ability]?.name || info.dc.ability} (CD ${R.spellSaveDc(c) ?? '—'})${info.dc.success === 'half' ? ' — metà danni se riesce' : ''}</dd>`}
          ${dmg && html`<dt>Danni</dt><dd><button class="cs-roll dmg" onClick=${() => rollExpr(c, `${sp.name} danni`, dmg)}>${dmg}</button> ${info.damage.type || ''}</dd>`}
        </dl>
        <div class="prose">${String(R.convertDistancesInText(info.desc, units) || '').split('\n\n').map((p) => html`<p>${p}</p>`)}</div>
        ${info.higherLevel && html`<div class="prose"><p><b>A livelli superiori.</b> ${R.convertDistancesInText(info.higherLevel, units)}</p></div>`}`
      : html`<p class="muted">Incantesimo personalizzato (non presente nei dati SRD). Modifica liberamente nome, livello e note.</p>`}
      <div class="cs-form cs-form-4" style="margin-top:12px">
        <label class="field cs-span2"><span class="field-label">Nome</span><${Inline} value=${sp.name} onInput=${(v) => set('name', v)} /></label>
        <label class="field"><span class="field-label">Livello</span><${InlineNum} value=${sp.level} min=${0} max=${9} onInput=${(v) => set('level', v || 0)} /></label>
        <label class="field"><span class="field-label">Sempre preparato</span>
          <input type="checkbox" checked=${!!sp.alwaysPrepared} onChange=${(e) => set('alwaysPrepared', e.currentTarget.checked)} /></label>
        ${!info && html`<label class="field"><span class="field-label">Concentrazione</span>
          <input type="checkbox" checked=${!!sp.concentration} onChange=${(e) => set('concentration', e.currentTarget.checked)} /></label>`}
      </div>
      <${LazyText} label="Note" value=${sp.notes} rows=${3} onCommit=${(v) => set('notes', v)} />
      <div class="row" style="margin-top:12px"><span class="spacer"></span>
        <${ConfirmButton} onConfirm=${() => { mutate((d) => { d.spellcasting.spells.splice(i, 1); }); onClose(); }} confirmText="Rimuovere?">Rimuovi dalla scheda</${ConfirmButton}>
        <${Button} onClick=${onClose}>Chiudi</${Button}></div>
    </div>
  </${Modal}>`;
}

function AddSpellModal({ c, mutate, data, units, open, onClose }) {
  const [q, setQ] = useState('');
  const [lvl, setLvl] = useState('');
  const [scope, setScope] = useState('class');
  const [custom, setCustom] = useState({ name: '', level: 0 });
  const classIds = c.classes.map((e) => e.classId).filter(Boolean);
  const owned = new Set(c.spellcasting.spells.map((s) => s.spellId).filter(Boolean));
  const list = useMemo(() => {
    const nq = norm(q);
    return data.spells.filter((s) => (s._homebrew || !s.ruleset || s.ruleset === c.ruleset)
      && (scope === 'all' || !classIds.length || (s.classes || []).some((k) => classIds.includes(k)) || s._homebrew)
      && (lvl === '' || String(s.level) === lvl)
      && (!nq || norm(s.name).includes(nq) || norm(s.name_it).includes(nq)))
      .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name)).slice(0, 200);
  }, [q, lvl, scope, data.spells.length, c.ruleset, classIds.join()]);
  const add = (s) => {
    mutate((d) => { d.spellcasting.spells.push({ id: uid(), spellId: s.id, name: s.name_it || s.name, level: s.level, prepared: s.level === 0, alwaysPrepared: false, notes: '' }); });
    toast(`Aggiunto: ${s.name}`, 'magic');
  };
  const addCustom = () => {
    if (!custom.name.trim()) return;
    mutate((d) => { d.spellcasting.spells.push({ id: uid(), spellId: null, name: custom.name.trim(), level: Number(custom.level) || 0, prepared: true, alwaysPrepared: false, notes: '' }); });
    toast(`Aggiunto: ${custom.name}`, 'magic');
    setCustom({ name: '', level: 0 });
  };
  if (!open) return null;
  return html`<${Modal} open=${open} title="Aggiungi incantesimi" onClose=${onClose} wide>
    <div class="cs-addspell" data-testid="add-spell-modal">
      <div class="row">
        <${SearchBox} value=${q} onInput=${setQ} placeholder="Cerca per nome (inglese SRD)…" autofocus />
        <${Select} value=${lvl} onChange=${setLvl} options=${[{ value: '', label: 'Tutti i livelli' }, ...Array.from({ length: 10 }, (_, i) => ({ value: String(i), label: LEVEL_LABEL(i) }))]} />
        <${Select} value=${scope} onChange=${setScope} options=${[{ value: 'class', label: 'Della mia classe' }, { value: 'all', label: 'Tutte le classi' }]} data-testid="spell-scope" />
        <span class="faint cs-small">${list.length}${list.length === 200 ? '+' : ''} risultati</span>
      </div>
      <div class="cs-addspell-list">
        ${list.length ? list.map((s) => html`<div class="cs-addspell-row" data-testid="srd-spell" data-id=${s.id}>
          <span class="tag magic">${s.level === 0 ? 'T' : s.level + '°'}</span>
          <b>${s.name}</b>
          <span class="faint cs-small">${s.school_it} · ${s.castingTime_it || s.castingTime} · ${R.convertDistancesInText(s.range, units)}${s.concentration ? ' · C' : ''}${s.ritual ? ' · R' : ''}</span>
          <span class="spacer"></span>
          ${owned.has(s.id) ? html`<span class="tag good">sulla scheda</span>` : html`<button class="btn sm" onClick=${() => add(s)} data-testid="srd-spell-add">+ Aggiungi</button>`}
        </div>`) : html`<${Empty} title="Nessun incantesimo">Cambia ricerca o filtri (o scegli «Tutte le classi»).</${Empty}>`}
      </div>
      <div class="cs-addspell-custom row">
        <span class="field-label">Personalizzato</span>
        <${Inline} value=${custom.name} placeholder="Nome dell'incantesimo" onInput=${(v) => setCustom({ ...custom, name: v })} testid="custom-spell-name" />
        <select class="input cs-inline" value=${String(custom.level)} onChange=${(e) => setCustom({ ...custom, level: Number(e.currentTarget.value) })}>
          ${Array.from({ length: 10 }, (_, i) => html`<option value=${String(i)}>${LEVEL_LABEL(i)}</option>`)}</select>
        <${Button} onClick=${addCustom} data-testid="custom-spell-add">Aggiungi</${Button}>
      </div>
    </div>
  </${Modal}>`;
}

export function SpellsTab(ctx) {
  const { c, mutate, data } = ctx;
  const [q, setQ] = useState('');
  const [onlyPrep, setOnlyPrep] = useState(false);
  const [adding, setAdding] = useState(false);
  const [detail, setDetail] = useState(null);
  const slots = effectiveSlots(c, data.classes);
  const auto = c.spellcasting.slotsAuto !== false;
  const nq = norm(q);
  const spells = c.spellcasting.spells.filter((s) => (!nq || norm(s.name).includes(nq) || norm(spellInfo(s, data)?.name).includes(nq)) && (!onlyPrep || s.level === 0 || s.prepared || s.alwaysPrepared));
  const levels = [];
  for (let l = 0; l <= 9; l++) {
    const list = spells.filter((s) => (Number(s.level) || 0) === l).sort((a, b) => a.name.localeCompare(b.name, 'it'));
    const hasSlots = l > 0 && (slots.slots[l].max > 0 || !auto);
    if (list.length || hasSlots) levels.push({ l, list });
  }
  const anyUsed = Object.values(slots.slots).some((s) => s.used) || slots.pact.used;
  return html`<div class="cs-spells">
    <${SpellStats} ...${ctx} />
    <div class="cs-spell-toolbar row">
      <${SearchBox} value=${q} onInput=${setQ} placeholder="Filtra incantesimi della scheda…" />
      <label class="check"><input type="checkbox" checked=${onlyPrep} onChange=${(e) => setOnlyPrep(e.currentTarget.checked)} /><span>Solo preparati</span></label>
      <span class="spacer"></span>
      <label class="check" title="Slot massimi dalla tabella della classe (multiclasse inclusa); togli la spunta per valori manuali">
        <input type="checkbox" checked=${auto} data-testid="slots-auto" onChange=${(e) => mutate((d) => { d.spellcasting.slotsAuto = e.currentTarget.checked; return e.currentTarget.checked ? syncSlots(d, data.classes) : d; })} /><span>Slot automatici</span></label>
      <${Button} size="sm" disabled=${!anyUsed} data-testid="restore-slots" onClick=${() => mutate((d) => { for (let i = 1; i <= 9; i++) d.spellcasting.slots[i].used = 0; d.spellcasting.pact.used = 0; })}>↺ Ripristina slot</${Button}>
      <${Button} size="sm" variant="primary" onClick=${() => setAdding(true)} data-testid="add-spell">+ Aggiungi incantesimo</${Button}>
    </div>
    ${(slots.pact.max > 0 || (!auto && c.classes.some((e) => R.casterTypeOf(e, data.classes) === 'pact'))) && html`<div class="cs-pact" data-testid="pact-slots">
      <b>Magia del patto</b> <span class="muted">slot di ${slots.pact.level}° livello</span>
      <${Pips} max=${slots.pact.max} used=${slots.pact.used} tone="magic" onUse=${() => mutate((d) => useSlot(d, 'pact', data.classes).character)} onRestore=${() => mutate((d) => restoreSlot(d, 'pact', data.classes).character)} />
      <span class="faint cs-small">si recuperano con un riposo breve</span>
    </div>`}
    ${!levels.length && html`<${Empty} title="Nessun incantesimo">Aggiungi incantesimi dall'SRD o personalizzati.</${Empty}>`}
    <div class="cs-spell-levels">
      ${levels.map(({ l, list }) => html`<section class="cs-spell-level" data-testid=${'spell-level-' + l}>
        <header class="cs-spell-level-head"><h3>${LEVEL_LABEL(l)}</h3><span class="faint cs-small">${list.length}</span><span class="spacer"></span>
          ${l > 0 && html`<${SlotHeader} ...${ctx} level=${l} slots=${slots} />`}</header>
        ${list.length ? list.map((sp) => html`<${SpellRow} key=${sp.id} ...${ctx} sp=${sp} onOpen=${() => setDetail(sp.id)} />`) : html`<p class="faint cs-small cs-pad">Nessun incantesimo di questo livello.</p>`}
      </section>`)}
    </div>
    <${AddSpellModal} ...${ctx} open=${adding} onClose=${() => setAdding(false)} />
    ${detail && html`<${SpellDetail} ...${ctx} spellId=${detail} onClose=${() => setDetail(null)} />`}
  </div>`;
}
