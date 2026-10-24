// Sezione Incantesimi: ricerca e filtri, lista, dettaglio completo (distanze in metri), aggiunta a un personaggio, homebrew.
// Route: #/spells/<id | nome>[/<ruleset>]
import { html, useState, useEffect, useMemo, useRef } from '../../vendor/preact-htm.js';
import { Button, Select, Empty, toast } from '../../components/ui.js';
import { Icon } from '../../components/icons.js';
import { Prose } from '../../components/prose.js';
import { PickCharacterModal } from '../../components/pick-character.js';
import { StubBanner, PasteImportModal } from '../../components/paste-import.js';
import { useSrd, useDoc, useCollection } from '../../lib/hooks.js';
import * as store from '../../lib/store.js';
import { norm, uid, isNarrow } from '../../lib/util.js';
import { SpellEditor } from './editor.js';
import {
  SCHOOLS, CASTER_CLASSES, CLASS_IT, levelLabel, levelLong, rangeText, componentsText, spellClassKeys, sourceTone, sourceShort, SCHOOL_IT, matchSource, attributionText,
} from './format.js';

const DEFAULTS = { q: '', level: '', school: '', cls: '', source: '', conc: '', ritual: '', v: 0, s: 0, m: 0, sort: 'level' };
let memo = { ...DEFAULTS };

/** Stato componente: 0 indifferente, 1 richiesta, -1 esclusa. */
function CompChip({ label, state, onChange, title }) {
  const next = state === 0 ? 1 : state === 1 ? -1 : 0;
  const t = state === 1 ? `con ${title}` : state === -1 ? `senza ${title}` : `${title}: indifferente`;
  return html`<button type="button" class="comp-chip s${state}" title=${t + ' (clic per cambiare)'} onClick=${() => onChange(next)} data-testid=${'comp-' + label.toLowerCase()}>${label}</button>`;
}

function matches(sp, f, q) {
  if (q) {
    const n = norm(sp.name) + ' ' + norm(sp.name_it || '');
    if (!n.includes(q)) return false;
  }
  if (f.level !== '' && Number(sp.level) !== Number(f.level)) return false;
  if (f.school && sp.school !== f.school) return false;
  if (f.cls && !spellClassKeys(sp).includes(f.cls)) return false;
  if (!matchSource(sp, f.source)) return false;
  if (f.conc && !!sp.concentration !== (f.conc === 'yes')) return false;
  if (f.ritual && !!sp.ritual !== (f.ritual === 'yes')) return false;
  const c = sp.components || {};
  for (const k of ['v', 's', 'm']) { if (f[k] === 1 && !c[k]) return false; if (f[k] === -1 && c[k]) return false; }
  return true;
}

function Filters({ f, setF, shown, total }) {
  const set = (p) => setF({ ...f, ...p });
  const dirty = Object.keys(DEFAULTS).some((k) => k !== 'sort' && f[k] !== DEFAULTS[k]);
  return html`<div class="sp-filters">
    <input class="input sp-search" type="search" placeholder="Cerca incantesimo… (es. palla di fuoco, fireball)" value=${f.q}
      onInput=${(e) => set({ q: e.currentTarget.value })} data-testid="spell-search" autofocus />
    <button type="button" class="btn sm m-only m-filter-toggle ${dirty ? 'on' : ''}" onClick=${(e) => e.currentTarget.parentElement.classList.toggle('m-open')}>Filtri${dirty ? ' •' : ''}</button>
    <div class="sp-fgrid">
      <${Select} label="Livello" value=${f.level} onChange=${(v) => set({ level: v })} data-testid="spell-filter-level"
        options=${[{ value: '', label: 'Tutti' }, { value: '0', label: 'Trucchetti' }, ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((l) => ({ value: String(l), label: `${l}° livello` }))]} />
      <${Select} label="Scuola" value=${f.school} onChange=${(v) => set({ school: v })} options=${[{ value: '', label: 'Tutte' }, ...SCHOOLS.map((s) => ({ value: s.id, label: s.label }))]} data-testid="spell-filter-school" />
      <${Select} label="Classe" value=${f.cls} onChange=${(v) => set({ cls: v })} options=${[{ value: '', label: 'Tutte' }, ...CASTER_CLASSES.map((c) => ({ value: c.id, label: c.label }))]} data-testid="spell-filter-class" />
      <${Select} label="Fonte" value=${f.source} onChange=${(v) => set({ source: v })} data-testid="spell-filter-source"
        options=${[{ value: '', label: 'Tutte' }, { value: 'SRD 5.1', label: 'SRD 5.1 (2014)' }, { value: 'SRD 5.2', label: 'SRD 5.2 (2024)' }, { value: '__books', label: 'Manuali (catalogo)' }, { value: '__stub', label: 'Da completare' }, { value: '__done', label: 'Completati da me' }, { value: 'Homebrew', label: 'Creati da me' }]} />
      <${Select} label="Concentrazione" value=${f.conc} onChange=${(v) => set({ conc: v })} options=${[{ value: '', label: 'Indifferente' }, { value: 'yes', label: 'Sì' }, { value: 'no', label: 'No' }]} data-testid="spell-filter-conc" />
      <${Select} label="Rituale" value=${f.ritual} onChange=${(v) => set({ ritual: v })} options=${[{ value: '', label: 'Indifferente' }, { value: 'yes', label: 'Sì' }, { value: 'no', label: 'No' }]} data-testid="spell-filter-ritual" />
    </div>
    <div class="row sp-frow">
      <span class="field-label">Componenti</span>
      <${CompChip} label="V" title="componente verbale" state=${f.v} onChange=${(v) => set({ v })} />
      <${CompChip} label="S" title="componente somatica" state=${f.s} onChange=${(v) => set({ s: v })} />
      <${CompChip} label="M" title="componente materiale" state=${f.m} onChange=${(v) => set({ m: v })} />
      <span class="spacer"></span>
      <select class="input sp-sort" value=${f.sort} onChange=${(e) => set({ sort: e.currentTarget.value })} title="Ordinamento">
        <option value="level">Per livello</option><option value="name">Per nome</option>
      </select>
    </div>
    <div class="row sp-count">
      <span data-testid="spell-count"><b>${shown}</b> <span class="faint">di ${total} incantesimi</span></span>
      <span class="spacer"></span>
      ${dirty && html`<button class="btn ghost sm" onClick=${() => setF({ ...DEFAULTS, sort: f.sort })}>Azzera filtri</button>`}
    </div>
  </div>`;
}

function SpellRow({ sp, selected, onSelect }) {
  return html`<button class="sp-row ${selected ? 'selected' : ''}" onClick=${() => onSelect(sp.id)} data-testid="spell-row" data-id=${sp.id}>
    <span class="sp-lvl ${Number(sp.level) ? '' : 'cantrip'}" title=${Number(sp.level) ? `${sp.level}° livello` : 'Trucchetto'}>${levelLabel(sp.level)}</span>
    <span class="sp-row-main">
      <span class="sp-row-name">${sp.name_it || sp.name}${sp.name_it ? html` <small>${sp.name}</small>` : ''}</span>
      <span class="sp-row-sub">${sp.school_it || SCHOOL_IT[sp.school] || ''} · ${sp.castingTime_it || sp.castingTime || ''}</span>
    </span>
    <span class="sp-flags">${sp.concentration && html`<span class="flag" title="Concentrazione">C</span>`}${sp.ritual && html`<span class="flag" title="Rituale">R</span>`}</span>
    <span class="tag ${sourceTone(sp)}">${sourceShort(sp)}</span>
  </button>`;
}

function addToCharacter(ch, sp) {
  store.update('characters', ch.id, (c) => {
    const sc = c.spellcasting || { ability: null, saveDcOverride: null, attackOverride: null, slots: {}, pact: { level: 0, max: 0, used: 0 }, spells: [] };
    const spells = [...(sc.spells || []), { id: uid(), spellId: sp.id, name: sp.name_it || sp.name, level: Number(sp.level) || 0, prepared: false, alwaysPrepared: false, notes: '' }];
    return { ...c, spellcasting: { ...sc, spells } };
  });
}

function Detail({ sp, units, navigate, onEdit, onDuplicate }) {
  const [pick, setPick] = useState(false);
  const comp = componentsText(sp);
  const classes = spellClassKeys(sp);
  return html`<article class="sp-detail-card" data-testid="spell-detail" data-id=${sp.id}>
    <header class="sp-dhead">
      <div>
        <h2>${sp.name_it || sp.name}</h2>
        ${sp.name_it && html`<div class="faint">${sp.name}</div>`}
        <div class="sp-sub">${levelLong(sp)}${sp.ritual ? ' (rituale)' : ''}</div>
      </div>
      <span class="spacer"></span>
      <span class="tag ${sourceTone(sp)}">${sp.source || 'SRD'}</span>
    </header>
    <${StubBanner} dataset="spells" item=${sp} />
    <div class="sp-actions">
      <${Button} variant="primary" onClick=${() => setPick(true)} data-testid="spell-add-to-character"><${Icon} name="plus" size=${16} /> Aggiungi a personaggio…</${Button}>
      <span class="spacer"></span>
      ${sp._homebrew
        ? html`<${Button} onClick=${() => onEdit(sp._hbId)} data-testid="spell-edit"><${Icon} name="edit" size=${15} /> Modifica</${Button}>`
        : sp.stub ? null : html`<${Button} variant="ghost" onClick=${() => onDuplicate(sp)} title="Crea una copia homebrew modificabile">Duplica come homebrew</${Button}>`}
    </div>
    <dl class="sp-props">
      <div><dt>Tempo di lancio</dt><dd>${sp.castingTime_it || sp.castingTime || '—'}${sp.castingTrigger ? html`<small class="faint"> (${sp.castingTrigger})</small>` : ''}</dd></div>
      <div><dt>Gittata</dt><dd data-testid="spell-range">${rangeText(sp, units)}</dd></div>
      <div><dt>Componenti</dt><dd>${comp.short}${comp.material && html`<small class="faint"> (${comp.material})</small>`}</dd></div>
      <div><dt>Durata</dt><dd>${sp.concentration ? html`<span class="tag magic">Concentrazione</span> ` : ''}${sp.duration_it || sp.duration || '—'}</dd></div>
    </dl>
    ${classes.length > 0 && html`<div class="sp-classes"><span class="field-label">Classi</span>${classes.map((c) => html`<span class="tag">${CLASS_IT[c] || c}</span>`)}</div>`}
    <div class="sp-body">
      <${Prose} text=${sp.desc} units=${units} />
      ${sp.higherLevel && html`<div class="sp-higher"><h4>Ai livelli superiori</h4><${Prose} text=${sp.higherLevel} units=${units} /></div>`}
    </div>
    <p class="sp-attrib faint">${attributionText(sp)}</p>
    <${PickCharacterModal} open=${pick} title=${`Aggiungi «${sp.name_it || sp.name}» a…`} onClose=${() => setPick(false)}
      isDisabled=${(ch) => ((ch.spellcasting?.spells || []).some((x) => x.spellId === sp.id) ? 'già presente' : null)}
      note="L'incantesimo viene aggiunto alla lista della scheda (non preparato)."
      onPick=${(ch) => {
        addToCharacter(ch, sp); setPick(false);
        toast(html`<div><b>${sp.name_it || sp.name}</b> aggiunto a ${ch.name}</div><button class="btn sm" style="margin-top:6px" onClick=${() => navigate('characters', ch.id)}>Apri scheda →</button>`, 'magic');
      }} />
  </article>`;
}

export default function SpellsView({ params = [], navigate }) {
  const { items, loading, error } = useSrd('spells');
  const [settings] = useDoc('settings', 'app');
  useCollection('characters');
  const units = settings?.units || 'm';
  const [f, setFState] = useState(memo);
  const setF = (x) => { memo = x; setFState(x); };
  const [editor, setEditor] = useState(null); // { hb, base } | null
  const [paste, setPaste] = useState(false);
  const listRef = useRef();

  const q = norm(f.q.trim());
  const list = useMemo(() => {
    const out = items.filter((sp) => matches(sp, f, q));
    const byName = (a, b) => (a.name_it || a.name).localeCompare(b.name_it || b.name, 'it') || String(a.source).localeCompare(String(b.source));
    if (f.sort === 'name') out.sort(byName);
    else out.sort((a, b) => (Number(a.level) || 0) - (Number(b.level) || 0) || byName(a, b));
    if (q) { // a parità di ordinamento, prima i nomi che iniziano con la ricerca
      const starts = (s) => norm(s.name).startsWith(q) || norm(s.name_it || '').startsWith(q);
      out.sort((a, b) => starts(b) - starts(a));
    }
    return out;
  }, [items, f]);

  // Risoluzione per nome (#/spells/Fireball o #/spells/palla%20di%20fuoco/2014)
  const param = params[0] || null;
  let selected = param ? items.find((s) => s.id === param) : null;
  useEffect(() => {
    if (!param || selected || loading || !items.length) return;
    const n = norm(param);
    const cands = items.filter((s) => norm(s.name) === n || norm(s.name_it || '') === n);
    const rs = params[1] || store.getSetting('ruleset', null);
    const hit = cands.find((s) => rs && s.ruleset === rs) || cands[0];
    if (hit) location.replace('#/spells/' + encodeURIComponent(hit.id));
  }, [param, loading, items.length]);
  useEffect(() => {
    if (!param && list.length && !loading && !isNarrow()) location.replace('#/spells/' + encodeURIComponent(list[0].id));
  }, [param, loading, list.length > 0]);
  useEffect(() => {
    const el = listRef.current?.querySelector('.sp-row.selected');
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [selected?.id]);

  const onKey = (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const i = list.findIndex((s) => s.id === selected?.id);
    const n = Math.max(0, Math.min(list.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)));
    if (list[n]) navigate('spells', list[n].id);
  };

  return html`<div class="view sp-view" data-testid="spells-view">
    <div class="view-head">
      <h1>Incantesimi</h1>
      <span class="faint">${loading ? 'Caricamento…' : `${items.length} incantesimi · SRD 5.1, SRD 5.2 e homebrew`}</span>
      <${Button} onClick=${() => setPaste(true)} data-testid="spell-paste"><${Icon} name="edit" size=${15} /> Incolla testo</${Button}>
      <${Button} onClick=${() => setEditor({ hb: null, base: null })} data-testid="spell-new"><${Icon} name="plus" size=${16} /> Nuovo incantesimo</${Button}>
    </div>
    ${error && html`<${Empty} title="Errore nel caricamento">${error}</${Empty}>`}
    <div class="sp-layout">
      <section class="panel sp-side">
        <${Filters} f=${f} setF=${setF} shown=${list.length} total=${items.length} />
        <div class="sp-list" ref=${listRef} tabindex="0" onKeyDown=${onKey} data-testid="spell-list">
          ${list.length ? list.map((sp) => html`<${SpellRow} key=${sp.id} sp=${sp} selected=${sp.id === selected?.id} onSelect=${(id) => navigate('spells', id)} />`)
            : !loading && html`<${Empty} title="Nessun incantesimo">Prova a cambiare i filtri o la ricerca.</${Empty}>`}
        </div>
      </section>
      <section class="sp-detail">
        ${selected ? html`<${Detail} key=${selected.id} sp=${selected} units=${units} navigate=${navigate}
            onEdit=${(hbId) => setEditor({ hb: store.get('homebrew', hbId), base: null })}
            onDuplicate=${(sp) => setEditor({ hb: null, base: { ...sp, name: `${sp.name} (homebrew)`, id: undefined, _homebrew: undefined, _hbId: undefined } })} />`
          : loading ? html`<div class="faint">Caricamento…</div>`
          : param ? html`<${Empty} title="Incantesimo non trovato">Nessun incantesimo corrisponde a «${param}».</${Empty}>`
          : html`<${Empty} title="Seleziona un incantesimo">Scegli un incantesimo dall'elenco.</${Empty}>`}
      </section>
    </div>
    ${editor && html`<${SpellEditor} open hb=${editor.hb} base=${editor.base} units=${units} onClose=${() => setEditor(null)}
      onSaved=${(id) => id ? setTimeout(() => navigate('spells', id), 50) : navigate('spells')} />`}
    <${PasteImportModal} open=${paste} dataset="spells" onClose=${() => setPaste(false)} onSaved=${(id) => setTimeout(() => navigate('spells', id), 80)} />
  </div>`;
}
