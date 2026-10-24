import { isNarrow } from '../../lib/util.js';
// Diario: elenco voci della campagna + editor con autosave, generazione bozza dal log di sessione.
import { html, useState, useEffect, useMemo } from '../../vendor/preact-htm.js';
import { Button, Modal, ConfirmButton, Empty, toast } from '../../components/ui.js';
import { Icon } from '../../components/icons.js';
import { useCollection, useDoc, useDebouncedCommit } from '../../lib/hooks.js';
import * as store from '../../lib/store.js';
import { norm, nowIso } from '../../lib/util.js';
import { sessionsOf } from '../../lib/campaign.js';
import { journalDraftFromLog } from '../../lib/session-core.js';

let memoSort = 'desc';
const fmtDate = (d) => (d ? new Date(d + 'T12:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Senza data');

export function createEntry(campaign, extra = {}) {
  return store.put('journal', { campaignId: campaign.id, sessionId: null, date: nowIso().slice(0, 10), title: 'Nuova voce', body: '', tags: [], ...extra });
}

export function createEntryFromSession(campaign, session) {
  const title = `Sessione ${session.number}${session.title && session.title !== `Sessione ${session.number}` ? ` — ${session.title}` : ''}`;
  return createEntry(campaign, { sessionId: session.id, date: session.date || nowIso().slice(0, 10), title,
    body: journalDraftFromLog(session, { campaignName: campaign.name }), tags: ['sessione'] });
}

function FromLogModal({ open, campaign, onClose, onCreated }) {
  useCollection('sessions');
  if (!open) return null;
  const sessions = sessionsOf(campaign.id);
  return html`<${Modal} open title="Crea voce dal log di una sessione" onClose=${onClose}>
    ${sessions.length ? html`<div class="pick-list" data-testid="from-log-list">
      ${sessions.map((s) => {
        const notes = (s.log || []).filter((e) => e.type === 'note').length;
        return html`<button class="pick-item" onClick=${() => { const e = createEntryFromSession(campaign, s); onCreated(e); onClose(); }} data-testid="from-log-session" data-id=${s.id}>
          <span class="pick-avatar">${s.number}</span>
          <span class="pick-main"><b>${s.title}</b><small>${fmtDate(s.date)} · ${(s.log || []).length} voci di log · ${notes} note</small></span>
          ${s.status === 'active' && html`<span class="tag accent">in corso</span>`}
        </button>`;
      })}
    </div>` : html`<${Empty} title="Nessuna sessione">Questa campagna non ha ancora sessioni.</${Empty}>`}
    <p class="faint" style="margin:10px 0 0">La bozza raccoglie note, eventi di combattimento e KO; il riassunto lo scrivi tu.</p>
  </${Modal}>`;
}

function TagsInput({ tags, onChange }) {
  const [v, setV] = useState('');
  const add = () => { const t = v.trim().replace(/,$/, ''); if (t && !tags.includes(t)) onChange([...tags, t]); setV(''); };
  return html`<div class="tags-input">
    ${tags.map((t) => html`<span class="tag accent">${t}<button onClick=${() => onChange(tags.filter((x) => x !== t))} title="Rimuovi"><${Icon} name="x" size=${11} /></button></span>`)}
    <input class="input" value=${v} placeholder="+ tag" onInput=${(e) => setV(e.currentTarget.value)} data-testid="journal-tag-input"
      onKeyDown=${(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); } else if (e.key === 'Backspace' && !v && tags.length) onChange(tags.slice(0, -1)); }} onBlur=${add} />
  </div>`;
}

function EntryEditor({ entry, campaign, onDeleted, navigate }) {
  const [, patch] = useDoc('journal', entry.id);
  useCollection('sessions');
  const [title, setTitle] = useDebouncedCommit(entry.title || '', (v) => patch({ title: v }), 300);
  const [body, setBody] = useDebouncedCommit(entry.body || '', (v) => patch({ body: v }), 400);
  const sessions = sessionsOf(campaign.id);
  const words = (body.trim().match(/\S+/g) || []).length;
  return html`<article class="jr-editor" data-testid="journal-editor" data-id=${entry.id}>
    <input class="jr-title" value=${title} onInput=${(e) => setTitle(e.currentTarget.value)} placeholder="Titolo" data-testid="journal-title" />
    <div class="jr-meta">
      <label class="field"><span class="field-label">Data</span>
        <input class="input" type="date" value=${entry.date || ''} onInput=${(e) => patch({ date: e.currentTarget.value })} data-testid="journal-date" /></label>
      <label class="field"><span class="field-label">Sessione</span>
        <select class="input" value=${entry.sessionId || ''} onChange=${(e) => patch({ sessionId: e.currentTarget.value || null })} data-testid="journal-session">
          <option value="">— nessuna —</option>${sessions.map((s) => html`<option value=${s.id}>${s.title}</option>`)}</select></label>
      <div class="field jr-tags"><span class="field-label">Tag</span><${TagsInput} tags=${entry.tags || []} onChange=${(t) => patch({ tags: t })} /></div>
    </div>
    <textarea class="input jr-body" value=${body} onInput=${(e) => setBody(e.currentTarget.value)}
      placeholder="Racconta cosa è successo: luoghi, incontri, PNG, indizi, bottino…" data-testid="journal-body"></textarea>
    <div class="row jr-foot">
      <span class="faint">${words} parole · salvataggio automatico</span>
      ${entry.sessionId && html`<${Button} size="sm" variant="ghost" onClick=${() => navigate('session')}><${Icon} name="swords" size=${14} /> Sessione</${Button}>`}
      <span class="spacer"></span>
      <${ConfirmButton} confirmText="Eliminare la voce?" onConfirm=${() => { store.remove('journal', entry.id); onDeleted(); }}><${Icon} name="trash" size=${14} /> Elimina</${ConfirmButton}>
    </div>
  </article>`;
}

export function JournalEntries({ campaign, entryId, navigate }) {
  const all = useCollection('journal', (j) => j.campaignId === campaign.id);
  const [q, setQ] = useState('');
  const [sort, setSortState] = useState(memoSort);
  const [fromLog, setFromLog] = useState(false);
  const setSort = (s) => { memoSort = s; setSortState(s); };
  const nq = norm(q.trim());
  const list = useMemo(() => all
    .filter((j) => !nq || norm(j.title).includes(nq) || norm(j.body).includes(nq) || (j.tags || []).some((t) => norm(t).includes(nq)))
    .sort((a, b) => {
      const d = String(a.date || '').localeCompare(String(b.date || '')) || String(a.createdAt).localeCompare(String(b.createdAt));
      return sort === 'asc' ? d : -d;
    }), [all.map((j) => j.id + j.updatedAt).join(), nq, sort]);
  const selected = entryId ? all.find((j) => j.id === entryId) : null;
  useEffect(() => { if (!entryId && list.length && !isNarrow()) location.replace('#/journal/' + encodeURIComponent(list[0].id)); }, [entryId, list.length > 0, campaign.id]);
  const open = (id) => navigate('journal', id);
  const snippet = (b) => String(b || '').replace(/\s+/g, ' ').slice(0, 110);
  return html`<div class="jr-layout">
    <section class="panel jr-side">
      <div class="jr-tools">
        <input class="input" type="search" placeholder="Cerca nel diario…" value=${q} onInput=${(e) => setQ(e.currentTarget.value)} data-testid="journal-search" />
        <button class="btn sm ghost" onClick=${() => setSort(sort === 'asc' ? 'desc' : 'asc')} title="Ordine cronologico" data-testid="journal-sort">
          ${sort === 'asc' ? 'Dalla più vecchia' : 'Dalla più recente'}</button>
      </div>
      <div class="row jr-actions">
        <${Button} variant="primary" size="sm" onClick=${() => open(createEntry(campaign).id)} data-testid="journal-new"><${Icon} name="plus" size=${15} /> Nuova voce</${Button}>
        <${Button} size="sm" onClick=${() => setFromLog(true)} data-testid="journal-from-log"><${Icon} name="scroll" size=${15} /> Crea voce dal log</${Button}>
      </div>
      <div class="jr-list" data-testid="journal-list">
        ${list.map((j) => html`<button class="jr-item ${j.id === entryId ? 'selected' : ''}" onClick=${() => open(j.id)} data-testid="journal-item" data-id=${j.id}>
          <span class="jr-date">${fmtDate(j.date)}</span>
          <b>${j.title || 'Senza titolo'}</b>
          ${j.body && html`<span class="jr-snip">${snippet(j.body)}</span>`}
          ${(j.tags || []).length > 0 && html`<span class="jr-tagrow">${j.tags.map((t) => html`<span class="tag">${t}</span>`)}</span>`}
        </button>`)}
        ${!list.length && html`<div class="jr-empty faint">${all.length ? 'Nessuna voce corrisponde alla ricerca.' : 'Il diario è vuoto: crea la prima voce.'}</div>`}
      </div>
    </section>
    <section class="jr-main">
      ${selected ? html`<${EntryEditor} key=${selected.id} entry=${selected} campaign=${campaign} navigate=${navigate} onDeleted=${() => navigate('journal')} />`
        : html`<${Empty} title="Diario della campagna">Scrivi un resoconto per ogni sessione, oppure generane la bozza dal log con «Crea voce dal log».</${Empty}>`}
    </section>
    <${FromLogModal} open=${fromLog} campaign=${campaign} onClose=${() => setFromLog(false)} onCreated=${(e) => { open(e.id); toast('Bozza creata dal log', 'good'); }} />
  </div>`;
}
