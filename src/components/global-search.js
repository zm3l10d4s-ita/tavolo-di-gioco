// Ricerca globale (Ctrl+K): personaggi, mostri, incantesimi, equipaggiamento e oggetti magici.
import { html, useState, useEffect, useRef, useMemo } from '../vendor/preact-htm.js';
import { Icon } from './icons.js';
import * as srd from '../lib/srd.js';
import * as store from '../lib/store.js';
import { norm } from '../lib/util.js';
import { navigate } from '../lib/router.js';

const GROUPS = [
  { id: 'characters', label: 'Personaggi', icon: 'users' },
  { id: 'monsters', label: 'Mostri', icon: 'skull', section: 'bestiary' },
  { id: 'spells', label: 'Incantesimi', icon: 'sparkles', section: 'spells' },
  { id: 'equipment', label: 'Equipaggiamento', icon: 'backpack', section: 'equipment' },
  { id: 'magicItems', label: 'Oggetti magici', icon: 'crown', section: 'equipment' },
];
const PER_GROUP = 6;

function sub(kind, x) {
  if (kind === 'characters') return [x.race?.name, (x.classes || []).map((c) => `${c.name || c.classId} ${c.level}`).join(' / ')].filter(Boolean).join(' · ');
  if (kind === 'monsters') return `GS ${x.cr} · ${x.type_it || x.type || ''}`;
  if (kind === 'spells') return `${x.level ? `${x.level}° livello` : 'Trucchetto'} · ${x.school_it || x.school || ''}`;
  if (kind === 'equipment') return x.subcategory_it || x.category_it || '';
  if (kind === 'magicItems') return [x.type_it, x.rarity_it].filter(Boolean).join(', ');
  return '';
}

export function GlobalSearch({ open, onClose }) {
  const [q, setQ] = useState('');
  const [data, setData] = useState({});
  const [hi, setHi] = useState(0);
  const ref = useRef();
  useEffect(() => {
    if (!open) return;
    setQ(''); setHi(0);
    setTimeout(() => ref.current?.focus(), 0);
    Promise.all(['monsters', 'spells', 'equipment', 'magicItems'].map((n) => srd.load(n).then((items) => [n, items])))
      .then((pairs) => setData(Object.fromEntries(pairs)));
  }, [open]);
  const flat = useMemo(() => {
    const s = norm(q.trim());
    if (!s) return [];
    const out = [];
    for (const g of GROUPS) {
      const items = g.id === 'characters' ? store.list('characters') : (data[g.id] || []);
      const starts = [], has = [];
      for (const x of items) {
        const n = norm(x.name) + ' ' + norm(x.name_it || '');
        if (norm(x.name).startsWith(s) || norm(x.name_it || '').startsWith(s)) starts.push(x); else if (n.includes(s)) has.push(x);
      }
      const pick = [...starts, ...has].slice(0, PER_GROUP);
      for (const x of pick) out.push({ g, x });
    }
    return out;
  }, [q, data]);
  useEffect(() => setHi(0), [q]);
  if (!open) return null;
  const go = (r) => {
    if (!r) return;
    onClose();
    if (r.g.id === 'magicItems') navigate('equipment', 'magic', r.x.id);
    else navigate(r.g.section || r.g.id, r.x.id);
  };
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(flat.length - 1, h + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); go(flat[hi]); }
    else if (e.key === 'Escape') onClose();
  };
  let lastGroup = null;
  return html`<div class="modal-backdrop gs-backdrop" onClick=${(e) => e.target === e.currentTarget && onClose()}>
    <div class="gs" role="dialog" aria-label="Ricerca globale" data-testid="global-search">
      <div class="gs-input"><${Icon} name="search" size=${19} />
        <input ref=${ref} value=${q} placeholder="Cerca mostri, incantesimi, oggetti, personaggi…" onInput=${(e) => setQ(e.currentTarget.value)} onKeyDown=${onKey} data-testid="global-search-input" />
        <kbd>Esc</kbd></div>
      <div class="gs-results">
        ${!q.trim() && html`<div class="gs-hint faint">Digita per cercare in tutto il manuale. ↑↓ per scegliere, Invio per aprire.</div>`}
        ${q.trim() && !flat.length && html`<div class="gs-hint faint">Nessun risultato per «${q}».</div>`}
        ${flat.map((r, i) => {
          const head = r.g !== lastGroup ? html`<div class="gs-group">${r.g.label}</div>` : null;
          lastGroup = r.g;
          return html`${head}<button class="gs-item ${i === hi ? 'hi' : ''}" onMouseEnter=${() => setHi(i)} onClick=${() => go(r)} data-testid="global-search-item" data-kind=${r.g.id} data-id=${r.x.id}>
            <${Icon} name=${r.g.icon} size=${16} />
            <span class="gs-name">${r.x.name}${r.x.name_it ? html` <small>${r.x.name_it}</small>` : ''}</span>
            <span class="gs-sub">${sub(r.g.id, r.x)}</span>
            ${r.x.source && html`<span class="tag ${r.x.source === 'SRD 5.2' ? 'magic' : r.x.source === 'Homebrew' ? 'good' : 'accent'}">${r.x.source === 'SRD 5.2' ? '5.2' : r.x.source === 'Homebrew' ? 'HB' : '5.1'}</span>`}
          </button>`;
        })}
      </div>
    </div>
  </div>`;
}
