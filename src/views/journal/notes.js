// Note della campagna (collezione notes), con note fissate in alto.
import { html } from '../../vendor/preact-htm.js';
import { Button, ConfirmButton, Empty } from '../../components/ui.js';
import { Icon } from '../../components/icons.js';
import { useCollection, useDoc, useDebouncedCommit } from '../../lib/hooks.js';
import * as store from '../../lib/store.js';

function NoteCard({ note }) {
  const [, patch] = useDoc('notes', note.id);
  const [title, setTitle] = useDebouncedCommit(note.title || '', (v) => patch({ title: v }), 300);
  const [body, setBody] = useDebouncedCommit(note.body || '', (v) => patch({ body: v }), 400);
  return html`<div class="note-card ${note.pinned ? 'pinned' : ''}" data-testid="note-card" data-id=${note.id}>
    <div class="note-head">
      <input class="note-title" value=${title} placeholder="Titolo" onInput=${(e) => setTitle(e.currentTarget.value)} data-testid="note-title" />
      <button class="icon-btn ${note.pinned ? 'on' : ''}" title=${note.pinned ? 'Sblocca' : 'Fissa in alto'} onClick=${() => patch({ pinned: !note.pinned })} data-testid="note-pin"><${Icon} name="pin" size=${16} /></button>
    </div>
    <textarea class="note-body" value=${body} placeholder="PNG, luoghi, indizi, promesse fatte…" onInput=${(e) => setBody(e.currentTarget.value)} data-testid="note-body"></textarea>
    <div class="note-foot"><span class="faint">${new Date(note.updatedAt || note.createdAt).toLocaleDateString('it-IT')}</span>
      <${ConfirmButton} variant="ghost" confirmText="Eliminare?" onConfirm=${() => store.remove('notes', note.id)}><${Icon} name="trash" size=${13} /></${ConfirmButton}></div>
  </div>`;
}

export function CampaignNotes({ campaign }) {
  const notes = useCollection('notes', (n) => n.campaignId === campaign.id)
    .sort((a, b) => (b.pinned - a.pinned) || String(b.createdAt).localeCompare(String(a.createdAt)));
  const add = () => store.put('notes', { campaignId: campaign.id, title: '', body: '', pinned: false });
  return html`<div class="notes-wrap">
    <div class="row notes-tools">
      <span class="faint">${notes.filter((n) => n.pinned).length} fissate · ${notes.length} totali</span>
      <span class="spacer"></span>
      <${Button} variant="primary" size="sm" onClick=${add} data-testid="note-new"><${Icon} name="plus" size=${15} /> Nuova nota</${Button}>
    </div>
    ${notes.length ? html`<div class="notes-grid" data-testid="notes-grid">${notes.map((n) => html`<${NoteCard} key=${n.id} note=${n} />`)}</div>`
      : html`<${Empty} title="Nessuna nota">Le note fissate restano in cima: comode per PNG ricorrenti, missioni aperte e indizi.</${Empty}>`}
  </div>`;
}
