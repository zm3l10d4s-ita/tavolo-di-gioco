// Sezione Bestiario: ricerca, filtri, scheda mostro, homebrew, aggiunta al combattimento.
// Route: #/bestiary/<monsterId>
import { isNarrow } from '../../lib/util.js';
import { html, useState, useEffect, useMemo, useRef } from '../../vendor/preact-htm.js';
import { Button, Select, NumberField, Empty, toast } from '../../components/ui.js';
import { StatBlock } from '../../components/statblock.js';
import { useSrd, useCollection } from '../../lib/hooks.js';
import { addMonsterToActiveCombat } from '../../lib/combat.js';
import {
  ENVIRONMENTS, SIZES, TYPES, SOURCES, CR_VALUES, crLabel, DEFAULT_FILTERS, applyMeta, searchAndSort,
} from './filter.js';
import { createHomebrew, setEnvironments, clearEnvironmentOverride } from './homebrew.js';
import { PasteImportModal } from '../../components/paste-import.js';
import { HomebrewEditor } from './editor.js';

const ROW_H = 54;
let memoFilters = { ...DEFAULT_FILTERS }; // filtri ricordati durante la sessione dell'app

const SORTS = [{ value: 'name', label: 'Nome' }, { value: 'cr', label: 'Grado di Sfida' }, { value: 'hp', label: 'Punti Ferita' }, { value: 'ac', label: 'Classe Armatura' }];
const crOptions = (empty) => [{ value: '', label: empty }, ...CR_VALUES.map((v) => ({ value: String(v), label: crLabel(v) }))];
const srcShort = (s) => (s === 'SRD 5.2' ? '5.2' : s === 'SRD 5.1' ? '5.1' : 'HB');
const srcTone = (s) => (s === 'SRD 5.2' ? 'magic' : s === 'SRD 5.1' ? 'accent' : 'good');

function Filters({ f, setF, total, shown }) {
  const set = (p) => setF({ ...f, ...p });
  const active = Object.keys(DEFAULT_FILTERS).some((k) => k !== 'sort' && k !== 'dir' && f[k] !== DEFAULT_FILTERS[k]);
  return html`<div class="bst-filters">
    <input class="input bst-search" type="search" placeholder="Cerca per nome o tipo… (es. goblin, drago)" value=${f.q}
      onInput=${(e) => set({ q: e.currentTarget.value })} data-testid="bestiary-search" autofocus />
    <button type="button" class="btn sm m-only m-filter-toggle ${active ? 'on' : ''}" onClick=${(e) => e.currentTarget.parentElement.classList.toggle('m-open')}>Filtri${active ? ' •' : ''}</button>
    <div class="bst-fgrid">
      <${Select} label="GS min" value=${f.crMin} options=${crOptions('—')} onChange=${(v) => set({ crMin: v })} data-testid="filter-cr-min" />
      <${Select} label="GS max" value=${f.crMax} options=${crOptions('—')} onChange=${(v) => set({ crMax: v })} data-testid="filter-cr-max" />
      <${Select} label="Tipo" value=${f.type} options=${[{ value: '', label: 'Tutti' }, ...TYPES.map((t) => ({ value: t.id, label: t.label }))]} onChange=${(v) => set({ type: v })} data-testid="filter-type" />
      <${Select} label="Taglia" value=${f.size} options=${[{ value: '', label: 'Tutte' }, ...SIZES.map((t) => ({ value: t.id, label: t.label }))]} onChange=${(v) => set({ size: v })} data-testid="filter-size" />
      <${Select} label="Ambiente" value=${f.env} options=${[{ value: '', label: 'Tutti' }, ...ENVIRONMENTS.map((t) => ({ value: t.id, label: t.label }))]} onChange=${(v) => set({ env: v })} data-testid="filter-env" />
      <${Select} label="Fonte" value=${f.source} options=${SOURCES.map((t) => ({ value: t.id, label: t.label }))} onChange=${(v) => set({ source: v })} data-testid="filter-source" />
    </div>
    <div class="row bst-frow">
      <label class="check"><input type="checkbox" checked=${f.legendary} onChange=${(e) => set({ legendary: e.currentTarget.checked })} data-testid="filter-legendary" /><span>Solo leggendari</span></label>
      <span class="spacer"></span>
      <span class="faint">Ordina</span>
      <select class="input bst-sort" value=${f.sort} onChange=${(e) => set({ sort: e.currentTarget.value })} data-testid="sort">
        ${SORTS.map((s) => html`<option value=${s.value}>${s.label}</option>`)}
      </select>
      <button class="btn sm" title=${f.dir === 'asc' ? 'Crescente' : 'Decrescente'} onClick=${() => set({ dir: f.dir === 'asc' ? 'desc' : 'asc' })} data-testid="sort-dir">${f.dir === 'asc' ? '↑' : '↓'}</button>
    </div>
    <div class="row bst-count">
      <span data-testid="result-count"><b>${shown}</b> <span class="faint">di ${total} creature</span></span>
      <span class="spacer"></span>
      ${active && html`<button class="btn ghost sm" onClick=${() => setF({ ...DEFAULT_FILTERS, sort: f.sort, dir: f.dir })} data-testid="filters-reset">Azzera filtri</button>`}
    </div>
  </div>`;
}

function MonsterList({ items, selectedId, onSelect, resetKey }) {
  const ref = useRef();
  const [top, setTop] = useState(0);
  const [h, setH] = useState(800);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    setH(el.clientHeight || 800);
    const ro = new ResizeObserver(() => setH(el.clientHeight || 800));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => { if (ref.current) { ref.current.scrollTop = 0; setTop(0); } }, [resetKey]);
  useEffect(() => {
    const el = ref.current; if (!el || !selectedId) return;
    const i = items.findIndex((m) => m.id === selectedId);
    if (i < 0) return;
    const y = i * ROW_H;
    if (y < el.scrollTop || y + ROW_H > el.scrollTop + el.clientHeight) { el.scrollTop = Math.max(0, y - el.clientHeight / 3); setTop(el.scrollTop); }
  }, [selectedId, items.length]);

  if (!items.length) return html`<div class="bst-list"><${Empty} title="Nessuna creatura">Prova a cambiare i filtri o la ricerca.</${Empty}></div>`;
  const start = Math.max(0, Math.floor(top / ROW_H) - 8);
  const end = Math.min(items.length, Math.ceil((top + h) / ROW_H) + 8);
  const onKey = (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const i = items.findIndex((m) => m.id === selectedId);
    const n = Math.max(0, Math.min(items.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)));
    onSelect(items[n].id);
  };
  return html`<div class="bst-list" ref=${ref} tabindex="0" onKeyDown=${onKey} onScroll=${(e) => setTop(e.currentTarget.scrollTop)} data-testid="monster-list">
    <div class="bst-list-inner" style=${`height:${items.length * ROW_H}px`}>
      ${items.slice(start, end).map((m, k) => {
        const i = start + k;
        return html`<div key=${m.id} class="bst-row ${m.id === selectedId ? 'selected' : ''}" style=${`top:${i * ROW_H}px;height:${ROW_H}px`}
          data-testid="monster-row" data-id=${m.id} onClick=${() => onSelect(m.id)}>
          <div class="bst-cr" title="Grado di Sfida"><span>GS</span>${m.cr}</div>
          <div class="bst-row-main">
            <div class="bst-row-name">${m.name}${m.legendaryActions?.length ? html`<span class="bst-leg" title="Azioni leggendarie">♛</span>` : ''}</div>
            <div class="bst-row-sub">${m.type_it || m.type} · ${m.size_it || m.size}</div>
          </div>
          <div class="bst-row-stats"><span title="Punti Ferita">PF <b>${m.hp}</b></span><span title="Classe Armatura">CA <b>${m.ac}</b></span></div>
          <span class="tag ${srcTone(m.source)} bst-src">${srcShort(m.source)}</span>
        </div>`;
      })}
    </div>
  </div>`;
}

function EnvEditor({ monster }) {
  const envs = monster.environments || [];
  const toggle = (id) => setEnvironments(monster, envs.includes(id) ? envs.filter((x) => x !== id) : ENVIRONMENTS.map((e) => e.id).filter((x) => x === id || envs.includes(x)));
  return html`<div class="bst-env" data-testid="env-editor">
    <span class="field-label">Ambienti</span>
    <div class="bst-env-chips">
      ${ENVIRONMENTS.map((e) => html`<button type="button" class="bst-chip ${envs.includes(e.id) ? 'on' : ''}" aria-pressed=${envs.includes(e.id)}
        onClick=${() => toggle(e.id)} data-testid="env-chip" data-env=${e.id}>${e.label}</button>`)}
    </div>
    <div class="bst-env-note faint">
      ${monster._homebrew ? 'Ambienti del tuo mostro homebrew.'
        : monster._envOverride ? html`Ambienti personalizzati da te. <button class="btn ghost sm" onClick=${() => clearEnvironmentOverride(monster)} data-testid="env-reset">Ripristina stima</button>`
        : 'Stima automatica (l\'SRD non indica gli ambienti): clicca per correggere.'}
    </div>
  </div>`;
}

function Detail({ monster, onEdit, onDuplicate, navigate }) {
  const [count, setCount] = useState(1);
  useEffect(() => setCount(1), [monster.id]);
  const add = () => {
    const s = addMonsterToActiveCombat(monster, count);
    toast(html`<div><b>${count > 1 ? `${count}× ` : ''}${monster.name}</b> aggiunt${count > 1 ? 'i' : 'o'} al combattimento</div>
      <div class="faint">${s.title || 'Sessione attiva'} · ${s.combat.combatants.length} combattenti</div>
      <button class="btn sm" style="margin-top:6px" onClick=${() => navigate('session')}>Vai alla sessione →</button>`, 'good');
  };
  return html`<div class="bst-detail-inner">
    <div class="bst-actions">
      <div class="bst-add">
        <${NumberField} value=${count} min=${1} max=${20} steppers onInput=${setCount} data-testid="add-count" />
        <${Button} variant="primary" onClick=${add} data-testid="add-to-combat">⚔ Aggiungi al combattimento</${Button}>
      </div>
      <span class="spacer"></span>
      ${monster._homebrew
        ? html`<${Button} onClick=${() => onEdit(monster._hbId)} data-testid="edit-homebrew">✎ Modifica</${Button}>
               <${Button} onClick=${() => onDuplicate(monster)} title="Crea una copia modificabile">⧉ Duplica</${Button}>`
        : html`<${Button} onClick=${() => onDuplicate(monster)} title="Crea una copia homebrew modificabile" data-testid="duplicate-homebrew">⧉ Duplica come homebrew</${Button}>`}
    </div>
    <${EnvEditor} monster=${monster} />
    <${StatBlock} monster=${monster} />
    <p class="bst-attrib faint">${monster.source === 'Homebrew' ? 'Contenuto creato dall\'utente.' : `${monster.source} · Wizards of the Coast · CC-BY-4.0`}</p>
  </div>`;
}

export default function BestiaryView({ params = [], navigate }) {
  const { items, loading, error } = useSrd('monsters');
  const metas = useCollection('homebrew', (h) => h.kind === 'monsterMeta');
  const metaKey = metas.map((h) => h.id + h.updatedAt).join('|');
  const monsters = useMemo(() => applyMeta(items, metas), [items, metaKey]);
  const [f, setFState] = useState(memoFilters);
  const [paste, setPaste] = useState(false);
  const setF = (nf) => { memoFilters = nf; setFState(nf); };
  const list = useMemo(() => searchAndSort(monsters, f), [monsters, f]);
  const [editing, setEditing] = useState(null);

  const selectedId = params[0] || null;
  const selected = selectedId ? monsters.find((m) => m.id === selectedId) : null;
  const select = (id) => navigate('bestiary', id);

  // Senza selezione, apri il primo risultato (comodo con la tastiera)
  useEffect(() => {
    if (!selectedId && list.length && !loading && !isNarrow()) location.replace('#/bestiary/' + encodeURIComponent(list[0].id));
  }, [selectedId, loading, list.length > 0]);

  const duplicate = (m) => { const id = createHomebrew(m); navigate('bestiary', id); setEditing(id); };
  const createNew = () => { const id = createHomebrew(null); navigate('bestiary', id); setEditing(id); };
  const resetKey = JSON.stringify({ ...f, q: f.q.trim() });

  return html`<div class="view bst-view">
    <div class="view-head">
      <h1>Bestiario</h1>
      <span class="faint">${loading ? 'Caricamento…' : `${monsters.length} creature · SRD 5.1, SRD 5.2 e homebrew`}</span>
      <${Button} onClick=${() => setPaste(true)} data-testid="monster-paste">Incolla blocco statistiche</${Button}>
      <${Button} onClick=${createNew} data-testid="new-monster">+ Nuovo mostro</${Button}>
    </div>
    ${error && html`<${Empty} title="Errore nel caricamento">${error}</${Empty}>`}
    <div class="bst-layout">
      <section class="bst-side panel">
        <${Filters} f=${f} setF=${setF} total=${monsters.length} shown=${list.length} />
        <${MonsterList} items=${list} selectedId=${selectedId} onSelect=${select} resetKey=${resetKey} />
      </section>
      <section class="bst-detail" data-testid="monster-detail">
        ${selected ? html`<${Detail} monster=${selected} onEdit=${setEditing} onDuplicate=${duplicate} navigate=${navigate} />`
          : loading ? html`<div class="faint">Caricamento…</div>`
          : selectedId ? html`<${Empty} title="Creatura non trovata">Il mostro «${selectedId}» non esiste (forse è stato eliminato).</${Empty}>`
          : html`<${Empty} title="Seleziona una creatura">Scegli un mostro dall'elenco per vederne la scheda.</${Empty}>`}
      </section>
    </div>
    ${editing && html`<${HomebrewEditor} hbId=${editing} onClose=${() => setEditing(null)}
      onDeleted=${() => { setEditing(null); navigate('bestiary'); }} />`}
    <${PasteImportModal} open=${paste} dataset="monsters" onClose=${() => setPaste(false)} onSaved=${(id) => setTimeout(() => navigate('bestiary', id), 80)} />
  </div>`;
}
